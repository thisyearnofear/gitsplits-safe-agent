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

When encountering errors, format the response like this:
\`\`\`
Error Analyzing Repository: [owner]/[repo]
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
    // TODO: Implement splits contract tools
    // tool(
    //   async (input: SplitsConfig) => createSplitsContract(input),
    //   createSplitsContractMetadata
    // ),
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
