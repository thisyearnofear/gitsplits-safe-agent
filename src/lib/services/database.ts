import { PrismaClient } from "@prisma/client";
import { ethers } from "ethers";
import { z } from "zod";

// Validation schemas
const SafeAccountSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  chainId: z.number().int().positive(),
  ownerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

const ContributorSchema = z.object({
  githubUsername: z.string().min(1),
  walletAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),
  percentage: z.number().min(0).max(100),
});

const SplitsContractSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  safeId: z.string().uuid(),
  chainId: z.number().int().positive(),
  controller: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  contributors: z.array(ContributorSchema),
});

const VerificationSessionSchema = z.object({
  contributorId: z.string(),
  nonce: z.string(),
  message: z.string(),
  status: z.enum(["PENDING", "COMPLETED", "EXPIRED"]),
  expiresAt: z.date(),
});

// Add new schema for repository analysis cache
const RepositoryAnalysisCacheSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  analysis: z.any(),
  timestamp: z.date(),
});

// Create a singleton instance
const prisma = new PrismaClient({
  log: ["query", "error", "warn"],
});

export class DatabaseError extends Error {
  constructor(message: string, public code: string, public cause?: unknown) {
    super(message);
    this.name = "DatabaseError";
  }
}

// Update the ContributorWithVerification interface
interface ContributorWithVerification {
  id: string;
  githubUsername: string;
  verificationStatus: string;
  verificationSessions: Array<{
    id: string;
    createdAt: Date;
    status: string;
  }>;
}

interface VerificationStatusResponse {
  githubUsername: string;
  isVerified: boolean;
  lastVerificationAttempt?: Date;
  status: string;
}

export class DatabaseService {
  private async logOperation(operation: string, details: Record<string, any>) {
    try {
      console.error(
        `[Database] ${operation}:`,
        JSON.stringify(details, null, 2)
      );
    } catch (error) {
      console.error(`[Database] Failed to log operation:`, error);
    }
  }

