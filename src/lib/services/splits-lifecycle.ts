import { db } from "./database";
import { ethers } from "ethers";
import { SplitV2Client } from "@0xsplits/splits-sdk";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { config } from "../config";
import { createAndExecuteSafeTransaction } from "../safe-client";

// Initialize clients
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

interface SplitRecipient {
  address: string;
  percentAllocation: number;
}

interface Contributor {
  id: string;
  githubUsername: string;
  walletAddress?: string;
  percentage: number;
  verificationStatus: string;
}

interface Claim {
  id: string;
  amount: number;
  status: string;
}

const splitsClient = new SplitV2Client({
  chainId: sepolia.id,
  publicClient,
  walletClient,
  includeEnsNames: false,
  apiConfig: {
    apiKey: process.env.SPLITS_API_KEY || "",
  },
});

export class SplitsLifecycleService {
  // Create initial splits setup with pending invitations
  async createSplitsWithInvitations(params: {
    safeId: string;
    contributors: Array<{
      githubUsername: string;
      email?: string;
      percentage: number;
    }>;
  }) {
    const { safeId, contributors } = params;

    // Create the splits contract first
    const contract = await db.createSplitsContract({
      address: ethers.hexlify(ethers.randomBytes(20)),
      safeId,
      chainId: sepolia.id,
      controller: config.safe.agentAddress,
      contributors: contributors.map(
        (c: { githubUsername: string; percentage: number }) => ({
          githubUsername: c.githubUsername,
          percentage: c.percentage,
        })
      ),
    });

    // Create invitations for contributors
    for (const contributor of contributors) {
      if (contributor.email) {
        const token = ethers.hexlify(ethers.randomBytes(32));
        const dbContributor = contract.contributors.find(
          (c) => c.githubUsername === contributor.githubUsername
        );

        if (dbContributor) {
          await db.createContributorInvitation({
            splitsContractId: contract.id,
            contributorId: dbContributor.id,
            email: contributor.email,
            token,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          });

          // TODO: Send invitation email
        }
      }
    }

    return contract;
  }

  // Accept invitation and start verification process
  async acceptInvitation(token: string, walletAddress: string) {
    const invitation = await db.getContributorInvitation(token);
    if (!invitation) {
      throw new Error("Invalid invitation token");
    }

    if (invitation.status !== "PENDING") {
      throw new Error("Invitation is no longer valid");
    }

    if (invitation.expiresAt < new Date()) {
      await db.updateContributorInvitation(invitation.id, {
        status: "EXPIRED",
      });
      throw new Error("Invitation has expired");
    }

    // Update contributor with wallet address
    await db.updateContributor({
      id: invitation.contributorId,
      walletAddress,
      verificationStatus: "PENDING",
    });

    // Update invitation status
    await db.updateContributorInvitation(invitation.id, { status: "ACCEPTED" });

    return invitation;
  }

  // Monitor splits contract for new funds
  async checkForNewFunds(splitsContractId: string) {
    const contract = await db.getSplitsContract(splitsContractId);
    if (!contract) {
      throw new Error("Splits contract not found");
    }

    const balance = await publicClient.getBalance({
      address: contract.address as `0x${string}`,
    });

    if (balance > BigInt(0)) {
      // Create new distribution record
      const distribution = await db.createDistribution({
        splitsContractId,
        amount: Number(balance),
        status: "PENDING",
      });

      // Create pending claims for verified contributors
      for (const contributor of contract.contributors) {
        if (contributor.verificationStatus === "VERIFIED") {
          await db.createClaim({
            contributorId: contributor.id,
            distributionId: distribution.id,
            amount: (Number(balance) * contributor.percentage) / 100,
            status: "PENDING",
          });
        }
      }

      return distribution;
    }

    return null;
  }

  // Process pending distributions
  async processPendingDistributions() {
    const pendingDistributions = await db.getPendingDistributions();

    for (const distribution of pendingDistributions) {
      try {
        const verifiedContributors =
          distribution.splitsContract.contributors.filter(
            (c: Contributor) =>
              c.verificationStatus === "VERIFIED" && c.walletAddress
          );

        // Get the split contract details
        const { address: splitAddress } =
          await splitsClient.callData.createSplit({
            recipients: verifiedContributors.map((c: Contributor) => ({
              address: c.walletAddress!,
              percentAllocation: c.percentage,
            })),
            distributorFeePercent: 1, // 1% protocol fee
          });

        // Execute distribution through Safe
        const txResult = await createAndExecuteSafeTransaction({
          to: splitAddress,
          data: "0x", // Trigger distribution
          value: distribution.amount.toString(),
        });

        // Update distribution status
        await db.updateDistribution(distribution.id, {
          status: "COMPLETED",
          txHash: txResult.hash,
        });

        // Update claims status
        for (const claim of distribution.claims) {
          await db.updateClaim(claim.id, {
            status: "COMPLETED",
            txHash: txResult.hash,
          });
        }
      } catch (error) {
        console.error("Failed to process distribution:", error);
        await db.updateDistribution(distribution.id, {
          status: "FAILED",
        });
      }
    }
  }

  // Get claimable amount for a contributor
  async getClaimableAmount(contributorId: string) {
    const claims = await db.getContributorClaims(contributorId);
    return claims.reduce((total: number, claim: Claim) => {
      if (claim.status === "COMPLETED") {
        return total + claim.amount;
      }
      return total;
    }, 0);
  }
}

// Export singleton instance
export const splitsLifecycle = new SplitsLifecycleService();
