import { z } from "zod";
import { ethers } from "ethers";
import { config } from "../config";
import { Octokit } from "@octokit/rest";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

// Initialize clients for blockchain interaction
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

export interface VerificationRequest {
  socialType: "github";
  socialId: string;
  message: string;
  signature: string;
  wallet: string;
}

export interface VerificationSession {
  id: string;
  socialType: "github";
  socialId: string;
  nonce: string;
  expiresAt: number;
  verified: boolean;
  wallet?: string;
}

// In-memory store for verification sessions (replace with database in production)
const verificationSessions = new Map<string, VerificationSession>();

async function createGistForVerification(username: string, content: string) {
  try {
    const gist = await octokit.gists.create({
      files: {
        "gitsplits-verification.txt": {
          content,
        },
      },
      public: true,
      description: "GitSplits Wallet Verification",
    });
    return gist.data.html_url;
  } catch (error) {
    throw new Error(
      `Failed to create verification gist: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

async function verifyGistContent(username: string, expectedContent: string) {
  try {
    const gists = await octokit.gists.listForUser({ username });
    const verificationGist = gists.data.find(
      (gist) =>
        gist.description === "GitSplits Wallet Verification" &&
        gist.files?.["gitsplits-verification.txt"]
    );

    if (!verificationGist) {
      return false;
    }

    const gistContent = await octokit.gists.get({
      gist_id: verificationGist.id,
    });
    const content =
      gistContent.data.files?.["gitsplits-verification.txt"]?.content;

    return content === expectedContent;
  } catch (error) {
    throw new Error(
      `Failed to verify gist: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

export async function verifyIdentity(input: VerificationRequest) {
  try {
    // Generate a unique session ID and nonce
    const sessionId = ethers.hexlify(ethers.randomBytes(32));
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const expiresAt = Date.now() + 3600000; // 1 hour expiry

    // Create verification message
    const verificationMessage = `GitSplits Wallet Verification
Wallet Address: ${input.wallet}
GitHub Username: ${input.socialId}
Nonce: ${nonce}
Expires: ${new Date(expiresAt).toISOString()}`;

    // Create verification session
    const session: VerificationSession = {
      id: sessionId,
      socialType: "github",
      socialId: input.socialId,
      nonce,
      expiresAt,
      verified: false,
    };
    verificationSessions.set(sessionId, session);

    // Create a gist for verification
    const gistUrl = await createGistForVerification(
      input.socialId,
      verificationMessage
    );

    return {
      success: true,
      sessionId,
      verificationUrl: gistUrl,
      message: verificationMessage,
      expiresAt,
      instructions: [
        "1. Create a gist with the verification message",
        "2. Sign the message with your wallet",
        "3. Submit the signature to complete verification",
      ],
    };
  } catch (error) {
    throw new Error(
      `Failed to start verification: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

export async function completeVerification(input: {
  sessionId: string;
  signature: string;
}) {
  try {
    const session = verificationSessions.get(input.sessionId);
    if (!session) {
      throw new Error("Verification session not found");
    }

    if (Date.now() > session.expiresAt) {
      throw new Error("Verification session expired");
    }

    // Verify the gist content
    const verificationMessage = `GitSplits Wallet Verification
Wallet Address: ${session.wallet}
GitHub Username: ${session.socialId}
Nonce: ${session.nonce}
Expires: ${new Date(session.expiresAt).toISOString()}`;

    const isGistValid = await verifyGistContent(
      session.socialId,
      verificationMessage
    );

    if (!isGistValid) {
      throw new Error("Verification gist not found or content mismatch");
    }

    // Verify the signature
    const recoveredAddress = ethers.verifyMessage(
      verificationMessage,
      input.signature
    );
    if (recoveredAddress.toLowerCase() !== session.wallet?.toLowerCase()) {
      throw new Error("Invalid signature");
    }

    // Update session
    session.verified = true;
    verificationSessions.set(input.sessionId, session);

    return {
      success: true,
      verified: true,
      socialId: session.socialId,
      wallet: session.wallet,
    };
  } catch (error) {
    throw new Error(
      `Failed to complete verification: ${
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
    // First verify the identity
    const verificationResult = await verifyIdentity(input.verificationData);
    if (!verificationResult.success) {
      throw new Error("Identity verification failed");
    }

    // TODO: Implement the actual claim logic with the splits contract
    return {
      success: true,
      message: "Share claim initiated. Please complete verification.",
      verificationSessionId: verificationResult.sessionId,
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
  description: "Start the verification process for a GitHub identity.",
  schema: z.object({
    socialType: z.literal("github"),
    socialId: z.string(),
    message: z.string(),
    signature: z.string(),
    wallet: z.string(),
  }),
};

export const completeVerificationMetadata = {
  name: "completeVerification",
  description: "Complete the verification process with a signature.",
  schema: z.object({
    sessionId: z.string(),
    signature: z.string(),
  }),
};

export const claimShareMetadata = {
  name: "claimShare",
  description:
    "Claim a share in a splits contract by verifying GitHub identity.",
  schema: z.object({
    splitsAddress: z.string(),
    verificationData: z.object({
      socialType: z.literal("github"),
      socialId: z.string(),
      message: z.string(),
      signature: z.string(),
      wallet: z.string(),
    }),
  }),
};
