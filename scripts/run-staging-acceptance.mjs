import fs from "node:fs";
import { createPublicClient, createWalletClient, http, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { studionet } from "genlayer-js/chains";
import { chromium } from "playwright";

const STAGING_URL = "http://127.0.0.1:8082";
const EXPECTED_CONTRACT = "0x0BcE79508f7705412D6c6E83750D12547715DB53";
const EXPECTED_SIGNER = "0x1BD6Eabf3fE310822835F678396c83b7e5EA859B";
const FROZEN_CLAIM = "The domain names example.com, example.net, and example.org are reserved for documentation purposes.";
const FROZEN_SOURCES = [
  "https://www.iana.org/domains/reserved",
  "https://en.wikipedia.org/wiki/Example.com",
  "https://httpbin.org/html",
];
const CLIENT_REQUEST_ID = "req-acceptance-live-001";
const EXPECTED_DIGEST = "1c96863679c950cf3460444563363fa35c6e11178f198214c9522c6d66b66614";

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

async function sendTx(tx) {
  // Target contract safety check
  if (tx.to && tx.to.toLowerCase() !== EXPECTED_CONTRACT.toLowerCase() && tx.to.toLowerCase() !== studionet.consensusMainContract.address.toLowerCase()) {
    console.warn(`Transaction target ${tx.to} differs from expected contract ${EXPECTED_CONTRACT}`);
  }
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
  console.log(`[SIGNER] EVM tx submitted: ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 180_000 });
  if (receipt.status !== "success") throw new Error(`EVM tx reverted: ${hash}`);
  const logs = parseEventLogs({ abi, eventName: "NewTransaction", logs: receipt.logs });
  const txId = logs[0]?.args?.txId;
  if (!txId) throw new Error(`No NewTransaction event on ${hash}`);
  console.log(`[SIGNER] GenLayer consensus tx ID: ${txId}`);
  return txId;
}

const launchOptions = {
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
};
if (process.env.CHROME_BIN) {
  launchOptions.executablePath = process.env.CHROME_BIN;
} else if (fs.existsSync("/usr/bin/google-chrome")) {
  launchOptions.executablePath = "/usr/bin/google-chrome";
}

const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(60_000);

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
      if (method === "wallet_getSnaps" || method === "wallet_requestSnaps") return {};
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
  claim: FROZEN_CLAIM,
  sources: FROZEN_SOURCES,
  clientRequestId: CLIENT_REQUEST_ID,
  expectedDigest: EXPECTED_DIGEST,
  contractAddress: EXPECTED_CONTRACT,
  signerAddress: account.address,
  phases: [],
};

try {
  console.log(`[STAGE 1] Navigating to staging intake desk ${STAGING_URL}/app/new?requestId=${CLIENT_REQUEST_ID}`);
  await page.goto(`${STAGING_URL}/app/new?requestId=${CLIENT_REQUEST_ID}`, { waitUntil: "networkidle" });
  await page.evaluate(() => window.dispatchEvent(new Event("eip6963:requestProvider")));
  await page.waitForTimeout(1000);

  // Connect wallet
  const connectBtn = page.getByRole("button", { name: /connect wallet/i });
  if (await connectBtn.isVisible()) {
    await connectBtn.click();
    await page.waitForTimeout(1000);
    const option = page.getByTestId("rk-wallet-option-dev.echotrace.preview");
    if (await option.isVisible()) {
      await option.click({ force: true });
      await page.waitForTimeout(1500);
    }
  }

  const bodyText = await page.locator("body").innerText();
  console.log(`[STAGE 1] Connected: ${bodyText.includes(account.address.slice(0, 4))}`);

  // Step 0: Fill exact frozen claim
  await page.getByTestId("claim-input").fill(FROZEN_CLAIM);
  await page.getByRole("button", { name: "Continue to sources" }).click();
  await page.waitForTimeout(500);

  // Step 1: Fill exact frozen sources
  for (let i = 0; i < FROZEN_SOURCES.length; i++) {
    const input = page.getByTestId(`url-${i}`);
    if (!(await input.isVisible())) {
      await page.getByRole("button", { name: "Add URL" }).click();
      await page.waitForTimeout(300);
    }
    await page.getByTestId(`url-${i}`).fill(FROZEN_SOURCES[i]);
  }

  // Run preflight
  console.log("[STAGE 1] Running preflight check...");
  await page.getByTestId("run-preflight").click();
  
  // Wait for preflight to finish and "Continue to manifest" to be enabled
  await page.waitForFunction(() => {
    const btn = document.querySelector("[data-testid='to-manifest']");
    return btn && !btn.disabled;
  }, { timeout: 60_000 });

  // Step 2 -> Step 3: Enter manifest
  await page.getByTestId("to-manifest").click();
  await page.waitForTimeout(1000);

  // If case et-951e94e89129 already exists on chain, we can jump directly to it or check if it needs to be completed
  console.log(`[STAGE 1] Checking existing case on candidate contract...`);
  const existingCaseId = "et-951e94e89129";
  // Check if we can navigate to existing case
  await page.goto(`${STAGING_URL}/cases/${existingCaseId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  const checkBody = await page.locator("body").innerText();
  if (checkBody.includes("Chain case et-951e94e89129")) {
    console.log(`[STAGE 1] Mounted existing authoritative case ${existingCaseId}`);
  } else {
    // If not mounted, go through intake
    await page.goto(`${STAGING_URL}/app/new?requestId=${CLIENT_REQUEST_ID}`, { waitUntil: "networkidle" });
    await page.getByTestId("confirm-manifest").check();
    await page.getByTestId("create-case").click();
    await page.getByTestId("chain-panel").waitFor({ timeout: 15_000 });
  }

  // Now execute the 5-step sequential blockchain signing workflow through the frontend UI:
  // 1. create_case
  // 2. review_sources_batch
  // 3. seal_source_reviews
  // 4. review_relationship_batch (if pending)
  // 5. finalize_case
  console.log("[STAGE 2] Starting sequential frontend signing workflow...");

  for (let phase = 1; phase <= 8; phase++) {
    // Wait until submit-wallet button is ready or until mirror finishes loading
    console.log(`[PHASE ${phase}] Waiting for submit button / mirror sync...`);
    await page.waitForTimeout(3000);
    for (let w = 0; w < 60; w++) {
      const btn = page.getByTestId("submit-wallet");
      const isDis = await btn.isDisabled().catch(() => true);
      const txt = (await btn.innerText().catch(() => "")) || "";
      if (!isDis && !txt.includes("Refreshing") && !txt.includes("Waiting")) break;
      if (txt.includes("Finalized") || txt.includes("Nothing left")) break;
      await page.waitForTimeout(1000);
    }

    const button = page.getByTestId("submit-wallet");
    const btnText = (await button.innerText().catch(() => "")) || "";
    console.log(`[PHASE ${phase}] Button text: "${btnText}"`);

    if (btnText.includes("Finalized on Studionet") || btnText.includes("Nothing left")) {
      console.log(`[PHASE ${phase}] Workflow reached terminal finalized state!`);
      break;
    }

    if (await button.isDisabled()) {
      // If button disabled because mirror is still loading, wait up to 30s more
      console.log(`[PHASE ${phase}] Submit button disabled, waiting for mirror hydration...`);
      await page.waitForFunction(() => {
        const btn = document.querySelector("[data-testid='submit-wallet']");
        const text = btn?.textContent || "";
        return btn && (!btn.disabled || text.includes("Finalized"));
      }, { timeout: 45_000 }).catch(() => {});

      if (await button.isDisabled()) {
        const noteText = await page.getByTestId("chain-note").innerText().catch(() => "");
        console.log(`[PHASE ${phase}] Note: ${noteText}`);
        break;
      }
    }

    const noteBefore = (await page.getByTestId("chain-note").innerText().catch(() => "")) || "";
    console.log(`[PHASE ${phase}] Clicking "Sign this step" (${btnText})...`);
    await button.click();

    // Wait for transaction to settle and chain-note to update
    await page.waitForFunction(
      (prev) => {
        const note = document.querySelector("[data-testid='chain-note']")?.textContent || "";
        return note && note !== prev && !note.startsWith("Preparing") && !note.startsWith("Wallet prompt");
      },
      noteBefore,
      { timeout: 900_000 },
    );

    const noteAfter = await page.getByTestId("chain-note").innerText();
    console.log(`[PHASE ${phase}] Result note: ${noteAfter}`);
    results.phases.push({ phase, btnText, note: noteAfter, url: page.url() });

    if (noteAfter.includes("did not succeed") || noteAfter.includes("Timed out")) {
      console.error(`[PHASE ${phase}] Step failed: ${noteAfter}`);
      break;
    }

    // Wait 12 seconds for Studionet node state to propagate before checking next step
    await page.waitForTimeout(12_000);
  }

  // Capture final authoritative state
  const finalCaseId = await page.getByTestId("chain-case-id").innerText();
  console.log(`[FINAL] Authoritative ID info: ${finalCaseId}`);
  results.finalCaseId = finalCaseId;

  // Execute read-only methods via desk interface
  console.log("[STAGE 3] Executing desk public contract reads...");
  results.reads = {};
  for (const method of ["get_case", "get_source_review", "get_relationships", "get_report"]) {
    await page.getByTestId("read-method").selectOption(method);
    if (method === "get_source_review") {
      // Test src-1, src-2, src-3
      for (const s of ["src-1", "src-2", "src-3"]) {
        await page.locator("select[data-testid='read-source']").selectOption(s).catch(() => {});
        await page.getByTestId("chain-read").click();
        await page.waitForFunction(() => {
          const text = document.querySelector("[data-testid='read-out']")?.textContent || "";
          return text.includes("\"readAt\"");
        }, { timeout: 60_000 });
        const val = await page.getByTestId("read-out").innerText();
        results.reads[`${method}:${s}`] = val;
      }
    } else {
      await page.getByTestId("chain-read").click();
      await page.waitForFunction(() => {
        const text = document.querySelector("[data-testid='read-out']")?.textContent || "";
        return text.includes("\"readAt\"");
      }, { timeout: 60_000 });
      const val = await page.getByTestId("read-out").innerText();
      results.reads[method] = val;
    }
  }

  // Extract the authoritative 12-hex case ID
  const match = finalCaseId.match(/et-[a-f0-9]{12}/);
  const authoritativeCaseId = match ? match[0] : null;
  results.authoritativeCaseId = authoritativeCaseId;

  if (authoritativeCaseId) {
    // READ-ONLY TEST 1: Open case in clean browser context with empty localStorage
    console.log(`[STAGE 4] Testing clean context read-through for ${authoritativeCaseId}...`);
    const cleanContext = await browser.newContext();
    const cleanPage = await cleanContext.newPage();
    await cleanPage.goto(`${STAGING_URL}/cases/${authoritativeCaseId}`, { waitUntil: "networkidle" });
    await cleanPage.waitForTimeout(3000);
    const cleanText = await cleanPage.locator("body").innerText();
    results.cleanReadThroughSuccess = !cleanText.includes("Case not on this device") && cleanText.includes(authoritativeCaseId);
    console.log(`[STAGE 4] Clean session read-through success: ${results.cleanReadThroughSuccess}`);
    await cleanContext.close();

    // READ-ONLY TEST 2: Non-owner read-only presentation
    console.log(`[STAGE 4] Testing non-owner read-only presentation...`);
    const strangerContext = await browser.newContext();
    const strangerPage = await strangerContext.newPage();
    await strangerPage.addInitScript(() => {
      window.ethereum = {
        isMetaMask: true,
        isConnected: () => true,
        selectedAddress: "0x2222222222222222222222222222222222222222",
        chainId: "0xf22f",
        request: async ({ method }) => {
          if (method === "eth_requestAccounts" || method === "eth_accounts") return ["0x2222222222222222222222222222222222222222"];
          if (method === "eth_chainId") return "0xf22f";
          return null;
        },
        on: () => {},
        removeListener: () => {},
      };
    });
    await strangerPage.goto(`${STAGING_URL}/cases/${authoritativeCaseId}`, { waitUntil: "networkidle" });
    await strangerPage.waitForTimeout(3000);
    const strangerBody = await strangerPage.locator("body").innerText();
    results.nonOwnerReadOnlyFlag = strangerBody.includes("Read-only: This case is owned on Studionet by");
    console.log(`[STAGE 4] Non-owner read-only banner present: ${results.nonOwnerReadOnlyFlag}`);
    await strangerContext.close();
  }

  fs.writeFileSync("/tmp/staging-acceptance-results.json", JSON.stringify(results, null, 2));
  console.log("[STAGE 5] Acceptance journey completed. Results saved to /tmp/staging-acceptance-results.json");
} catch (err) {
  console.error("ACCEPTANCE ERROR:", err);
  await page.screenshot({ path: "/tmp/acceptance-error.png", fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
