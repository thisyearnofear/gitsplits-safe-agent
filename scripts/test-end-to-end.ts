import { runAgent } from "../src/lib/agent";
import { db } from "../src/lib/services/database";
import { config } from "../src/lib/config";
import { createPublicClient, http, formatEther } from "viem";
import { sepolia } from "viem/chains";

async function main() {
  try {
    console.log("🚀 Starting End-to-End Test\n");

    // Step 1: Analyze Repository
    console.log("Step 1: Analyzing Repository");
    const analysisResponse = await runAgent(
      "Analyze the repository gitsplits/test-repo and show me the contribution splits."
    );
    console.log("Analysis Response:", analysisResponse);

    // Step 2: Create Safe and Splits Contract
    console.log("\nStep 2: Creating Safe and Splits Contract");
    const createResponse = await runAgent(
      "Create a splits contract for gitsplits/test-repo with the analyzed contributions. Enable protocol fees."
    );
    console.log("Creation Response:", createResponse);

    // Extract Safe and Splits addresses from response
    // Note: We'll need to parse these from the agent's response
    const safeAddress = ""; // TODO: Extract from response
    const splitsAddress = ""; // TODO: Extract from response

    // Step 3: Monitor Safe Balance
    console.log("\nStep 3: Monitoring Safe Balance");
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http("https://rpc.ankr.com/eth_sepolia"),
    });

    const balance = await publicClient.getBalance({
      address: safeAddress as `0x${string}`,
    });
    console.log("Safe Balance:", formatEther(balance), "ETH");

    // Step 4: Contributor Verification
    console.log("\nStep 4: Testing Contributor Verification");
    const verifyResponse = await runAgent(
      `I am a contributor to gitsplits/test-repo with GitHub username "test-user". 
       I want to verify my identity and claim my share. My wallet address is 0x1234567890123456789012345678901234567890.`
    );
    console.log("Verification Response:", verifyResponse);

    // Step 5: Distribution
    console.log("\nStep 5: Testing Distribution");
    const distributeResponse = await runAgent(
      `Distribute the available funds in the splits contract at ${splitsAddress} to all verified contributors.`
    );
    console.log("Distribution Response:", distributeResponse);

    // Step 6: Withdrawal
    console.log("\nStep 6: Testing Withdrawal");
    const withdrawResponse = await runAgent(
      `I want to withdraw my share from the splits contract at ${splitsAddress}.`
    );
    console.log("Withdrawal Response:", withdrawResponse);

    console.log("\n✨ End-to-End Test Completed!");
  } catch (error) {
    console.error("Test failed:", error);
    process.exit(1);
  }
}

main();
