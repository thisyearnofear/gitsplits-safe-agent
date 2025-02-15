import { z } from "zod";
import { SplitV2Client } from "@0xsplits/splits-sdk";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { config } from "../config";
import { getSafeClient, createAndExecuteSafeTransaction } from "../safe-client";
import type { Contributor } from "./github";

// Initialize Splits client with both public and wallet clients
const publicClient = createPublicClient({
  chain: sepolia,
  transport: http("https://rpc.ankr.com/eth_sepolia"),
});

// Create wallet client for signing transactions
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
    // TODO: Add Splits API key to .env
    apiKey: process.env.SPLITS_API_KEY || "",
  },
});

export interface SplitsConfig {
  contributors: Contributor[];
  protocolFeeEnabled?: boolean;
  donationsEnabled?: boolean;
}

export async function createSplitsContract(input: SplitsConfig) {
  try {
    const safeClient = await getSafeClient();
    if (!safeClient) throw new Error("Safe client not initialized");

    // Convert contributors to recipients format
    const recipients = input.contributors.map((contributor) => ({
      address: contributor.wallet || contributor.login || contributor.name,
      percentAllocation: contributor.percentage || 0,
    }));

    // Validate total allocation is 100%
    const totalAllocation = recipients.reduce(
      (sum, r) => sum + r.percentAllocation,
      0
    );
    if (Math.abs(totalAllocation - 100) > 0.0001) {
      throw new Error("Total allocation must equal 100%");
    }

    // Create split with Safe as controller
    const createSplitArgs = {
      recipients,
      distributorFeePercent: input.protocolFeeEnabled ? 1 : 0,
      // The Safe will be the controller
      controller: config.safe.agentAddress,
    };

    // First check if split already exists
    const { splitAddress, deployed } = await splitsClient.isDeployed(
      createSplitArgs
    );

    if (!deployed) {
      // Get calldata for creating the split
      const callData = await splitsClient.callData.createSplit(createSplitArgs);

      // Create and execute transaction through Safe
      console.error("Creating split through Safe:", {
        splitAddress,
        callData,
        recipients,
      });

      // Extract the contract address and data from the callData
      const { address: contractAddress, data } = callData;

      const txResult = await createAndExecuteSafeTransaction({
        to: contractAddress,
        data,
      });

      console.error("Split created:", {
        splitAddress,
        txHash: txResult.hash,
      });
    } else {
      console.error("Split already deployed at:", splitAddress);
    }

    return {
      success: true,
      contractAddress: splitAddress,
      payees: recipients.map((r) => r.address),
      shares: recipients.map((r) => r.percentAllocation * 100), // Convert to basis points
    };
  } catch (error) {
    throw new Error(
      `Failed to create splits contract: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

export const createSplitsContractMetadata = {
  name: "createSplitsContract",
  description:
    "Create a new splits contract owned by the Safe to handle revenue sharing.",
  schema: z.object({
    contributors: z.array(
      z.object({
        login: z.string().nullable(),
        name: z.string(),
        email: z.string(),
        commits: z.number(),
        upstreamCommits: z.number(),
        forkCommits: z.number(),
        lastActive: z.string(),
        isUpstreamContributor: z.boolean(),
        isForkContributor: z.boolean(),
        percentage: z.number(),
        wallet: z.string().optional(),
      })
    ),
    protocolFeeEnabled: z.boolean().optional(),
    donationsEnabled: z.boolean().optional(),
  }),
};
