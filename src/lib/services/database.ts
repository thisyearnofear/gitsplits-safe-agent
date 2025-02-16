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

  async completeVerificationSession(id: string) {
    try {
      await this.logOperation("completeVerificationSession", { id });

      return await prisma.verificationSession.update({
        where: { id },
        data: {
          status: "COMPLETED",
          verifiedAt: new Date(),
        },
      });
    } catch (error) {
      throw new DatabaseError(
        "Failed to complete verification session",
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
}

// Export a singleton instance
export const db = new DatabaseService();
