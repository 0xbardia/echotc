import fs from "node:fs";
import crypto from "node:crypto";
import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

const sourcePath = "/root/EchoTrace/EchoTrace/contracts/echotrace.py";
const code = fs.readFileSync(sourcePath, "utf8");
const hash = crypto.createHash("sha256").update(code, "utf8").digest("hex");
console.log("Source path:", sourcePath);
console.log("Source SHA-256:", hash);

const EXPECTED_HASH = "ccc59986e57bb5ef8570d87fdd4d5943f4de8eb50257d9ae5c6ed168a5aca616";
if (hash !== EXPECTED_HASH) {
  console.error(`Hash mismatch! Expected ${EXPECTED_HASH}, got ${hash}`);
  process.exit(1);
}

let key = "";
if (fs.existsSync("/root/EchoTrace/.echo-test-wallet.json")) {
  key = JSON.parse(fs.readFileSync("/root/EchoTrace/.echo-test-wallet.json", "utf8")).privateKey;
} else if (fs.existsSync("/tmp/echo-key.txt")) {
  key = fs.readFileSync("/tmp/echo-key.txt", "utf8").trim();
}

if (!key) {
  console.error("No deployer key found!");
  process.exit(1);
}

const account = createAccount(key);
console.log("Deployer account:", account.address);

const client = createClient({ chain: studionet, account });

console.log("Sending deployContract to Studionet (61999)...");
const txHash = await client.deployContract({ code, args: [], leaderOnly: false });
console.log("Deployment transaction hash:", txHash);

console.log("Waiting for transaction receipt (ACCEPTED / FINALIZED)...");
const receipt = await client.waitForTransactionReceipt({
  hash: txHash,
  status: TransactionStatus.ACCEPTED,
  interval: 5000,
  retries: 180,
});

console.log("Receipt status:", receipt.statusName || receipt.status);
console.log("Receipt execution:", receipt.txExecutionResultName || receipt.txExecutionResult);

let contractAddress = null;
if (receipt.data && typeof receipt.data === "object") {
  contractAddress = receipt.data.contract_address || receipt.data.contractAddress || receipt.data.address;
}
for (const k of ["recipient", "to_address", "to"]) {
  if (!contractAddress && receipt[k] && String(receipt[k]).startsWith("0x")) {
    contractAddress = receipt[k];
  }
}
console.log("Deployed contract address:", contractAddress);

// Read-back verification
if (contractAddress) {
  try {
    const policyVersion = await client.readContract({
      address: contractAddress,
      functionName: "get_policy_version",
      args: [],
    });
    console.log("Read-back get_policy_version:", policyVersion);

    const policy = await client.readContract({
      address: contractAddress,
      functionName: "get_policy",
      args: [],
    });
    console.log("Read-back get_policy:", policy);

    const caseCount = await client.readContract({
      address: contractAddress,
      functionName: "get_case_count",
      args: [],
    });
    console.log("Read-back get_case_count:", caseCount);
  } catch (err) {
    console.error("Read-back error:", err instanceof Error ? err.message : err);
  }
}

fs.writeFileSync("/tmp/deployed-candidate.json", JSON.stringify({
  sourceHash: hash,
  deployer: account.address,
  txHash,
  contractAddress,
  status: receipt.statusName || receipt.status,
  execution: receipt.txExecutionResultName || receipt.txExecutionResult,
  receipt,
}, null, 2));
