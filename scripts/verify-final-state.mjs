import { chromium } from "playwright";

const STAGING_URL = "http://127.0.0.1:8082";
const TARGET_CASE_ID = "et-951e94e89129";
const OWNER_ADDRESS = "0x1BD6Eabf3fE310822835F678396c83b7e5EA859B";
const STRANGER_ADDRESS = "0x2222222222222222222222222222222222222222";

async function verifyDeskAs(account) {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });

  const page = await browser.newPage();

  if (account) {
    await page.addInitScript((signer) => {
      window.ethereum = {
        isMetaMask: true,
        isConnected: () => true,
        selectedAddress: signer,
        chainId: "0xf22f",
        request: async ({ method }) => {
          if (method === "eth_requestAccounts" || method === "eth_accounts") return [signer];
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
        window.dispatchEvent(new CustomEvent("eip6963:announceProvider", {
          detail: Object.freeze({ info, provider: window.ethereum }),
        }));
      });
    }, account);
  }

  await page.goto(`${STAGING_URL}/cases/${TARGET_CASE_ID}`, { waitUntil: "domcontentloaded" });
  if (account) {
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
      await page.waitForTimeout(1500);
    }
  }

  // Settle
  for (let s = 0; s < 25; s++) {
    const txt = await page.evaluate(() => document.querySelector("[data-testid='submit-wallet']")?.textContent?.trim() || "");
    if (txt && !txt.includes("Refreshing") && !txt.includes("Opening")) break;
    await page.waitForTimeout(500);
  }

  const result = await page.evaluate(() => {
    const status = document.querySelector("[data-testid='case-status']")?.textContent?.trim();
    const btn = document.querySelector("[data-testid='submit-wallet']");
    const h2 = document.querySelector("[data-testid='chain-panel'] h2")?.textContent?.trim();
    const chainCaseId = document.querySelector("[data-testid='chain-case-id']")?.textContent?.trim();
    const reportText = document.querySelector("[data-testid='chain-report']")?.textContent?.trim();
    const body = document.body.innerText;
    return {
      status,
      btnDisabled: btn?.disabled,
      btnText: btn?.textContent?.trim(),
      heading: h2,
      chainCaseId,
      reportText,
      hasCompleteBanner: body.includes("complete report") || body.includes("Direct Mode report is complete"),
      hasReadOnlyBanner: body.includes("Read-only: This case is owned on Studionet"),
    };
  });

  await browser.close();
  return result;
}

async function main() {
  console.log("=== Checking Clean-Session Owner Desk ===");
  const ownerState = await verifyDeskAs(OWNER_ADDRESS);
  console.log("Owner State:", JSON.stringify(ownerState, null, 2));

  console.log("\n=== Checking Clean-Session Non-Owner Desk ===");
  const strangerState = await verifyDeskAs(STRANGER_ADDRESS);
  console.log("Stranger State:", JSON.stringify(strangerState, null, 2));

  console.log("\n=== Checking Clean-Session Anonymous Desk ===");
  const anonState = await verifyDeskAs(null);
  console.log("Anonymous State:", JSON.stringify(anonState, null, 2));
}

main().catch(console.error);
