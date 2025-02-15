import Safe from "@safe-global/protocol-kit";
import { ethers } from "ethers";
import { config } from "./config";

let safeClient: Safe | null = null;

export async function getSafeClient() {
  if (!safeClient) {
    if (!config.safe.agentAddress || !config.safe.agentPrivateKey) {
      throw new Error(
        "Agent address and private key must be configured in .env"
      );
    }

    // Create ethers provider and signer
    const provider = new ethers.JsonRpcProvider(config.safe.rpcUrl);
    const signer = new ethers.Wallet(config.safe.agentPrivateKey, provider);

    safeClient = await Safe.init({
      provider: config.safe.rpcUrl,
      signer: config.safe.agentPrivateKey,
      predictedSafe: {
        safeAccountConfig: {
          owners: [config.safe.agentAddress],
          threshold: 1,
        },
      },
    });
  }

  return safeClient;
}

export async function createSafeForAgent() {
  const client = await getSafeClient();
  if (!client) {
    throw new Error("Failed to initialize Safe client");
  }
  const safeAddress = await client.getAddress();
  return { client, safeAddress };
}
