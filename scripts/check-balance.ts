import "dotenv/config";
import { createPublicClient, http, formatEther } from "viem";
import { sepolia } from "viem/chains";
import { config } from "../src/lib/config";

async function main() {
  const client = createPublicClient({
    chain: sepolia,
    transport: http("https://rpc.ankr.com/eth_sepolia"),
  });

  if (!config.safe.agentAddress) {
    throw new Error("Agent address not found in .env");
  }

  console.log("\n🔍 Checking balance for address:", config.safe.agentAddress);

  const balance = await client.getBalance({
    address: config.safe.agentAddress as `0x${string}`,
  });

  console.log("\nBalance:", formatEther(balance), "ETH");
  console.log("Raw balance:", balance.toString(), "wei");

  // Also print the environment variables to debug
  console.log("\n📝 Environment variables:");
  console.log("AGENT_ADDRESS:", process.env.AGENT_ADDRESS);
  console.log(
    "AGENT_PRIVATE_KEY:",
    process.env.AGENT_PRIVATE_KEY ? "Set ✅" : "Not set ❌"
  );
}

main().catch(console.error);
