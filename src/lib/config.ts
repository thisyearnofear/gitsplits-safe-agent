import { sepolia } from "viem/chains";

export const config = {
  // LangSmith Configuration
  langsmith: {
    apiKey: process.env.LANGCHAIN_API_KEY,
    projectName: process.env.LANGCHAIN_PROJECT || "Safe Agent",
    tracing: process.env.LANGCHAIN_TRACING_V2 === "true",
  },

  // Safe Configuration
  safe: {
    rpcUrl: "https://rpc.ankr.com/eth_sepolia",
    chain: sepolia,
    agentAddress: process.env.AGENT_ADDRESS as string,
    agentPrivateKey: process.env.AGENT_PRIVATE_KEY as string,
  },

  // Model Configuration
  model: {
    geminiApiKey: process.env.GEMINI_API_KEY,
  },
};
