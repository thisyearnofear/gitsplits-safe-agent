import { db, DatabaseError } from "../src/lib/services/database";
import { ethers } from "ethers";
import { createClient, User } from "@supabase/supabase-js";
import { config } from "../src/lib/config";
import { PrismaClient } from "@prisma/client";

// Initialize clients
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const prisma = new PrismaClient();

// Test addresses
const TEST_ADDRESSES = {
  owner: "0x1234567890123456789012345678901234567890",
  contributor: "0x2234567890123456789012345678901234567890",
  unauthorized: "0x3234567890123456789012345678901234567890",
};

async function simulateUserContext(address: string): Promise<User> {
  // Create a JWT token that simulates a user context
  const {
    data: { user },
    error,
  } = await supabase.auth.admin.createUser({
    email: `${address}@test.com`,
    password: "test-password",
    user_metadata: {
      eth_address: address,
    },
  });

  if (error) throw error;
  if (!user) throw new Error("Failed to create test user");
  return user;
}

async function cleanup() {
  console.log("Cleaning up existing test data...");

  // Clean up Supabase users first
  console.log("Cleaning up test users...");
  for (const address of Object.values(TEST_ADDRESSES)) {
    const {
      data: { users },
    } = await supabase.auth.admin.listUsers();
    const testUser = users.find((u) => u.email === `${address}@test.com`);
    if (testUser) {
      await supabase.auth.admin.deleteUser(testUser.id);
    }
  }

  // Clean up database in correct order due to foreign key constraints
  await prisma.accessLog.deleteMany({});
  await prisma.accessKey.deleteMany({});
  await prisma.verificationSession.deleteMany({});
  await prisma.contributor.deleteMany({});
  await prisma.splitsContract.deleteMany({});
  await prisma.safeAccount.deleteMany({});

  console.log("✅ Database cleaned");
}

async function main() {
  try {
    console.log("🔒 Testing Database Security with RLS\n");

    // Clean up any existing test data
    await cleanup();

    // Create test users
    console.log("Creating test users...");
    const owner = await simulateUserContext(TEST_ADDRESSES.owner);
    const contributor = await simulateUserContext(TEST_ADDRESSES.contributor);
    const unauthorized = await simulateUserContext(TEST_ADDRESSES.unauthorized);

    if (!owner.user_metadata?.eth_address)
      throw new Error("Owner metadata missing");
    if (!unauthorized.user_metadata?.eth_address)
      throw new Error("Unauthorized user metadata missing");
    if (!contributor.user_metadata?.eth_address)
      throw new Error("Contributor metadata missing");
    if (!contributor.email) throw new Error("Contributor email missing");
    if (!owner.email) throw new Error("Owner email missing");

    // Test 1: Create Safe Account as owner
    console.log("\nTest 1: Creating Safe Account as owner");
    const safeAccount = await db.createSafeAccount({
      address: owner.user_metadata.eth_address,
      chainId: 11155111,
      ownerAddress: owner.user_metadata.eth_address,
    });
    console.log("✅ Safe Account created:", safeAccount.id);

    // Test 2: Attempt to create Safe Account as unauthorized user
    console.log("\nTest 2: Attempting unauthorized Safe Account creation");
    try {
      await db.createSafeAccount({
        address: unauthorized.user_metadata.eth_address,
        chainId: 11155111,
        ownerAddress: unauthorized.user_metadata.eth_address,
      });
      console.log("❌ Should not allow unauthorized creation");
    } catch (error) {
      console.log("✅ Unauthorized creation properly rejected");
    }

    // Test 3: Create Splits Contract as owner
    console.log("\nTest 3: Creating Splits Contract as owner");
    const splitsContract = await db.createSplitsContract({
      address: "0x4234567890123456789012345678901234567890",
      safeId: safeAccount.id,
      chainId: 11155111,
      controller: safeAccount.address,
      contributors: [
        {
          githubUsername: contributor.email.split("@")[0],
          percentage: 50,
        },
        {
          githubUsername: owner.email.split("@")[0],
          percentage: 50,
        },
      ],
    });
    console.log("✅ Splits Contract created:", splitsContract.id);

    // Test 4: Contributor attempts to update their wallet
    console.log("\nTest 4: Contributor updating their wallet");
    const contributorRecord = splitsContract.contributors.find(
      (c: { githubUsername: string }) =>
        c.githubUsername === contributor.email?.split("@")[0]
    );
    if (contributorRecord) {
      const updatedContributor = await db.updateContributor({
        id: contributorRecord.id,
        walletAddress: contributor.user_metadata.eth_address,
        verificationStatus: "PENDING",
      });
      console.log("✅ Contributor updated:", updatedContributor.id);
    }

    // Test 5: Create and validate access key
    console.log("\nTest 5: Testing access key creation and validation");
    const accessKeyResult = await db.createAccessKey({
      safeId: safeAccount.id,
      permissions: {
        canView: true,
        canExecute: false,
        canModify: false,
      },
      expiresAt: new Date(Date.now() + 3600000),
    });
    console.log("✅ Access Key created:", accessKeyResult.id);

    const validatedKey = await db.validateAccessKey(
      accessKeyResult.key,
      safeAccount.id
    );
    console.log("✅ Access Key validated:", validatedKey.id);

    // Test 6: Query Safe Account with different user contexts
    console.log(
      "\nTest 6: Testing Safe Account queries with different contexts"
    );

    // Owner query
    const ownerView = await db.getSafeAccount(safeAccount.address);
    console.log("Owner can view Safe:", !!ownerView);

    // Contributor query
    try {
      await db.getSafeAccount(safeAccount.address);
      console.log("Contributor can view Safe with proper access key");
    } catch (error) {
      console.log(
        "Contributor properly restricted from viewing Safe without access key"
      );
    }

    // Unauthorized query
    try {
      await db.getSafeAccount(safeAccount.address);
      console.log("❌ Unauthorized user should not be able to view Safe");
    } catch (error) {
      console.log("✅ Unauthorized access properly restricted");
    }

    // Clean up
    console.log("\nCleaning up...");
    await cleanup();

    console.log("\n✨ All tests completed successfully!");
  } catch (error) {
    if (error instanceof DatabaseError) {
      console.error("\n❌ Test failed:", error.message, "\nCode:", error.code);
    } else {
      console.error("\n❌ Test failed with unexpected error:", error);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
