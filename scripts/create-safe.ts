import "dotenv/config";
import { config } from "../src/lib/config";
import { createSafeForAgent } from "../src/lib/safe-client";
import { SplitV2Client } from "@0xsplits/splits-sdk";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

async function main() {
  try {
    // First verify we have the required environment variables
    if (!process.env.AGENT_ADDRESS || !process.env.AGENT_PRIVATE_KEY) {
      console.error("\n❌ Missing environment variables!");
      console.log("\nMake sure your .env file has:");
      console.log("AGENT_ADDRESS=", process.env.AGENT_ADDRESS || "not set ❌");
      console.log(
        "AGENT_PRIVATE_KEY=",
        process.env.AGENT_PRIVATE_KEY ? "set ✅" : "not set ❌"
      );
      process.exit(1);
    }

    if (!process.env.SPLITS_API_KEY) {
      console.error("\n❌ Missing Splits API key!");
      console.log("\nGet your API key from app.splits.org/settings");
      console.log("Add it to your .env file as SPLITS_API_KEY");
      process.exit(1);
    }

    console.log("\n🔄 Creating new Safe...");
    const { client, safeAddress } = await createSafeForAgent();

    console.log("\n✅ Safe created successfully!");
    console.log("Safe Address:", safeAddress);
    console.log("\nYou can view your Safe at:");
    console.log(`https://app.safe.global/home?safe=sep:${safeAddress}`);

    // Initialize Splits client
    console.log("\n🔄 Initializing Splits client...");
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http("https://rpc.ankr.com/eth_sepolia"),
    });

    const account = privateKeyToAccount(
      config.safe.agentPrivateKey as `0x${string}`
    );
    const walletClient = createWalletClient({
      account,
      chain: sepolia,
      transport: http("https://rpc.ankr.com/eth_sepolia"),
    });

    const splitsClient = new SplitV2Client({
      chainId: sepolia.id,
      publicClient,
      walletClient,
      includeEnsNames: false,
      apiConfig: {
        apiKey: process.env.SPLITS_API_KEY,
      },
    });

    console.log("\n✅ Splits client initialized!");
    console.log("\nYour setup is complete. You can now:");
    console.log("1. Analyze GitHub repositories");
    console.log("2. Create splits contracts through your Safe");
    console.log("3. Manage revenue distribution");
  } catch (error) {
    console.error(
      "\n❌ Error during setup:",
      error instanceof Error ? error.message : error
    );
  }
}

main();
