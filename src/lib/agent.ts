import "dotenv/config";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { MemorySaver } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { Client } from "langsmith";
import {
  BaseChatModel,
  BaseChatModelCallOptions,
} from "@langchain/core/language_models/chat_models";
import { BaseMessage, AIMessage } from "@langchain/core/messages";
import { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import { ChatResult } from "@langchain/core/outputs";

import { config } from "./config";
import {
  deployNewSafe,
  deployNewSafeMetadata,
  getEthBalance,
  getEthBalanceMetadata,
} from "./tools/safe";
import { getEthPriceUsd, getEthPriceUsdMetadata } from "./tools/prices";
import { multiply, multiplyMetadata } from "./tools/math";

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
  private tools: any[] = [];

  constructor(apiKey: string) {
    super({});
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  _llmType(): string {
    return "gemini";
  }

  bindTools(tools: any[]): this {
    this.tools = tools;
    return this;
  }

  async _generate(
    messages: BaseMessage[],
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun
  ): Promise<ChatResult> {
    const lastMessage = messages[messages.length - 1];
    const prompt = `You are a helpful AI assistant that can use tools to accomplish tasks. You have access to the following tools:

${this.tools.map((t) => `${t.name}: ${t.description}`).join("\n")}

To use a tool, use the following format:
Thought: I need to use X tool because...
Action: the name of the tool
Action Input: the input to the tool
Observation: the result of the tool

After using tools, you should provide a final answer in a clear format.

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
    tool(getEthBalance, getEthBalanceMetadata),
    tool(getEthPriceUsd, getEthPriceUsdMetadata),
    tool(multiply, multiplyMetadata),
    tool(deployNewSafe, deployNewSafeMetadata),
  ];

  const agentCheckpointer = new MemorySaver();

  const agent = createReactAgent({
    llm: geminiModel,
    tools: agentTools,
    checkpointSaver: agentCheckpointer,
  });

  const agentFinalState = await agent.invoke({
    messages: [new HumanMessage(prompt)],
  });

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
