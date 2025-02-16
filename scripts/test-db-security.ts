import { db, DatabaseError } from "../src/lib/services/database";
import { ethers } from "ethers";

async function main() {
  try {
    console.log("🔒 Testing Database Security\n");

    // Test 1: Create a Safe Account
    console.log("Test 1: Creating Safe Account");
    const safeAccount = await db.createSafeAccount({
      address: "0x1234567890123456789012345678901234567890",
      chainId: 11155111, // Sepolia
      ownerAddress: "0x9876543210987654321098765432109876543210",
    });
    console.log("✅ Safe Account created:", safeAccount.id);

    // Test 2: Create a Splits Contract
    console.log("\nTest 2: Creating Splits Contract");
    const splitsContract = await db.createSplitsContract({
      address: "0x2234567890123456789012345678901234567890",
      safeId: safeAccount.id,
      chainId: 11155111,
      controller: safeAccount.address,
      contributors: [
        {
          githubUsername: "alice",
          percentage: 50,
        },
        {
          githubUsername: "bob",
          percentage: 50,
        },
      ],
    });
    console.log("✅ Splits Contract created:", splitsContract.id);

    // Test 3: Update Contributor
    console.log("\nTest 3: Updating Contributor");
    const contributor = splitsContract.contributors[0];
    const updatedContributor = await db.updateContributor({
      id: contributor.id,
      walletAddress: "0x3234567890123456789012345678901234567890",
      verificationStatus: "PENDING",
    });
    console.log("✅ Contributor updated:", updatedContributor.id);

    // Test 4: Create Verification Session
    console.log("\nTest 4: Creating Verification Session");
    const verificationSession = await db.createVerificationSession({
      contributorId: contributor.id,
      nonce: ethers.hexlify(ethers.randomBytes(32)),
      message: "Test verification message",
      expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
    });
    console.log("✅ Verification Session created:", verificationSession.id);

    // Test 5: Create Access Key
    console.log("\nTest 5: Creating Access Key");
    const accessKey = await db.createAccessKey({
      safeId: safeAccount.id,
      permissions: {
        canView: true,
        canExecute: false,
        canModify: false,
      },
      expiresAt: new Date(Date.now() + 86400000), // 24 hours from now
    });
    console.log("✅ Access Key created:", accessKey.id);

    // Test 6: Validate Access Key
    console.log("\nTest 6: Validating Access Key");
    const validatedKey = await db.validateAccessKey(
      accessKey.key,
      safeAccount.id
    );
    console.log("✅ Access Key validated:", validatedKey.id);

    // Test 7: Query Safe Account with Relations
    console.log("\nTest 7: Querying Safe Account with Relations");
    const fullSafeAccount = await db.getSafeAccount(safeAccount.address);
    console.log("✅ Safe Account retrieved with:");
    console.log(
      `   - ${fullSafeAccount?.splitsContracts.length} Splits Contracts`
    );
    console.log(`   - ${fullSafeAccount?.accessKeys.length} Access Keys`);

    // Test 8: Invalid Input Handling
    console.log("\nTest 8: Testing Invalid Input Handling");
    try {
      await db.createSafeAccount({
        address: "invalid-address",
        chainId: -1,
        ownerAddress: "also-invalid",
      });
    } catch (error) {
      if (error instanceof DatabaseError) {
        console.log("✅ Invalid input correctly rejected:", error.message);
      } else {
        console.error("❌ Unexpected error type:", error);
      }
    }

    console.log("\n✨ All tests completed successfully!");
  } catch (error) {
    if (error instanceof DatabaseError) {
      console.error("\n❌ Test failed:", error.message, "\nCode:", error.code);
    } else {
      console.error("\n❌ Test failed with unexpected error:", error);
    }
    process.exit(1);
  }
}

main();