  // Safe Accounts
  async createSafeAccount(params: {
    address: string;
    chainId: number;
    ownerAddress: string;
  }) {
    try {
      // Validate input
      const validated = SafeAccountSchema.parse(params);

      await this.logOperation("createSafeAccount", validated);

      return await prisma.safeAccount.create({
        data: {
          address: validated.address.toLowerCase(),
          chainId: validated.chainId,
          ownerAddress: validated.ownerAddress.toLowerCase(),
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new DatabaseError(
          "Invalid Safe account data",
          "VALIDATION_ERROR",
          error
        );
      }
      throw new DatabaseError(
        "Failed to create Safe account",
        "CREATE_ERROR",
        error
      );
    }
  }

  async getSafeAccount(address: string) {
    try {
      if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
        throw new DatabaseError("Invalid address format", "VALIDATION_ERROR");
      }

      await this.logOperation("getSafeAccount", { address });

      return await prisma.safeAccount.findUnique({
        where: { address: address.toLowerCase() },
        include: {
          splitsContracts: {
            include: {
              contributors: true,
            },
          },
          accessKeys: {
            select: {
              id: true,
              expiresAt: true,
              permissions: true,
            },
          },
        },
      });
    } catch (error) {
      throw new DatabaseError(
        "Failed to get Safe account",
        "QUERY_ERROR",
        error
      );
    }
  }

  // Splits Contracts
  async createSplitsContract(params: {
    address: string;
    safeId: string;
    chainId: number;
    controller: string;
    contributors: Array<{
      githubUsername: string;
      walletAddress?: string;
      percentage: number;
    }>;
  }) {
    try {
      // Validate input
      const validated = SplitsContractSchema.parse(params);

      // Validate total percentage is 100%
      const total = validated.contributors.reduce(
        (sum, c) => sum + c.percentage,
        0
      );
      if (Math.abs(total - 100) > 0.001) {
        throw new DatabaseError(
          "Total contributor percentage must equal 100%",
          "VALIDATION_ERROR"
        );
      }

      await this.logOperation("createSplitsContract", validated);

      return await prisma.splitsContract.create({
        data: {
          address: validated.address.toLowerCase(),
          safeId: validated.safeId,
          chainId: validated.chainId,
          controller: validated.controller.toLowerCase(),
          contributors: {
            create: validated.contributors.map((c) => ({
              githubUsername: c.githubUsername,
              walletAddress: c.walletAddress?.toLowerCase(),
              percentage: c.percentage,
              verificationStatus: c.walletAddress ? "PENDING" : "UNASSIGNED",
            })),
          },
        },
        include: {
          contributors: true,
          safe: true,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new DatabaseError(
          "Invalid splits contract data",
          "VALIDATION_ERROR",
          error
        );
      }
      throw new DatabaseError(
        "Failed to create splits contract",
        "CREATE_ERROR",
        error
      );
    }
  }

  async getSplitsContract(address: string) {
    try {
      if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
        throw new DatabaseError("Invalid address format", "VALIDATION_ERROR");
      }

      await this.logOperation("getSplitsContract", { address });

      return await prisma.splitsContract.findUnique({
        where: { address: address.toLowerCase() },
        include: {
          contributors: true,
          safe: true,
        },
      });
    } catch (error) {
      throw new DatabaseError(
        "Failed to get splits contract",
        "QUERY_ERROR",
        error
      );
    }
  }

  // Contributors
  async updateContributor(params: {
    id: string;
    walletAddress?: string;
    verificationStatus?: "PENDING" | "VERIFIED";
  }) {
    try {
      if (
        params.walletAddress &&
        !params.walletAddress.match(/^0x[a-fA-F0-9]{40}$/)
      ) {
        throw new DatabaseError(
          "Invalid wallet address format",
          "VALIDATION_ERROR"
        );
      }

      await this.logOperation("updateContributor", params);

      return await prisma.contributor.update({
        where: { id: params.id },
        data: {
          walletAddress: params.walletAddress?.toLowerCase(),
          verificationStatus: params.verificationStatus,
          verifiedAt:
            params.verificationStatus === "VERIFIED" ? new Date() : undefined,
        },
      });
    } catch (error) {
      throw new DatabaseError(
        "Failed to update contributor",
        "UPDATE_ERROR",
        error
      );
    }
  }

  // Verification Sessions
  async createVerificationSession(params: {
    contributorId: string;
    nonce: string;
    message: string;
    expiresAt: Date;
  }) {
    try {
      await this.logOperation("createVerificationSession", params);

      return await prisma.verificationSession.create({
        data: {
          contributorId: params.contributorId,
          nonce: params.nonce,
          message: params.message,
          expiresAt: params.expiresAt,
          status: "PENDING",
        },
      });
    } catch (error) {
      throw new DatabaseError(
        "Failed to create verification session",
        "CREATE_ERROR",
        error
      );
    }
  }

  async completeVerificationSession(sessionId: string) {
    try {
      const session = await prisma.verificationSession.update({
        where: { id: sessionId },
        data: {
          status: "COMPLETED",
          verifiedAt: new Date(),
        },
      });

      // Also update the contributor's verification status
      if (session) {
        await prisma.contributor.update({
          where: { id: session.contributorId },
          data: {
            verificationStatus: "VERIFIED",
            verifiedAt: new Date(),
          },
        });
      }

      return session;
    } catch (error) {
      throw new DatabaseError(
        "Failed to complete verification session",
        "UPDATE_ERROR",
        error
      );
    }
  }

  async expireVerificationSession(sessionId: string) {
    try {
      return await prisma.verificationSession.update({
        where: { id: sessionId },
        data: {
          status: "EXPIRED",
        },
      });
    } catch (error) {
      throw new DatabaseError(
        "Failed to expire verification session",
        "UPDATE_ERROR",
        error
      );
    }
  }

  // Access Keys
  async createAccessKey(params: {
    safeId: string;
    permissions: {
      canView: boolean;
      canExecute: boolean;
      canModify: boolean;
    };
    expiresAt?: Date;
  }) {
    try {
      const key = ethers.hexlify(ethers.randomBytes(32));

      await this.logOperation("createAccessKey", {
        ...params,
        keyLength: key.length,
      });

      const accessKey = await prisma.accessKey.create({
        data: {
          safeId: params.safeId,
          key, // Store the raw key
          expiresAt: params.expiresAt,
          permissions: params.permissions,
        },
      });

      // Return both the access key record and the raw key
      return {
        ...accessKey,
        key, // Include the raw key in the response
      };
    } catch (error) {
      throw new DatabaseError(
        "Failed to create access key",
        "CREATE_ERROR",
        error
      );
    }
  }

  async validateAccessKey(key: string, safeId: string) {
    try {
      const accessKey = await prisma.accessKey.findFirst({
        where: {
          safeId,
          key, // Match against the raw key
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      });

      if (!accessKey) {
        throw new DatabaseError("Invalid or expired access key", "AUTH_ERROR");
      }

      await this.logAccess(accessKey.id, "KEY_VALIDATION");
      return accessKey;
    } catch (error) {
      throw new DatabaseError(
        "Failed to validate access key",
        "AUTH_ERROR",
        error
      );
    }
  }

  // Access Logs
  private async logAccess(
    accessKeyId: string,
    action: string,
    metadata: Record<string, any> = {}
  ) {
    try {
      const accessKey = await prisma.accessKey.findUnique({
        where: { id: accessKeyId },
        select: { safeId: true },
      });

      if (!accessKey) {
        console.error("Access key not found for logging:", accessKeyId);
        return null;
      }

      return await prisma.accessLog.create({
        data: {
          accessKey: {
            connect: {
              id: accessKeyId,
            },
          },
          safe: {
            connect: {
              id: accessKey.safeId,
            },
          },
          action,
          metadata,
        },
      });
    } catch (error) {
      console.error("Failed to create access log:", error);
      // Don't throw the error as logging failure shouldn't block the operation
      return null;
    }
  }

  // Utility functions
  private async encryptKey(key: string): Promise<string> {
    // TODO: Implement proper encryption using KMS or similar
    return ethers.keccak256(ethers.toUtf8Bytes(key));
  }

  // Verification Methods
  async getLatestVerificationSession(githubUsername: string) {
    try {
      const contributor = await prisma.contributor.findFirst({
        where: { githubUsername },
      });

      if (!contributor) {
        throw new DatabaseError("Contributor not found", "QUERY_ERROR");
      }

      return await prisma.verificationSession.findFirst({
        where: { contributorId: contributor.id },
        orderBy: { createdAt: "desc" },
      });
    } catch (error) {
      throw new DatabaseError(
        "Failed to get verification session",
        "QUERY_ERROR",
        error
      );
    }
  }

  async isContributorVerified(githubUsername: string): Promise<boolean> {
    try {
      const session = await this.getLatestVerificationSession(githubUsername);
      return session?.status === "COMPLETED";
    } catch (error) {
      return false;
    }
  }

  // Repository Analysis Cache
  async cacheRepositoryAnalysis(params: {
    owner: string;
    repo: string;
    analysis: any;
  }) {
    try {
      const validated = RepositoryAnalysisCacheSchema.parse({
        ...params,
        timestamp: new Date(),
      });

      await this.logOperation("cacheRepositoryAnalysis", validated);

      return await prisma.repositoryAnalysisCache.upsert({
        where: {
          owner_repo: {
            owner: validated.owner,
            repo: validated.repo,
          },
        },
        update: {
          analysis: validated.analysis,
          timestamp: validated.timestamp,
        },
        create: {
          owner: validated.owner,
          repo: validated.repo,
          analysis: validated.analysis,
          timestamp: validated.timestamp,
        },
      });
    } catch (error) {
      throw new DatabaseError(
        "Failed to cache repository analysis",
        "CACHE_ERROR",
        error
      );
    }
  }

  async getRepositoryAnalysisCache(owner: string, repo: string) {
    try {
      const cache = await prisma.repositoryAnalysisCache.findUnique({
        where: {
          owner_repo: { owner, repo },
        },
      });

      if (!cache) return null;

      // Check if cache is expired (24 hours)
      const cacheAge = Date.now() - cache.timestamp.getTime();
      if (cacheAge > 24 * 60 * 60 * 1000) {
        await prisma.repositoryAnalysisCache.delete({
          where: { id: cache.id },
        });
        return null;
      }

      return cache;
    } catch (error) {
      throw new DatabaseError(
        "Failed to get repository analysis cache",
        "CACHE_ERROR",
        error
      );
    }
  }

  // Batch Verification Status
  async getVerificationStatusForContributors(
    githubUsernames: string[]
  ): Promise<VerificationStatusResponse[]> {
    try {
      const contributors = await prisma.contributor.findMany({
        where: {
          githubUsername: {
            in: githubUsernames,
          },
        },
        include: {
          verificationSessions: {
            orderBy: {
              createdAt: "desc",
            },
            take: 1,
          },
        },
      });

      return contributors.map((contributor: ContributorWithVerification) => ({
        githubUsername: contributor.githubUsername,
        isVerified: contributor.verificationStatus === "VERIFIED",
        lastVerificationAttempt: contributor.verificationSessions[0]?.createdAt,
        status: contributor.verificationStatus,
      }));
    } catch (error) {
      throw new DatabaseError(
        "Failed to get verification status for contributors",
        "QUERY_ERROR",
        error
      );
    }
  }

  // Verification Session Management
  async cleanupExpiredVerificationSessions() {
    try {
      const expiredSessions = await prisma.verificationSession.updateMany({
        where: {
          status: "PENDING",
          expiresAt: {
            lt: new Date(),
          },
        },
        data: {
          status: "EXPIRED",
        },
      });

      await this.logOperation("cleanupExpiredVerificationSessions", {
        expiredCount: expiredSessions.count,
      });

      return expiredSessions.count;
    } catch (error) {
      throw new DatabaseError(
        "Failed to cleanup expired verification sessions",
        "UPDATE_ERROR",
        error
      );
    }
  }

  // Contributor Invitations
  async createContributorInvitation(params: {
    splitsContractId: string;
    contributorId: string;
    email: string;
    token: string;
    expiresAt: Date;
  }) {
    try {
      await this.logOperation("createContributorInvitation", params);

      return await prisma.contributorInvitation.create({
        data: {
          splitsContractId: params.splitsContractId,
          contributorId: params.contributorId,
          email: params.email,
          token: params.token,
          expiresAt: params.expiresAt,
          status: "PENDING",
        },
      });
    } catch (error) {
      throw new DatabaseError(
        "Failed to create contributor invitation",
        "CREATE_ERROR",
        error
      );
    }
  }

  async getContributorInvitation(token: string) {
    try {
      return await prisma.contributorInvitation.findUnique({
        where: { token },
        include: {
          contributor: true,
          splitsContract: true,
        },
      });
    } catch (error) {
      throw new DatabaseError(
        "Failed to get contributor invitation",
        "QUERY_ERROR",
        error
      );
    }
  }

  async updateContributorInvitation(id: string, data: { status: string }) {
    try {
      return await prisma.contributorInvitation.update({
        where: { id },
        data,
      });
    } catch (error) {
      throw new DatabaseError(
        "Failed to update contributor invitation",
        "UPDATE_ERROR",
        error
      );
    }
  }

  // Distributions
  async createDistribution(params: {
    splitsContractId: string;
    amount: number;
    status: string;
  }) {
    try {
      await this.logOperation("createDistribution", params);

      return await prisma.distribution.create({
        data: params,
      });
    } catch (error) {
      throw new DatabaseError(
        "Failed to create distribution",
        "CREATE_ERROR",
        error
      );
    }
  }

  async updateDistribution(
    id: string,
    data: { status: string; txHash?: string }
  ) {
    try {
      return await prisma.distribution.update({
        where: { id },
        data,
      });
    } catch (error) {
      throw new DatabaseError(
        "Failed to update distribution",
        "UPDATE_ERROR",
        error
      );
    }
  }

  async getPendingDistributions() {
    try {
      return await prisma.distribution.findMany({
        where: { status: "PENDING" },
        include: {
          splitsContract: {
            include: {
              contributors: true,
            },
          },
          claims: true,
        },
      });
    } catch (error) {
      throw new DatabaseError(
        "Failed to get pending distributions",
        "QUERY_ERROR",
        error
      );
    }
  }

  // Claims
  async createClaim(params: {
    contributorId: string;
    distributionId: string;
    amount: number;
    status: string;
  }) {
    try {
      await this.logOperation("createClaim", params);

      return await prisma.claim.create({
        data: params,
      });
    } catch (error) {
      throw new DatabaseError("Failed to create claim", "CREATE_ERROR", error);
    }
  }

  async updateClaim(id: string, data: { status: string; txHash?: string }) {
    try {
      return await prisma.claim.update({
        where: { id },
        data,
      });
    } catch (error) {
      throw new DatabaseError("Failed to update claim", "UPDATE_ERROR", error);
    }
  }

  async getContributorClaims(contributorId: string) {
    try {
      return await prisma.claim.findMany({
        where: { contributorId },
        include: {
          distribution: true,
        },
      });
    } catch (error) {
      throw new DatabaseError(
        "Failed to get contributor claims",
        "QUERY_ERROR",
        error
      );
    }
  }
}

// Export a singleton instance
export const db = new DatabaseService();
