import assert from "node:assert/strict";
import test from "node:test";
import { chromium, type Browser } from "playwright";

const STAGING_URL = "http://127.0.0.1:8082";
const TARGET_CASE_ID = "et-951e94e89129";
const OWNER_ADDRESS = "0x1BD6Eabf3fE310822835F678396c83b7e5EA859B";
const STRANGER_ADDRESS = "0x2222222222222222222222222222222222222222";

function setupWalletScript(signerAddress: string | null) {
  return (signer: string | null) => {
    window.ethereum = {
      isMetaMask: true,
      isConnected: () => Boolean(signer),
      selectedAddress: signer,
      chainId: "0xf22f",
      request: async ({ method, params = [] }: { method: string; params?: unknown[] }) => {
        if (method === "eth_requestAccounts" || method === "eth_accounts") return signer ? [signer] : [];
        if (method === "eth_chainId" || method === "net_version") return method === "net_version" ? "61999" : "0xf22f";
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
    };
    const info = {
      uuid: "0f0e0d0c-0b0a-0908-0706-050403020100",
      name: "Echo Preview",
      icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>",
      rdns: "dev.echotrace.preview",
    };
    window.addEventListener("eip6963:requestProvider", () => {
      window.dispatchEvent(new CustomEvent("eip6963:announceProvider", {
        detail: Object.freeze({ info, provider: window.ethereum }),
      }));
    });
  };
}

async function connectWallet(page: import("playwright").Page) {
  await page.evaluate(() => window.dispatchEvent(new Event("eip6963:requestProvider")));
  await page.waitForFunction(() => {
    const b = Array.from(document.querySelectorAll("button")).find((el) => el.textContent?.includes("Connect wallet"));
    return b && !b.disabled;
  }, { timeout: 15000 }).catch(() => {});

  const connectBtn = page.getByRole("button", { name: /connect wallet/i });
  if (await connectBtn.isVisible()) {
    await connectBtn.click();
    await page.waitForTimeout(800);
    const option = page.getByTestId("rk-wallet-option-dev.echotrace.preview");
    if (await option.isVisible()) {
      await option.click({ force: true });
      await page.waitForTimeout(1000);
    }
  }
}

test("Regression: Empty localStorage direct navigation enables review_sources_batch for connected owner", async (t) => {
  const browser: Browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  t.after(async () => {
    await browser.close();
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  // 1. Ensure empty localStorage
  await page.addInitScript(setupWalletScript(OWNER_ADDRESS), OWNER_ADDRESS);

  // 2. Direct navigation to authoritative chain case
  await page.goto(`${STAGING_URL}/cases/${TARGET_CASE_ID}`, { waitUntil: "domcontentloaded" });
  await connectWallet(page);

  // 3. Wait for hydration and mirror read to settle
  for (let s = 0; s < 20; s++) {
    const txt = await page.getByTestId("submit-wallet").innerText().catch(() => "");
    if (!txt.includes("Refreshing") && !txt.includes("Opening")) break;
    await page.waitForTimeout(1000);
  }

  // 4. Verify exactly review_sources_batch is planned and enabled
  const submitBtn = page.getByTestId("submit-wallet");
  const isDis = await submitBtn.isDisabled();
  const txt = await submitBtn.innerText();
  const heading = await page.locator("[data-testid='chain-panel'] h2").innerText();

  assert.equal(isDis, false, "Submit button must be enabled for connected owner after hydration");
  assert.equal(txt, "Sign this step", "Button must indicate ready to sign");
  assert.equal(heading, "Review the next source batch", "Planner must target exactly review_sources_batch for CREATED case");

  // 5. Verify owner sees NO read-only banner or write-refusal banner
  const bodyText = await page.locator("body").innerText();
  assert.equal(bodyText.includes("Writes are refused because this principal does not own the case"), false, "Owner must not see write refusal banner");
  assert.equal(bodyText.includes("Read-only: This case is owned on Studionet"), false, "Owner must not see read-only banner");

  await context.close();
});

test("Regression: Non-owner connected wallet remains strictly read-only and cannot submit", async (t) => {
  const browser: Browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  t.after(async () => {
    await browser.close();
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  await page.addInitScript(setupWalletScript(STRANGER_ADDRESS), STRANGER_ADDRESS);
  await page.goto(`${STAGING_URL}/cases/${TARGET_CASE_ID}`, { waitUntil: "domcontentloaded" });
  await connectWallet(page);

  for (let s = 0; s < 20; s++) {
    const txt = await page.getByTestId("submit-wallet").innerText().catch(() => "");
    if (!txt.includes("Refreshing") && !txt.includes("Opening")) break;
    await page.waitForTimeout(1000);
  }

  const submitBtn = page.getByTestId("submit-wallet");
  const isDis = await submitBtn.isDisabled();
  const txt = await submitBtn.innerText();
  const bodyText = await page.locator("body").innerText();

  assert.equal(isDis, true, "Submit button must be strictly disabled for non-owner");
  assert.ok(txt.includes("Read-only") || txt.includes("not the owner"), `Button text must indicate read-only restriction: got "${txt}"`);
  assert.ok(bodyText.includes("Read-only: This case is owned on Studionet"), "Read-only ownership banner must be visible to non-owner");

  await context.close();
});

test("Regression: Pending reads and RPC failures block submission; retry recovers after read failure", async (t) => {
  const browser: Browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  t.after(async () => {
    await browser.close();
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  let failReads = true;
  await page.exposeFunction("__handleRpc", (method: string) => {
    if (failReads && (method === "gen_call" || method === "eth_call")) {
      throw new Error("Simulated transient RPC timeout / Studionet 503");
    }
    return undefined;
  });

  await page.addInitScript((signerAddress) => {
    window.ethereum = {
      isMetaMask: true,
      isConnected: () => true,
      selectedAddress: signerAddress,
      chainId: "0xf22f",
      request: async ({ method, params = [] }: { method: string; params?: unknown[] }) => {
        if (method === "eth_requestAccounts" || method === "eth_accounts") return [signerAddress];
        if (method === "eth_chainId" || method === "net_version") return method === "net_version" ? "61999" : "0xf22f";
        await (window as unknown as { __handleRpc: (m: string) => Promise<unknown> }).__handleRpc(method);
        const response = await fetch("https://studio.genlayer.com/api", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        });
        const body = await response.json();
        return body.result;
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
      window.dispatchEvent(new CustomEvent("eip6963:announceProvider", {
        detail: Object.freeze({ info, provider: window.ethereum }),
      }));
    });
  }, OWNER_ADDRESS);

  await page.goto(`${STAGING_URL}/cases/${TARGET_CASE_ID}`, { waitUntil: "domcontentloaded" });
  await connectWallet(page);

  // Initial read fails:
  await page.waitForTimeout(3000);
  const submitBtn = page.getByTestId("submit-wallet");
  const isDisOnFail = await submitBtn.isDisabled();
  const txtOnFail = await submitBtn.innerText();
  const retryBtn = page.getByTestId("retry-mirror-read");

  // Verify RPC failure does NOT permit premature submission
  assert.equal(isDisOnFail, true, "Submit button must be disabled when chain read fails");
  assert.ok(txtOnFail.includes("failed") || isDisOnFail, "Must not allow signing step on failed read");
  assert.equal(await retryBtn.isVisible(), true, "Retry button must be visible upon read failure");

  // Now recover: allow RPC reads and click retry
  failReads = false;
  await retryBtn.click();

  // Wait for retry recovery
  for (let s = 0; s < 20; s++) {
    const txt = await submitBtn.innerText().catch(() => "");
    if (!txt.includes("Refreshing") && !txt.includes("failed")) break;
    await page.waitForTimeout(1000);
  }

  const isDisRecovered = await submitBtn.isDisabled();
  const txtRecovered = await submitBtn.innerText();

  assert.equal(isDisRecovered, false, "Submit button must enable after successful retry");
  assert.equal(txtRecovered, "Sign this step", "Button must be ready to sign after recovery");

  await context.close();
});
