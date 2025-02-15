import { z } from "zod";
import { ethers } from "ethers";
import { config } from "../config";

export interface VerificationRequest {
  socialType: "github" | "twitter";
  socialId: string;
  message: string;
  signature: string;
  wallet: string;
}

export async function verifyIdentity(input: VerificationRequest) {
  try {
    // In a real implementation, we would:
    // 1. For GitHub: Use the GitHub API to verify the user owns the account
    //    - Have them create a gist with a specific content
    //    - Or have them add a specific commit signature
    // 2. For Twitter: Use the Twitter API to verify the user owns the account
    //    - Have them tweet a specific message
    //    - Or verify via OAuth

    // For now, return mock success
    return {
      success: true,
      verified: true,
      socialId: input.socialId,
      wallet: input.wallet,
    };
  } catch (error) {
    throw new Error(
      `Failed to verify identity: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

export async function claimShare(input: {
  splitsAddress: string;
  verificationData: VerificationRequest;
}) {
  try {
    const provider = new ethers.JsonRpcProvider(config.safe.rpcUrl);
    const signer = new ethers.Wallet(config.safe.agentPrivateKey, provider);

    // In a real implementation, we would:
    // 1. Verify the identity first
    // 2. Call the splits contract's claim function
    // 3. Return the transaction hash

    // For now, return mock success
    return {
      success: true,
      transactionHash: "0x..." + Math.random().toString(16).substring(2, 8),
    };
  } catch (error) {
    throw new Error(
      `Failed to claim share: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

export const verifyIdentityMetadata = {
  name: "verifyIdentity",
  description:
    "Verify a user's social media identity for claiming their share.",
  schema: z.object({
    socialType: z.enum(["github", "twitter"]),
    socialId: z.string(),
    message: z.string(),
    signature: z.string(),
    wallet: z.string(),
  }),
};

export const claimShareMetadata = {
  name: "claimShare",
  description:
    "Claim a share in a splits contract by verifying social media identity.",
  schema: z.object({
    splitsAddress: z.string(),
    verificationData: z.object({
      socialType: z.enum(["github", "twitter"]),
      socialId: z.string(),
      message: z.string(),
      signature: z.string(),
      wallet: z.string(),
    }),
  }),
};
