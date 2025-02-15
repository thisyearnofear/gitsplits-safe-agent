import "dotenv/config";
import { config } from "../src/lib/config";
import { createSafeForAgent } from "../src/lib/safe-client";

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

    console.log("\n🔄 Creating new Safe...");
    const { client, safeAddress } = await createSafeForAgent();

    console.log("\n✅ Safe created successfully!");
    console.log("Safe Address:", safeAddress);
    console.log("\nYou can view your Safe at:");
    console.log(`https://app.safe.global/home?safe=sep:${safeAddress}`);
  } catch (error) {
    console.error(
      "\n❌ Error creating Safe:",
      error instanceof Error ? error.message : error
    );
  }
}

main();
