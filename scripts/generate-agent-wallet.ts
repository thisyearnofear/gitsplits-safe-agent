import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";

async function main() {
  // Generate a new private key
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);

  console.log("\n🔑 Generated new agent wallet:");
  console.log("Private Key:", privateKey);
  console.log("Address:", account.address);

  // Create a client to check the balance
  const client = createPublicClient({
    chain: sepolia,
    transport: http("https://rpc.ankr.com/eth_sepolia"),
  });

  const balance = await client.getBalance({ address: account.address });

  console.log("\n⚠️ Important:");
  console.log("1. Save these values in your .env file as:");
  console.log(`AGENT_PRIVATE_KEY="${privateKey}"`);
  console.log(`AGENT_ADDRESS="${account.address}"`);
  console.log("\n2. Get some Sepolia ETH from:");
  console.log("- https://sepoliafaucet.com");
  console.log("- https://sepolia-faucet.pk910.de");
  console.log("\nCurrent balance:", balance.toString(), "wei");
}

main().catch(console.error);
