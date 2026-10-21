import assert from "node:assert/strict";
import { chromium } from "playwright";
import { abi } from "genlayer-js";

const STAGING_URL = "http://127.0.0.1:8082";
const TARGET_CASE_ID = "et-951e94e89129";
const OWNER_ADDRESS = "0x1BD6Eabf3fE310822835F678396c83b7e5EA859B";
const STRANGER_ADDRESS = "0x2222222222222222222222222222222222222222";

const CASE_FIXTURE = {
  createdAt: "on-chain",
  found: true,
  id: TARGET_CASE_ID,
  manifest: {
    claim: "The domain names example.com, example.net, and example.org are reserved for documentation purposes.",
    clientRequestId: "req-acceptance-live-001",
    language: "en",
    parentCaseId: null,
    policyVersion: "echotrace-policy-1.0.0",
    sources: [
      { id: "src-1", parentSourceId: null, role: "submitted", url: "https://www.iana.org/domains/reserved" },
      { id: "src-2", parentSourceId: null, role: "submitted", url: "https://en.wikipedia.org/wiki/Example.com" },
      { id: "src-3", parentSourceId: null, role: "submitted", url: "https://httpbin.org/html" },
    ],
  },
  owner: OWNER_ADDRESS,
  status: "CREATED",
  updatedAt: "on-chain",
};

const RELATIONSHIPS_FIXTURE = {
  found: true,
  relationships: [],
};

const REPORT_FIXTURE = {
  caseId: TARGET_CASE_ID,
  complete: false,
  finalized: false,
  found: true,
  limitations: ["No report is sealed yet. This read is not a verdict."],
  partial: false,
  status: "CREATED",
};

function sourceReviewFixture(sourceId) {
  return {
    attempts: 0,
    contributions: [],
    coverageNote: "",
    fetchStatus: "pending",
    found: true,
    limitations: "",
    sourceId,
    stance: null,
  };
}

function hexResult(obj) {
  return Buffer.from(abi.calldata.encode(JSON.stringify(obj))).toString("hex");
}

function setupMockRpc(page, { failReads = false } = {}) {
  let shouldFail = failReads;

  const handler = async (route, req) => {
    const post = req.postData() || "";
    let parsed;
    try {
      parsed = JSON.parse(post);
    } catch {
      await route.continue();
      return;
    }

    if (parsed.method === "gen_call") {
      const dataHex = parsed.params?.[0]?.data || "";
      const text = Buffer.from(dataHex.replace(/^0x/, ""), "hex").toString("utf8");

      if (shouldFail && text.includes("get_source_review")) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ jsonrpc: "2.0", id: parsed.id, error: { message: "Simulated Studionet RPC 500 failure" } }),
        });
        return;
      }

      if (text.includes("get_case")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ jsonrpc: "2.0", id: parsed.id, result: hexResult(CASE_FIXTURE) }),
        });
        return;
      }

      if (text.includes("get_relationships")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ jsonrpc: "2.0", id: parsed.id, result: hexResult(RELATIONSHIPS_FIXTURE) }),
        });
        return;
      }

      if (text.includes("get_report")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ jsonrpc: "2.0", id: parsed.id, result: hexResult(REPORT_FIXTURE) }),
        });
        return;
      }

      if (text.includes("get_source_review")) {
        const match = text.match(/src-\d+/);
        const sourceId = match ? match[0] : "src-1";
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ jsonrpc: "2.0", id: parsed.id, result: hexResult(sourceReviewFixture(sourceId)) }),
        });
        return;
      }
    }

    await route.continue();
  };

  return { routeHandler: handler, setFail: (v) => { shouldFail = v; } };
}

function setupWalletInitScript(signerAddress) {
  return (signer) => {
    window.ethereum = {
      isMetaMask: true,
      isConnected: () => Boolean(signer),
      selectedAddress: signer,
      chainId: "0xf22f",
      request: async ({ method }) => {
        if (method === "eth_requestAccounts" || method === "eth_accounts") return signer ? [signer] : [];
        if (method === "eth_chainId" || method === "net_version") return method === "net_version" ? "61999" : "0xf22f";
        return null;
      },
      on: () => {},
      removeListener: () => {},
    };
    const info = {
      uuid: "0f0e0d0c-0b0a-0908-0706-050403020100",
      name: "Echo Preview",
      icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>",
      rdns: "dev.echotrace.preview",
    };
    window.addEventListener("eip6963:requestProvider", () => {
      window.dispatchEvent(
        new CustomEvent("eip6963:announceProvider", {
          detail: Object.freeze({ info, provider: window.ethereum }),
        }),
      );
    });
  };
}

