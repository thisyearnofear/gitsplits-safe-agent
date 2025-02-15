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

// Create a proper LangChain chat model wrapper for Gemini
class GeminiChatModel extends BaseChatModel {
  private genAI: GoogleGenerativeAI;
  private tools: Array<{ name: string; description: string }> = [];

  constructor(apiKey: string) {
    super({});
    this.genAI = new GoogleGenerativeAI(apiKey);
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
    const prompt = `You are GitSplits, an AI agent that helps developers set up revenue sharing for their open source projects. You can:
1. Analyze GitHub repositories to determine contribution splits
2. Create and manage splits contracts through Safe accounts
3. Help contributors verify their identity and claim their share

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
1. Guide users through the GitHub verification process:
   - Create a verification gist with a unique nonce
   - Sign the verification message with their wallet
   - Submit the signature to complete verification
2. Explain that verification is required before claiming shares
3. Provide clear instructions for each step
4. Handle verification expiry and errors gracefully
5. Store verified wallet-GitHub associations securely

When handling Safe transactions:
1. Always verify the Safe client is initialized
2. Double-check transaction parameters before execution
3. Wait for transaction confirmations
4. Provide clear transaction status updates
5. Handle errors gracefully with clear messages

When encountering errors, format the response like this:
\`\`\`
Error: [exact error message]

Possible Solutions:
1. [solution 1]
2. [solution 2]
...
\`\`\`

For successful analyses, format repository analysis results exactly like this:
\`\`\`
Repository Analysis: [owner]/[repo]

[If fork] Fork of [original_owner]/[original_repo]
Original Repository:
- Contributors: [number]
- Total Commits: [number]
- Created: [date]
- URL: [github_url]
- Description: [description]

[If fork] Fork Statistics:
- Created: [fork_created_date]
- New Commits: [number]
- Last Push: [date]

Contributors (Original Repository):
[For each upstream contributor]
1. [username] (https://github.com/[username])
   - [number] commits ([percentage]%)
   - Original contributor
   - Last active: [date]

[If fork] Contributors (Fork):
[For each fork contributor]
1. [username] (https://github.com/[username])
   - [number] commits ([percentage]%)
   - Fork contributor
   - Last active: [date]
\`\`\`

For successful verification initiation, format the response like this:
\`\`\`
Identity Verification Started:
- GitHub Username: [username]
- Session ID: [session_id]
- Expires: [expiry_time]

Instructions:
1. Visit [gist_url]
2. Create a new public gist with the following content:
[verification_message]

3. Sign this message with your wallet ([wallet_address])
4. Submit the signature to complete verification

Note: This verification will expire in 1 hour.
\`\`\`

For successful splits creation, format the response like this:
\`\`\`
Split Contract Created:
- Address: [contract_address]
- Transaction: [tx_hash]
- Controller: [safe_address]

Recipients:
1. [username] ([wallet_address])
   - [percentage]% share
   - [number] commits
   - [Original/Fork] contributor
   - Verification Status: [Verified/Pending]

Distribution Details:
- Protocol Fee: [enabled/disabled]
- Distribution Type: Push (automatic)
- Controller: Safe Account

Next Steps:
1. Contributors must verify their GitHub identity
2. Link verified wallets to receive shares
3. Claim shares once verification is complete
\`\`\`

For general inquiries about capabilities, respond with:
\`\`\`
Hello! I'm GitSplits, your AI agent for setting up fair revenue sharing in open source projects. Here's what I can do:

1. 📊 Analyze GitHub Repositories
   - Analyze contribution patterns
   - Calculate fair revenue splits
   - Handle both original repos and forks
   - Track upstream vs fork contributions

2. 💰 Create Revenue Sharing Contracts
   - Deploy Splits contracts through Safe
   - Set up automatic distribution
   - Configure protocol fees
   - Manage recipient shares

3. 🔐 Identity & Claims
   - Verify GitHub identity through gists
   - Link GitHub profiles to wallets
   - Secure verification process
   - Handle share claiming

To get started, you can:
- Analyze a repo: "Analyze the repository owner/repo"
- Create a split: "Create a split for repository owner/repo"
- Verify identity: "Help me verify my GitHub account username"
- Claim share: "I want to claim my share from split_address"
\`\`\`

You have access to the following tools:
${this.tools.map((t) => `${t.name}: ${t.description}`).join("\n")}

To use a tool, use the following format:
Thought: I need to use X tool because...
Action: the name of the tool
Action Input: the input to the tool
Observation: the result of the tool

Human request: ${lastMessage.content}

Let's approach this step by step:

Thought: Let me think about what tools I need...`;

    // Log the prompt to LangSmith if available
    if (langsmith && runManager) {
      await runManager.handleText(prompt);
    }

    const model = this.genAI.getGenerativeModel({ model: "gemini-pro" });
    const result = await model.generateContent(prompt);
    const response = result.response.text();

    // Log the response to LangSmith if available
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

// Create the Gemini chat model instance
const geminiModel = new GeminiChatModel(config.model.geminiApiKey || "");

// Export the runAgent function
export async function runAgent(prompt: string) {
  const agentTools = [
    tool(
      async (input: { owner: string; repo: string }) =>
        analyzeRepository(input.owner, input.repo),
      analyzeRepositoryMetadata
    ),
    tool(async (input: SplitsConfig) => {
      // Validate input matches our expected format
      const { contributors, protocolFeeEnabled, donationsEnabled } = input;
      if (!Array.isArray(contributors)) {
        throw new Error("Contributors must be an array");
      }

      // Create the splits contract
      return createSplitsContract({
        contributors,
        protocolFeeEnabled,
        donationsEnabled,
      });
    }, createSplitsContractMetadata),
    tool(verifyIdentity, verifyIdentityMetadata),
    tool(claimShare, claimShareMetadata),
  ];

  const agentCheckpointer = new MemorySaver();

  const agent = createReactAgent({
    llm: geminiModel,
    tools: agentTools,
    checkpointSaver: agentCheckpointer,
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

// You can keep the main function for testing if needed
const main = async () => {
  const response = await runAgent(
    "What is the current balance of the Safe Multisig at the address 0x220866B1A2219f40e72f5c628B65D54268cA3A9D on chain id 1? Please answer in ETH and its total value in USD."
  );
  console.log(response);
};

// Only run main if this file is being executed directly
if (require.main === module) {
  main();
}
