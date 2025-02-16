import "dotenv/config";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { MemorySaver } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { Client } from "langsmith";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { BaseMessage, AIMessage } from "@langchain/core/messages";
import { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import { ChatResult } from "@langchain/core/outputs";
import { db } from "./services/database";
import type { VerificationRequest } from "./tools/identity";
import type { Contributor } from "./tools/github";

import { config } from "./config";
import { analyzeRepository, analyzeRepositoryMetadata } from "./tools/github";
import {
  createSplitsContract,
  createSplitsContractMetadata,
  SplitsConfig,
} from "./tools/splits";
import {
  verifyIdentity,
  verifyIdentityMetadata,
  claimShare,
  claimShareMetadata,
} from "./tools/identity";

// Initialize LangSmith client if configured
let langsmith: Client | null = null;
if (config.langsmith.apiKey && config.langsmith.tracing) {
  langsmith = new Client({
    apiUrl: "https://api.smith.langchain.com",
    apiKey: config.langsmith.apiKey,
  });
}

interface AgentState {
  messages: BaseMessage[];
  [key: string]: any;
}

interface VerificationStatus {
  githubUsername: string;
  isVerified: boolean;
  lastVerificationAttempt?: Date;
  status: string;
}

// Memory management for the agent
class AgentMemory extends MemorySaver {
  private conversationHistory: Array<{
    role: string;
    content: string;
    timestamp: number;
  }> = [];

  async saveState(state: AgentState) {
    // Save conversation to history
    if (state.messages && state.messages.length > 0) {
      const lastMessage = state.messages[state.messages.length - 1];
      this.conversationHistory.push({
        role: lastMessage instanceof HumanMessage ? "human" : "assistant",
        content:
          typeof lastMessage.content === "string"
            ? lastMessage.content
            : JSON.stringify(lastMessage.content),
        timestamp: Date.now(),
      });
    }
  }

  async getConversationHistory() {
    return this.conversationHistory;
  }

  async clearConversationHistory() {
    this.conversationHistory = [];
  }
}

// Enhanced repository analysis with database caching
async function cachedAnalyzeRepository(owner: string, repo: string) {
  const cached = await db.getRepositoryAnalysisCache(owner, repo);

  if (cached) {
    console.error("Using cached analysis for", `${owner}/${repo}`);
    return cached.analysis;
  }

  const result = await analyzeRepository(owner, repo);
  await db.cacheRepositoryAnalysis({
    owner,
    repo,
    analysis: result,
  });

  return result;
}

// Enhanced splits contract creation with batch verification
async function enhancedCreateSplitsContract(input: SplitsConfig) {
  // Verify all contributors have completed identity verification
  const contributorsToVerify = input.contributors
    .filter((c) => c.wallet)
    .map((c) => c.name);

  if (contributorsToVerify.length > 0) {
    const verificationStatus = await db.getVerificationStatusForContributors(
      contributorsToVerify
    );

    const unverifiedContributors = verificationStatus
      .filter((status: VerificationStatus) => !status.isVerified)
      .map((status: VerificationStatus) => status.githubUsername);

    if (unverifiedContributors.length > 0) {
      throw new Error(
        `Contributors ${unverifiedContributors.join(
          ", "
        )} need to complete identity verification`
      );
    }
  }

  return await createSplitsContract(input);
}

// Enhanced identity verification with session cleanup
async function enhancedVerifyIdentity(input: VerificationRequest) {
  // Cleanup any expired sessions first
  await db.cleanupExpiredVerificationSessions();

  const result = await verifyIdentity(input);

  // Store verification attempt in database
  await db.createVerificationSession({
    contributorId: input.socialId,
    nonce: result.sessionId,
    message: result.message,
    expiresAt: new Date(result.expiresAt),
  });

  return result;
}

// Create the Gemini chat model instance with enhanced context
class GeminiChatModel extends BaseChatModel {
  private genAI: GoogleGenerativeAI;
  private tools: Array<{ name: string; description: string }> = [];
  private memory: AgentMemory;

  constructor(apiKey: string, memory: AgentMemory) {
    super({});
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.memory = memory;
  }

  _llmType(): string {
    return "gemini";
  }

  bindTools(tools: Array<{ name: string; description: string }>): this {
    this.tools = tools;
    return this;
  }

  async _generate(
    messages: BaseMessage[],
    _options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun
  ): Promise<ChatResult> {
    const lastMessage = messages[messages.length - 1];
    const history = await this.memory.getConversationHistory();

    const prompt = `You are GitSplits, an AI agent that helps developers set up revenue sharing for their open source projects. You can:
1. Analyze GitHub repositories to determine contribution splits
2. Create and manage splits contracts through Safe accounts
3. Help contributors verify their identity and claim their share

Previous conversation context:
${history.map((m) => `${m.role}: ${m.content}`).join("\n")}

IMPORTANT: When analyzing repositories:
1. NEVER make up or hallucinate contributors - only report actual contributors from the API response
2. If you encounter any errors (rate limits, missing data, etc.), clearly explain the issue to the user
3. Always clearly distinguish between:
   - Original repository contributors
   - Fork contributors (if it's a fork)
4. Include exact commit counts and percentages
5. Provide GitHub profile URLs for verification

When creating splits contracts:
1. Ensure all contributors have valid wallet addresses through verification
2. Verify total allocation equals 100%
3. Use the Safe account to deploy and control the splits contract
4. Explain the distribution mechanism to users
5. Provide the contract address and transaction details

When handling identity verification:
1. Guide users through the GitHub verification process step by step
2. Ensure verification sessions are properly stored and tracked
3. Handle verification expiry gracefully
4. Maintain security throughout the process

When handling Safe transactions:
1. Always verify the Safe client is initialized
2. Double-check transaction parameters
3. Wait for confirmations
4. Provide clear status updates

You have access to the following tools:
${this.tools.map((t) => `${t.name}: ${t.description}`).join("\n")}

Human request: ${lastMessage.content}

Let's approach this step by step:

Thought: Let me think about what tools I need...`;

    if (langsmith && runManager) {
      await runManager.handleText(prompt);
    }

    const model = this.genAI.getGenerativeModel({ model: "gemini-pro" });
    const result = await model.generateContent(prompt);
    const response = result.response.text();

    if (langsmith && runManager) {
      await runManager.handleText(response);
    }

    return {
      generations: [
        {
          text: response,
          message: new AIMessage(response),
          generationInfo: {},
        },
      ],
    };
  }
}

// Initialize memory and model
const agentMemory = new AgentMemory();
const geminiModel = new GeminiChatModel(
  config.model.geminiApiKey || "",
  agentMemory
);

// Enhanced tool set with persistence and caching
const agentTools = [
  tool(
    async (input: { owner: string; repo: string }) =>
      cachedAnalyzeRepository(input.owner, input.repo),
    analyzeRepositoryMetadata
  ),
  tool(
    async (input: SplitsConfig) => enhancedCreateSplitsContract(input),
    createSplitsContractMetadata
  ),
  tool(
    async (input: VerificationRequest) => enhancedVerifyIdentity(input),
    verifyIdentityMetadata
  ),
  tool(claimShare, claimShareMetadata),
];

// Export the enhanced runAgent function
export async function runAgent(prompt: string) {
  const agent = createReactAgent({
    llm: geminiModel,
    tools: agentTools,
    checkpointSaver: agentMemory,
  });

  const agentFinalState = await agent.invoke(
    {
      messages: [new HumanMessage(prompt)],
    },
    {
      configurable: {
        thread_id: "gitsplits-" + Date.now().toString(),
      },
    }
  );

  return agentFinalState.messages[agentFinalState.messages.length - 1].content;
}

// Add a function to clear agent memory if needed
export async function clearAgentMemory() {
  await agentMemory.clearConversationHistory();
}

// Export memory access for testing
export const getAgentMemory = () => agentMemory;

// Export the main function for testing if needed
export const testMain = async () => {
  const response = await runAgent(
    "What is the current balance of the Safe Multisig at the address 0x220866B1A2219f40e72f5c628B65D54268cA3A9D on chain id 1? Please answer in ETH and its total value in USD."
  );
  console.log(response);
};
