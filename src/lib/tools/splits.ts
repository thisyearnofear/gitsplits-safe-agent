import { z } from "zod";
import { ethers } from "ethers";
import { config } from "../config";
import { getSafeClient } from "../safe-client";
import type { Contributor } from "./github";

// Simple splits contract ABI (we'll implement this contract later)
const SPLITS_ABI = [
  "function initialize(address[] calldata payees, uint256[] calldata shares)",
  "function claim(string calldata socialId, address wallet)",
  "function updateShares(address[] calldata payees, uint256[] calldata shares)",
  "function release(address payable account)",
];

export interface SplitsConfig {
  contributors: Contributor[];
  protocolFeeEnabled?: boolean;
  donationsEnabled?: boolean;
}

export async function createSplitsContract(input: SplitsConfig) {
  try {
    const safeClient = await getSafeClient();
    if (!safeClient) throw new Error("Safe client not initialized");

    // Convert contributors to payees and shares
    const payees: string[] = [];
    const shares: number[] = [];

    input.contributors.forEach((contributor) => {
      if (contributor.wallet) {
        payees.push(contributor.wallet);
        shares.push(Math.floor(contributor.percentage * 100)); // Convert percentage to basis points
      }
    });

    // For now, return a mock response
    // In reality, we would:
    // 1. Deploy the splits contract
    // 2. Initialize it with payees and shares
    // 3. Transfer ownership to the Safe
    return {
      success: true,
      contractAddress: "0x..." + Math.random().toString(16).substring(2, 8),
      payees,
      shares,
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
        username: z.string(),
        contributions: z.number(),
        percentage: z.number(),
        wallet: z.string().optional(),
        socials: z
          .object({
            github: z.string().optional(),
            twitter: z.string().optional(),
          })
          .optional(),
      })
    ),
    protocolFeeEnabled: z.boolean().optional(),
    donationsEnabled: z.boolean().optional(),
  }),
};
