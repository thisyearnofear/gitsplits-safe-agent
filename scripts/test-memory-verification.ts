import { db } from "../src/lib/services/database.js";
import {
  runAgent,
  clearAgentMemory,
  getAgentMemory,
} from "../src/lib/agent.js";
import { config } from "../src/lib/config.js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  try {
    console.log("Starting memory and verification tests...\n");

    // Test 1: Repository Analysis Caching
    console.log("Test 1: Repository Analysis Caching");
    const owner = "gitsplits";
    const repo = "test-repo";

    console.log("- First analysis (should cache)");
    const firstResponse = await runAgent(
      `Analyze the repository ${owner}/${repo} for contribution splits.`
    );
    console.log("Response:", firstResponse);

    console.log("\n- Second analysis (should use cache)");
    const secondResponse = await runAgent(
      `Analyze the repository ${owner}/${repo} for contribution splits again.`
    );
    console.log("Response:", secondResponse);

    // Test 2: Conversation History
    console.log("\nTest 2: Conversation History");
    const memory = getAgentMemory();
    const history = await memory.getConversationHistory();
    console.log("- Conversation history length:", history.length);
    console.log("- Last message:", history[history.length - 1]);

    // Test 3: Batch Verification Status
    console.log("\nTest 3: Batch Verification Status");
    const contributors = ["user1", "user2", "user3"];
    console.log("- Checking verification status for:", contributors.join(", "));
    const verificationStatus = await db.getVerificationStatusForContributors(
      contributors
    );
    console.log("Status:", verificationStatus);

    // Test 4: Verification Session Management
    console.log("\nTest 4: Verification Session Management");

    // First create a test safe account
    console.log("- Creating test safe account");
    const safeAccount = await prisma.safeAccount.create({
      data: {
        address: "0x1234567890123456789012345678901234567890",
        chainId: 11155111,
        ownerAddress: "0x9876543210987654321098765432109876543210",
      },
    });

    // Then create a test splits contract
    console.log("- Creating test splits contract");
    const splitsContract = await prisma.splitsContract.create({
      data: {
        address: "0x2234567890123456789012345678901234567890",
        chainId: 11155111,
        controller: "0x1234567890123456789012345678901234567890",
        safeId: safeAccount.id,
      },
    });

    // Create a test contributor
    console.log("- Creating test contributor");
    const contributor = await prisma.contributor.create({
      data: {
        githubUsername: "test-user",
        percentage: 100,
        verificationStatus: "PENDING",
        splitsContractId: splitsContract.id,
      },
    });

    // Create an expired session
    const expiredDate = new Date();
    expiredDate.setHours(expiredDate.getHours() - 1);

    console.log("- Creating verification session");
    await db.createVerificationSession({
      contributorId: contributor.id,
      nonce: "test-nonce",
      message: "Test verification message",
      expiresAt: expiredDate,
    });

    console.log("- Cleaning up expired sessions");
    const cleanedCount = await db.cleanupExpiredVerificationSessions();
    console.log("- Expired sessions cleaned:", cleanedCount);

    // Test 5: Memory Cleanup
    console.log("\nTest 5: Memory Cleanup");
    await clearAgentMemory();
    const newHistory = await memory.getConversationHistory();
    console.log("- Conversation history after cleanup:", newHistory.length);

    // Cleanup test data
    console.log("\nCleaning up test data...");
    await prisma.verificationSession.deleteMany({
      where: { contributorId: contributor.id },
    });
    await prisma.contributor.delete({ where: { id: contributor.id } });
    await prisma.splitsContract.delete({ where: { id: splitsContract.id } });
    await prisma.safeAccount.delete({ where: { id: safeAccount.id } });

    console.log("\nAll tests completed!");
  } catch (error) {
    console.error("Test failed:", error);
    // Print the full error stack for debugging
    if (error instanceof Error) {
      console.error("Stack trace:", error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the tests
main();
