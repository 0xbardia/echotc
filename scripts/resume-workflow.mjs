import fs from "node:fs";
import { createPublicClient, createWalletClient, http, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { studionet } from "genlayer-js/chains";
import { chromium } from "playwright";

const STAGING_URL = "http://127.0.0.1:8082";
const EXPECTED_CONTRACT = "0x0BcE79508f7705412D6c6E83750D12547715DB53";
const EXPECTED_SIGNER = "0x1BD6Eabf3fE310822835F678396c83b7e5EA859B";
const TARGET_CASE_ID = "et-951e94e89129";

let key = "";
if (fs.existsSync("/root/EchoTrace/.echo-test-wallet.json")) {
  key = JSON.parse(fs.readFileSync("/root/EchoTrace/.echo-test-wallet.json", "utf8")).privateKey;
} else if (fs.existsSync("/tmp/echo-key.txt")) {
  key = fs.readFileSync("/tmp/echo-key.txt", "utf8").trim();
}

if (!key) {
  console.error("No signer key found!");
  process.exit(1);
}

const account = privateKeyToAccount(key);
if (account.address.toLowerCase() !== EXPECTED_SIGNER.toLowerCase()) {
  console.error(`Signer mismatch: expected ${EXPECTED_SIGNER}, got ${account.address}`);
  process.exit(1);
}

const transport = http("https://studio.genlayer.com/api", { timeout: 120_000 });
const publicClient = createPublicClient({ chain: studionet, transport });
const wallet = createWalletClient({ account, chain: studionet, transport });
const abi = studionet.consensusMainContract.abi;

const submittedTxs = [];

function log(msg) {
  console.log(msg);
  fs.appendFileSync("/tmp/workflow.log", msg + "\n");
}

async function sendTx(tx) {
  log(`[EVM SEND] to: ${tx.to}, from: ${account.address}, data len: ${tx.data?.length}`);
  const hash = await wallet.sendTransaction({
    to: tx.to,
    data: tx.data,
    value: tx.value ? BigInt(tx.value) : 0n,
    gas: tx.gas ? BigInt(tx.gas) : undefined,
    gasPrice: tx.gasPrice ? BigInt(tx.gasPrice) : undefined,
    nonce: tx.nonce != null ? Number(tx.nonce) : undefined,
    type: "legacy",
  });
  submittedTxs.push({ hash, at: new Date().toISOString() });
  log(`[SIGNER] EVM tx submitted: ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 180_000 });
  if (receipt.status !== "success") throw new Error(`EVM tx reverted: ${hash}`);
  const logs = parseEventLogs({ abi, eventName: "NewTransaction", logs: receipt.logs });
  const txId = logs[0]?.args?.txId;
  if (!txId) throw new Error(`No NewTransaction event on ${hash}`);
  log(`[SIGNER] GenLayer consensus tx ID: ${txId}`);
  return txId;
}

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
});

const page = await browser.newPage();
page.setDefaultTimeout(900_000); // 15 mins for consensus

page.on("console", (msg) => log(`[BROWSER CONSOLE] ${msg.type()}: ${msg.text()}`));
page.on("pageerror", (err) => log(`[BROWSER ERROR] ${err.message}`));

await page.exposeFunction("__echoSend", (tx) => sendTx(tx));
await page.exposeFunction("__echoSign", (message) => account.signMessage({ message: { raw: message } }));

await page.addInitScript((signerAddress) => {
  let connected = false;
  window.ethereum = {
    isMetaMask: true,
    isConnected: () => connected,
    selectedAddress: null,
    chainId: "0xf22f",
    request: async ({ method, params = [] }) => {
      if (method === "eth_requestAccounts") {
        connected = true;
        window.ethereum.selectedAddress = signerAddress;
        return [signerAddress];
      }
      if (method === "eth_accounts") {
        return connected ? [signerAddress] : [];
      }
      if (method === "eth_chainId" || method === "net_version") {
        return method === "net_version" ? "61999" : "0xf22f";
      }
      if (method.startsWith("wallet_")) return null;
      if (method === "eth_sendTransaction") return await window.__echoSend(params[0]);
      if (method === "personal_sign") return await window.__echoSign(params[0]);

      const response = await fetch("https://studio.genlayer.com/api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const body = await response.json();
      if (body.error) throw new Error(body.error.message || JSON.stringify(body.error));
      return body.result;
    },
    on: () => {},
    removeListener: () => {},
    enable: async () => {
      connected = true;
      window.ethereum.selectedAddress = signerAddress;
      return [signerAddress];
    },
  };

  const info = {
    uuid: "0f0e0d0c-0b0a-0908-0706-050403020100",
    name: "Echo Preview",
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>",
    rdns: "dev.echotrace.preview",
  };
  const announce = () => {
    window.dispatchEvent(
      new CustomEvent("eip6963:announceProvider", {
        detail: Object.freeze({ info, provider: window.ethereum }),
      }),
    );
  };
  window.addEventListener("eip6963:requestProvider", announce);
}, account.address);

const results = {
  contractAddress: EXPECTED_CONTRACT,
  signerAddress: account.address,
  caseId: TARGET_CASE_ID,
  steps: [],
};

try {
  log(`[INIT] Direct navigation to existing case: ${STAGING_URL}/cases/${TARGET_CASE_ID}`);
  await page.goto(`${STAGING_URL}/cases/${TARGET_CASE_ID}`, { waitUntil: "domcontentloaded" });

  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.dispatchEvent(new Event("eip6963:requestProvider")));
    await page.waitForTimeout(300);
  }

  const connectBtn = page.locator(".connect-slot button");
  await connectBtn.waitFor({ state: "visible", timeout: 20000 });
  await page.waitForTimeout(500);
  await connectBtn.click();
  await page.waitForTimeout(1000);

  const option = page.getByTestId("rk-wallet-option-dev.echotrace.preview");
  await option.waitFor({ state: "visible", timeout: 10000 });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const opt = document.querySelector("[data-testid='rk-wallet-option-dev.echotrace.preview']");
    if (opt) opt.click();
  });
  await page.waitForTimeout(1500);

  log("[INIT] Wallet connected successfully.");

  // Loop through signing steps until finalized
  for (let stepIdx = 1; stepIdx <= 5; stepIdx++) {
    log(`\n--- Step ${stepIdx}: Waiting for frontend state to settle ---`);

    // Settle loop: wait until button is enabled or terminal state is reached
    let btnText = "";
    let isDis = true;
    for (let s = 0; s < 60; s++) {
      const state = await page.evaluate(() => {
        const btn = document.querySelector("[data-testid='submit-wallet']");
        const h2 = document.querySelector("[data-testid='chain-panel'] h2")?.textContent?.trim();
        const note = document.querySelector("[data-testid='chain-note']")?.textContent?.trim();
        const retryBtn = document.querySelector("[data-testid='retry-mirror-read']");
        return {
          disabled: btn?.disabled,
          text: btn?.textContent?.trim(),
          heading: h2,
          note,
          hasRetryBtn: Boolean(retryBtn),
        };
      });

      btnText = state.text || "";
      isDis = Boolean(state.disabled);

      if (!isDis && btnText === "Sign this step") {
        log(`[Step ${stepIdx}] Ready to sign! Heading: "${state.heading}"`);
        break;
      }
      if (btnText.includes("Finalized") || btnText.includes("Nothing left")) {
        log(`[Step ${stepIdx}] Case reached finalized state!`);
        break;
      }
      if (state.hasRetryBtn || btnText === "Studionet read failed") {
        log(`[Step ${stepIdx}] Mirror read error detected. Waiting 8s and clicking retry...`);
        await page.waitForTimeout(8000);
        await page.evaluate(() => document.querySelector("[data-testid='retry-mirror-read']")?.click());
        await page.waitForTimeout(3000);
        continue;
      }
      await page.waitForTimeout(1000);
    }

    if (btnText.includes("Finalized") || btnText.includes("Nothing left")) {
      log("All required steps completed!");
      break;
    }

    if (isDis) {
      const currentNote = await page.evaluate(() => document.querySelector("[data-testid='chain-note']")?.textContent || "");
      log(`[BLOCKED] Step ${stepIdx} button disabled. Text: "${btnText}", Note: "${currentNote}"`);
      results.blocked = { stepIdx, btnText, note: currentNote };
      break;
    }

    const heading = await page.evaluate(() => document.querySelector("[data-testid='chain-panel'] h2")?.textContent || "");
    const noteBefore = await page.evaluate(() => document.querySelector("[data-testid='chain-note']")?.textContent || "");

    log(`[Step ${stepIdx}] Clicking "Sign this step" for: "${heading}"...`);
    await page.getByTestId("submit-wallet").click();

    // Wait for transaction to settle and chain-note to update
    log(`[Step ${stepIdx}] Waiting for GenLayer consensus...`);
    await page.waitForFunction(
      (prev) => {
        const note = document.querySelector("[data-testid='chain-note']")?.textContent || "";
        return note && note !== prev && !note.startsWith("Preparing") && !note.startsWith("Wallet prompt");
      },
      noteBefore,
      { timeout: 900_000 },
    );

    const noteAfter = await page.getByTestId("chain-note").innerText();
    log(`[Step ${stepIdx}] Consensus result: ${noteAfter}`);
    results.steps.push({ stepIdx, heading, note: noteAfter, at: new Date().toISOString() });

    if (noteAfter.includes("did not succeed") || noteAfter.includes("Timed out")) {
      console.error(`[Step ${stepIdx}] Execution failed: ${noteAfter}`);
      break;
    }

    // Wait 10s for on-chain state to propagate
    await page.waitForTimeout(10_000);
  }

  // Capture final authoritative state
  console.log("\n--- Capturing final authoritative state via public reads ---");
  results.reads = {};
  for (const method of ["get_case", "get_source_review", "get_relationships", "get_report"]) {
    await page.getByTestId("read-method").selectOption(method);
    if (method === "get_source_review") {
      for (const s of ["src-1", "src-2", "src-3"]) {
        await page.locator("select[data-testid='read-source']").selectOption(s).catch(() => {});
        await page.getByTestId("chain-read").click();
        await page.waitForFunction(() => {
          const text = document.querySelector("[data-testid='read-out']")?.textContent || "";
          return text.includes('"readAt"');
        }, { timeout: 60_000 });
        const val = await page.getByTestId("read-out").innerText();
        results.reads[`${method}:${s}`] = JSON.parse(val);
      }
    } else {
      await page.getByTestId("chain-read").click();
      await page.waitForFunction(() => {
        const text = document.querySelector("[data-testid='read-out']")?.textContent || "";
        return text.includes('"readAt"');
      }, { timeout: 60_000 });
      const val = await page.getByTestId("read-out").innerText();
      results.reads[method] = JSON.parse(val);
    }
  }

  results.submittedTxs = submittedTxs;
  fs.writeFileSync("/tmp/workflow-resumption-results.json", JSON.stringify(results, null, 2));
  console.log("Results written to /tmp/workflow-resumption-results.json");
} catch (err) {
  console.error("FATAL ERROR IN WORKFLOW RESUMPTION:", err);
  results.error = err instanceof Error ? err.message : String(err);
  fs.writeFileSync("/tmp/workflow-resumption-results.json", JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