async function connectWallet(page) {
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.dispatchEvent(new Event("eip6963:requestProvider")));
    await page.waitForTimeout(200);
  }

  const connectBtn = page.locator(".connect-slot button");
  await connectBtn.waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(300);
  await connectBtn.click();
  await page.waitForTimeout(800);

  const option = page.getByTestId("rk-wallet-option-dev.echotrace.preview");
  if (await option.isVisible()) {
    await option.click({ force: true });
    await page.waitForTimeout(1000);
  }
}

async function run() {
  console.log("=== REGRESSION SUITE: EchoTrace Frontend On-Chain Desk ===");

  const browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });

  try {
    // --- TEST 1: Owner connected with empty localStorage ---
    console.log("\n--- TEST 1: Owner connected with empty localStorage ---");
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      const { routeHandler } = setupMockRpc(page, { failReads: false });
      await page.route("**/studio.genlayer.com/api", routeHandler);

      await page.addInitScript(setupWalletInitScript(OWNER_ADDRESS), OWNER_ADDRESS);
      await page.goto(`${STAGING_URL}/cases/${TARGET_CASE_ID}`, { waitUntil: "domcontentloaded" });
      await connectWallet(page);

      await page.locator("[data-testid='submit-wallet']").waitFor({ timeout: 20000 });

      for (let s = 0; s < 25; s++) {
        const txt = await page.evaluate(() => document.querySelector("[data-testid='submit-wallet']")?.textContent?.trim() || "");
        if (txt && !txt.includes("Refreshing") && !txt.includes("Opening")) break;
        await page.waitForTimeout(500);
      }

      const state = await page.evaluate(() => {
        const btn = document.querySelector("[data-testid='submit-wallet']");
        const heading = document.querySelector("[data-testid='chain-panel'] h2")?.textContent?.trim();
        const body = document.body.innerText;
        return {
          disabled: btn?.disabled,
          text: btn?.textContent?.trim(),
          heading,
          hasWriteRefusal: body.includes("Writes are refused because this principal does not own the case"),
          hasReadOnlyBanner: body.includes("Read-only: This case is owned on Studionet"),
        };
      });

      console.log("Test 1 Result:", state);
      assert.equal(state.disabled, false, "Owner submit button must be enabled");
      assert.equal(state.text, "Sign this step", "Button must read 'Sign this step'");
      assert.equal(state.heading, "Review the next source batch", "Planner must target review_sources_batch");
      assert.equal(state.hasWriteRefusal, false, "Owner must not see write refusal banner");
      assert.equal(state.hasReadOnlyBanner, false, "Owner must not see read-only banner");
      console.log("PASS: Test 1");
      await context.close();
    }

    // --- TEST 2: Stranger (Non-Owner) connected ---
    console.log("\n--- TEST 2: Stranger (Non-Owner) connected ---");
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      const { routeHandler } = setupMockRpc(page, { failReads: false });
      await page.route("**/studio.genlayer.com/api", routeHandler);

      await page.addInitScript(setupWalletInitScript(STRANGER_ADDRESS), STRANGER_ADDRESS);
      await page.goto(`${STAGING_URL}/cases/${TARGET_CASE_ID}`, { waitUntil: "domcontentloaded" });
      await connectWallet(page);

      await page.locator("[data-testid='submit-wallet']").waitFor({ timeout: 20000 });

      for (let s = 0; s < 25; s++) {
        const txt = await page.evaluate(() => document.querySelector("[data-testid='submit-wallet']")?.textContent?.trim() || "");
        if (txt && !txt.includes("Refreshing") && !txt.includes("Opening")) break;
        await page.waitForTimeout(500);
      }

      const state = await page.evaluate(() => {
        const btn = document.querySelector("[data-testid='submit-wallet']");
        const body = document.body.innerText;
        return {
          disabled: btn?.disabled,
          text: btn?.textContent?.trim(),
          hasReadOnlyBanner: body.includes("Read-only: This case is owned on Studionet"),
        };
      });

      console.log("Test 2 Result:", state);
      assert.equal(state.disabled, true, "Stranger submit button must be strictly disabled");
      assert.ok(state.text?.includes("Read-only") || state.text?.includes("not the owner"));
      assert.equal(state.hasReadOnlyBanner, true, "Read-only banner must be shown to stranger");
      console.log("PASS: Test 2");
      await context.close();
    }

    // --- TEST 3: RPC Failure blocks premature submission; Retry recovers ---
    console.log("\n--- TEST 3: RPC Failure blocks premature submission; Retry recovers ---");
    {
      const context = await browser.newContext();
      const page = await context.newPage();

      const { routeHandler, setFail } = setupMockRpc(page, { failReads: true });
      await page.route("**/studio.genlayer.com/api", routeHandler);

      await page.addInitScript(setupWalletInitScript(OWNER_ADDRESS), OWNER_ADDRESS);
      await page.goto(`${STAGING_URL}/cases/${TARGET_CASE_ID}`, { waitUntil: "domcontentloaded" });
      await connectWallet(page);

      await page.locator("[data-testid='retry-mirror-read']").waitFor({ timeout: 20000 });

      const failedState = await page.evaluate(() => {
        const btn = document.querySelector("[data-testid='submit-wallet']");
        const retryBtn = document.querySelector("[data-testid='retry-mirror-read']");
        return {
          disabled: btn?.disabled,
          text: btn?.textContent?.trim(),
          retryVisible: Boolean(retryBtn),
        };
      });

      console.log("Failed state:", failedState);
      assert.equal(failedState.disabled, true, "Submit button must be disabled on RPC failure (no premature sign)");
      assert.equal(failedState.text, "Studionet read failed");
      assert.equal(failedState.retryVisible, true, "Retry button must be visible");

      // Recover
      console.log("Recovering via Retry button...");
      setFail(false);
      await page.evaluate(() => document.querySelector("[data-testid='retry-mirror-read']")?.click());

      for (let s = 0; s < 25; s++) {
        const txt = await page.evaluate(() => document.querySelector("[data-testid='submit-wallet']")?.textContent?.trim() || "");
        if (txt === "Sign this step") break;
        await page.waitForTimeout(500);
      }

      const recoveredState = await page.evaluate(() => {
        const btn = document.querySelector("[data-testid='submit-wallet']");
        return {
          disabled: btn?.disabled,
          text: btn?.textContent?.trim(),
        };
      });

      console.log("Recovered state:", recoveredState);
      assert.equal(recoveredState.disabled, false, "Submit button must enable after successful retry");
      assert.equal(recoveredState.text, "Sign this step");
      console.log("PASS: Test 3");
      await context.close();
    }

    // --- TEST 4: Wrong contract case prevents continuation ---
    console.log("\n--- TEST 4: Wrong contract case prevents continuation ---");
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      const { routeHandler } = setupMockRpc(page, { failReads: false });
      await page.route("**/studio.genlayer.com/api", routeHandler);

      await page.addInitScript(() => {
        const foreignCase = {
          id: "et-foreign-contract-1",
          owner: "0x1BD6Eabf3fE310822835F678396c83b7e5EA859B",
          status: "CREATED",
          manifest: {
            claim: "Foreign contract claim",
            language: "en",
            sources: [{ id: "src-1", url: "https://example.com", role: "submitted", parentSourceId: null, title: "example" }],
            policyVersion: "echotrace-policy-1.0.0",
            clientRequestId: "req-foreign",
            parentCaseId: null,
            manifestCanonical: "{}",
          },
          reviews: [],
          relationships: [],
          report: null,
          receipts: [],
          appliedBatches: [],
          chain: {
            caseId: "et-foreign-contract-1",
            owner: "0x1BD6Eabf3fE310822835F678396c83b7e5EA859B",
            contractAddress: "0x1111111111111111111111111111111111111111",
            txs: [{ method: "create_case", hash: "0x1", statusName: "FINALIZED", execution: "SUCCESS", at: new Date().toISOString(), detail: "" }],
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        localStorage.setItem("echotc-ledger-v1", JSON.stringify({
          state: {
            ledger: {
              cases: { "et-foreign-contract-1": foreignCase },
              idempotency: {},
            },
          },
          version: 1,
        }));
      });

      await page.goto(`${STAGING_URL}/cases/et-foreign-contract-1`, { waitUntil: "domcontentloaded" });
      await page.locator("h1").waitFor({ timeout: 15000 });

      const wrongContractState = await page.evaluate(() => {
        const btn = document.querySelector("[data-testid='submit-wallet']");
        const h1 = document.querySelector("h1")?.textContent?.trim();
        const body = document.body.innerText;
        return {
          disabled: btn?.disabled,
          text: btn?.textContent?.trim(),
          h1,
          hasWrongContractBanner: body.includes("Wrong contract: This case belongs to contract 0x1111111111111111111111111111111111111111"),
          isNotOnDevice: body.includes("Case not on this device"),
        };
      });

      console.log("Wrong contract state:", wrongContractState);
      const cannotContinue = wrongContractState.disabled === true || wrongContractState.isNotOnDevice || wrongContractState.hasWrongContractBanner;
      assert.equal(cannotContinue, true, "Wrong-contract case must be blocked from continuation");
      console.log("PASS: Test 4 (Wrong-contract case blocked from continuation)");
      await context.close();
    }

    console.log("\nALL 4 REGRESSION TESTS PASSED CLEANLY!");
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error("REGRESSION TEST FAILED:", err);
  process.exit(1);
});
