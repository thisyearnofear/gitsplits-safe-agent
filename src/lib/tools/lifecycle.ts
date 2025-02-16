import { z } from "zod";
import { splitsLifecycle } from "../services/splits-lifecycle";
import { db } from "../services/database";

interface ContributorResponse {
  githubUsername: string;
  percentage: number;
  invitationEmail?: string;
}

// Create splits with invitations
export async function createSplitsWithInvitations(input: {
  safeId: string;
  contributors: Array<{
    githubUsername: string;
    email?: string;
    percentage: number;
  }>;
}) {
  const contract = await splitsLifecycle.createSplitsWithInvitations(input);
  return {
    success: true,
    contractId: contract.id,
    address: contract.address,
    contributors: contract.contributors.map((c: ContributorResponse) => ({
      githubUsername: c.githubUsername,
      percentage: c.percentage,
      invitationSent: !!c.invitationEmail,
    })),
  };
}

// Accept invitation and start verification
export async function acceptSplitsInvitation(input: {
  token: string;
  walletAddress: string;
}) {
  const invitation = await splitsLifecycle.acceptInvitation(
    input.token,
    input.walletAddress
  );
  return {
    success: true,
    contributorId: invitation.contributorId,
    splitsContractId: invitation.splitsContractId,
    status: "PENDING_VERIFICATION",
  };
}

// Check for new funds and create distributions
export async function checkSplitsForNewFunds(input: {
  splitsContractId: string;
}) {
  const distribution = await splitsLifecycle.checkForNewFunds(
    input.splitsContractId
  );
  if (!distribution) {
    return {
      success: true,
      hasNewFunds: false,
    };
  }
  return {
    success: true,
    hasNewFunds: true,
    distributionId: distribution.id,
    amount: distribution.amount,
    status: distribution.status,
  };
}

// Process pending distributions
export async function processPendingDistributions() {
  await splitsLifecycle.processPendingDistributions();
  return {
    success: true,
    message: "Processed all pending distributions",
  };
}

// Get claimable amount for contributor
export async function getClaimableAmount(input: { contributorId: string }) {
  const amount = await splitsLifecycle.getClaimableAmount(input.contributorId);
  return {
    success: true,
    amount,
  };
}

// Tool metadata
export const createSplitsWithInvitationsMetadata = {
  name: "createSplitsWithInvitations",
  description:
    "Create a new splits contract and send invitations to contributors who need to verify their identity.",
  schema: z.object({
    safeId: z.string(),
    contributors: z.array(
      z.object({
        githubUsername: z.string(),
        email: z.string().optional(),
        percentage: z.number(),
      })
    ),
  }),
};

export const acceptSplitsInvitationMetadata = {
  name: "acceptSplitsInvitation",
  description:
    "Accept a splits invitation and start the verification process for a contributor.",
  schema: z.object({
    token: z.string(),
    walletAddress: z.string(),
  }),
};

export const checkSplitsForNewFundsMetadata = {
  name: "checkSplitsForNewFunds",
  description:
    "Check if a splits contract has received new funds and create distributions if needed.",
  schema: z.object({
    splitsContractId: z.string(),
  }),
};

export const processPendingDistributionsMetadata = {
  name: "processPendingDistributions",
  description: "Process all pending distributions across splits contracts.",
  schema: z.object({}),
};

export const getClaimableAmountMetadata = {
  name: "getClaimableAmount",
  description: "Get the total claimable amount for a contributor.",
  schema: z.object({
    contributorId: z.string(),
  }),
};
