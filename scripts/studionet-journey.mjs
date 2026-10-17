import fs from "node:fs";
import { createPublicClient, createWalletClient, http, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { studionet } from "genlayer-js/chains";
import { chromium } from "playwright";

let key = "";
if (fs.existsSync("/root/EchoTrace/.echo-test-wallet.json")) {
  key = JSON.parse(fs.readFileSync("/root/EchoTrace/.echo-test-wallet.json", "utf8")).privateKey;
} else if (fs.existsSync("/tmp/echo-key.txt")) {
  key = fs.readFileSync("/tmp/echo-key.txt", "utf8").trim();
}
const account = privateKeyToAccount(key);
const transport = http("https://studio.genlayer.com/api", { timeout: 120_000 });
const publicClient = createPublicClient({ chain: studionet, transport });
const wallet = createWalletClient({ account, chain: studionet, transport });
const abi = studionet.consensusMainContract.abi;

async function sendTx(tx) {
  const hash = await wallet.sendTransaction({
    to: tx.to,
    data: tx.data,
    value: tx.value ? BigInt(tx.value) : 0n,
    gas: tx.gas ? BigInt(tx.gas) : undefined,
    gasPrice: tx.gasPrice ? BigInt(tx.gasPrice) : undefined,
    nonce: tx.nonce != null ? Number(tx.nonce) : undefined,
    type: "legacy",
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 180_000 });
  if (receipt.status !== "success") throw new Error(`EVM transaction reverted: ${hash}`);
  const logs = parseEventLogs({ abi, eventName: "NewTransaction", logs: receipt.logs });
  const txId = logs[0]?.args?.txId;
  if (!txId) throw new Error(`No NewTransaction event on ${hash}`);
  return txId;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.setDefaultTimeout(30_000);
await page.exposeFunction("__echoSend", (tx) => sendTx(tx));
await page.exposeFunction("__echoSign", (message) => account.signMessage({ message: { raw: message } }));
await page.addInitScript((address) => {
  window.ethereum = {
    isMetaMask: true,
    isConnected: () => true,
    selectedAddress: address,
    chainId: "0xf22f",
    request: async ({ method, params = [] }) => {
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [address];
      if (method === "eth_chainId" || method === "net_version") return method === "net_version" ? "61999" : "0xf22f";
      if (method === "wallet_getSnaps") return {};
      if (method === "wallet_requestSnaps") return {};
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
    enable: async () => [address],
  };
  const info = {
    uuid: "0f0e0d0c-0b0a-0908-0706-050403020100",
    name: "Echo Preview",
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>",
    rdns: "dev.echotrace.preview",
  };
  const announce = () => {
    window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider: window.ethereum }) }));
  };
  window.addEventListener("eip6963:requestProvider", announce);
}, account.address);

const log = [];
function note(line) {
  log.push(line);
  console.log(line);
}

try {
  await page.goto("http://127.0.0.1:8080/app/new", { waitUntil: "networkidle" });
  await page.evaluate(() => window.dispatchEvent(new Event("eip6963:requestProvider")));
  await page.waitForTimeout(800);
  const already = await page.locator("body").innerText();
  if (!already.includes(account.address.slice(0, 4))) {
    await page.getByRole("button", { name: /connect wallet/i }).click();
    await page.waitForTimeout(1000);
    await page.getByTestId("rk-wallet-option-dev.echotrace.preview").click({ force: true });
    await page.waitForTimeout(1500);
  }
  note(`header has account: ${(await page.locator("body").innerText()).includes(account.address.slice(0, 4))}`);
  await page.getByTestId("use-public").click();
  await page.getByTestId("run-preflight").click();
  await page.getByTestId("to-manifest").click();
  await page.getByTestId("confirm-manifest").check();
  await page.getByTestId("create-case").click();
  await page.getByTestId("chain-panel").waitFor();
  note(`case url ${page.url()}`);

  for (let step = 1; step <= 12; step += 1) {
    const button = page.getByTestId("submit-wallet");
    if (await button.isDisabled()) {
      note(`stop: submit disabled at step ${step}`);
      break;
    }
    const before = (await page.getByTestId("chain-note").textContent().catch(() => "")) || "";
    await button.click();
    await page.waitForFunction(
      (previous) => {
        const text = document.querySelector("[data-testid='chain-note']")?.textContent || "";
        return Boolean(text) && text !== previous && !text.startsWith("Preparing") && !text.startsWith("Wallet prompt");
      },
      before,
      { timeout: 900_000 },
    );
    const text = await page.getByTestId("chain-note").innerText();
    note(`step ${step}: ${text}`);
    if (/UNDETERMINED/.test(text)) continue;
    if (/finalize_case/.test(text) && /SUCCESS|FINISHED_WITH_RETURN/.test(text)) break;
    if (/did not succeed|Timed out|No further/.test(text)) break;
  }

  const chainId = await page.getByTestId("chain-case-id").innerText();
  note(chainId);
  for (const method of ["get_policy_version", "get_policy", "get_case_count", "get_case", "get_source_review", "get_relationships", "get_report"]) {
    await page.getByTestId("read-method").selectOption(method);
    await page.getByTestId("chain-read").click();
    await page.waitForFunction(() => {
      const text = document.querySelector("[data-testid='read-out']")?.textContent || "";
      return text.includes("\"readAt\"") || text.includes("\"error\"");
    }, { timeout: 60_000 });
    const body = await page.getByTestId("read-out").innerText();
    note(`READ ${method}\n${body.slice(0, 1200)}`);
  }
  await page.screenshot({ path: "/tmp/echo-journey.png", fullPage: true });
} catch (error) {
  note(`JOURNEY ERROR ${error instanceof Error ? error.stack : error}`);
  await page.screenshot({ path: "/tmp/echo-journey-error.png", fullPage: true }).catch(() => {});
  const text = await page.locator("body").innerText().catch(() => "");
  fs.writeFileSync("/tmp/echo-journey-body.txt", text.slice(0, 8000));
  process.exitCode = 1;
} finally {
  fs.writeFileSync("/tmp/echo-journey.log", log.join("\n"));
  await browser.close();
}
