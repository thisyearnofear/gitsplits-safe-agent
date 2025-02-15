import Safe, {
  PredictedSafeProps,
  SafeAccountConfig,
} from "@safe-global/protocol-kit";
import {
  MetaTransactionData,
  OperationType,
} from "@safe-global/safe-core-sdk-types";
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

    // Initialize existing Safe
    safeClient = await Safe.init({
      provider: config.safe.rpcUrl,
      signer: config.safe.agentPrivateKey,
      safeAddress: config.safe.agentAddress as `0x${string}`,
    });
  }

  return safeClient;
}

export async function createSafeForAgent() {
  // Create the Safe configuration
  const safeAccountConfig: SafeAccountConfig = {
    owners: [config.safe.agentAddress],
    threshold: 1,
  };

  const predictedSafe: PredictedSafeProps = {
    safeAccountConfig,
  };

  // Initialize Protocol Kit
  const protocolKit = await Safe.init({
    provider: config.safe.rpcUrl,
    signer: config.safe.agentPrivateKey,
    predictedSafe,
  });

  // Get predicted address
  const safeAddress = await protocolKit.getAddress();
  console.error("Predicted Safe address:", safeAddress);

  // Create deployment transaction
  const deploymentTransaction =
    await protocolKit.createSafeDeploymentTransaction();

  // Get the external signer to execute the transaction
  const client = await protocolKit.getSafeProvider().getExternalSigner();
  if (!client) {
    throw new Error("Failed to get external signer");
  }

  // Create provider for transaction monitoring
  const provider = new ethers.JsonRpcProvider(config.safe.rpcUrl);

  // Execute deployment transaction
  console.error("Deploying new Safe...");
  const txHash = await client.sendTransaction({
    to: deploymentTransaction.to,
    value: BigInt(deploymentTransaction.value),
    data: deploymentTransaction.data as `0x${string}`,
    chain: config.safe.chain,
  });

  // Wait for transaction confirmation
  const receipt = await provider.waitForTransaction(txHash);
  if (!receipt) {
    throw new Error("Failed to get transaction receipt");
  }
  console.error("Safe deployed at:", safeAddress);

  // Connect to the newly deployed Safe
  const newProtocolKit = await protocolKit.connect({ safeAddress });
  safeClient = newProtocolKit;

  return { client: newProtocolKit, safeAddress };
}

export async function createAndExecuteSafeTransaction(params: {
  to: string;
  data: string;
  value?: string;
  operation?: number;
}) {
  const client = await getSafeClient();
  if (!client) {
    throw new Error("Failed to initialize Safe client");
  }

  try {
    console.error("Creating Safe transaction:", params);

    // Create transaction data
    const safeTransactionData: MetaTransactionData = {
      to: params.to,
      data: params.data,
      value: params.value || "0",
      operation: params.operation || OperationType.Call,
    };

    // Create transaction
    const safeTransaction = await client.createTransaction({
      transactions: [safeTransactionData],
    });

    // Get transaction hash
    const safeTxHash = await client.getTransactionHash(safeTransaction);
    console.error("Transaction hash:", safeTxHash);

    // Sign transaction
    const signedSafeTx = await client.signTransaction(safeTransaction);
    console.error("Transaction signed");

    // Execute transaction
    const executeTxResponse = await client.executeTransaction(signedSafeTx);
    const provider = new ethers.JsonRpcProvider(config.safe.rpcUrl);
    const receipt = await provider.waitForTransaction(executeTxResponse.hash);
    if (!receipt) {
      throw new Error("Failed to get transaction receipt");
    }

    console.error("Transaction executed:", {
      hash: receipt.hash,
      status: receipt.status ? "success" : "failed",
    });

    return {
      success: true,
      hash: receipt.hash,
      safeTxHash,
    };
  } catch (error) {
    console.error("Failed to create/execute Safe transaction:", error);
    throw new Error(
      `Safe transaction failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}
