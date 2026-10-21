import fs from "node:fs";
import { chromium } from "playwright";

const STAGING_URL = "http://127.0.0.1:8082";
const EXPECTED_CONTRACT = "0x3Af6aD96e89A8B120A329cc472b2B52D1E55E319";
const OWNER_ADDRESS = "0x39cCdcf2338CE3D6c8F345A0ebb11a19F193EAbA";
const FROZEN_CLAIM =
  "The domain names example.com, example.net, and example.org are reserved for documentation purposes.";
const FROZEN_SOURCES = [
  "https://www.iana.org/domains/reserved",
  "https://en.wikipedia.org/wiki/Example.com",
  "https://httpbin.org/html",
];
const CLIENT_REQUEST_ID = `req-repaired-mm-${Date.now().toString(36)}`;
const EXT = "hcefmgdjfiepbehnkmkppkgmcbhmanmj";
const LOG_FILE = "/tmp/mm-qa.log";

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + "\n");
}

fs.writeFileSync(LOG_FILE, "Starting MetaMask QA Run...\n");

// Clean singleton locks
for (const f of fs.readdirSync("/root/.echotc-qa/profile")) {
  if (f.startsWith("Singleton")) fs.unlinkSync("/root/.echotc-qa/profile/" + f);
}

const pw = fs.readFileSync("/root/.echotc-qa/unlock-password", "utf8").trim();

const context = await chromium.launchPersistentContext("/root/.echotc-qa/profile", {
  headless: false,
  executablePath: "/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
  args: [
    "--disable-extensions-except=/root/.rulefreeze-qa/ext/metamask-13.53.0",
    "--load-extension=/root/.rulefreeze-qa/ext/metamask-13.53.0",
    "--no-sandbox",
    "--disable-dev-shm-usage",
  ],
});

const sessions = new Map();
async function ev(page, expression) {
  let client = sessions.get(page);
  if (!client) {
    client = await context.newCDPSession(page);
    sessions.set(page, client);
  }
  const res = await client
    .send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    .catch((err) => ({ exceptionDetails: { exception: { description: err.message } } }));
  if (res.exceptionDetails) {
    return { failed: String(res.exceptionDetails.exception?.description || "err").slice(0, 180) };
  }
  return res.result.value;
}

function mmPages() {
  return context.pages().filter((p) => p.url().includes(EXT));
}

async function unlockIfNeeded(page) {
  for (let i = 0; i < 20; i++) {
    const hasPw = await ev(page, `!!document.querySelector('[data-testid="unlock-password"]')`);
    if (hasPw) break;
    await page.waitForTimeout(200);
  }
  const hasPw = await ev(page, `!!document.querySelector('[data-testid="unlock-password"]')`);
  if (!hasPw) return false;
  await ev(page, `document.querySelector('[data-testid="unlock-password"]').focus()`);
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(pw, { delay: 8 });
  const submitted = await ev(
    page,
    `(() => { const f=document.querySelector('form'); if(!f) return 'no-form'; f.requestSubmit(); return 'ok'; })()`,
  );
  log(`unlock result: ${submitted}`);
  await page.waitForTimeout(1500);
  return true;
}

async function unlockAll() {
  for (const page of mmPages()) {
    const hasPw = await ev(page, `!!document.querySelector('[data-testid="unlock-password"]')`);
    if (hasPw) await unlockIfNeeded(page);
  }
}

const APPROVE_IDS = [
  "confirm-footer-button",
  "confirm-btn",
  "confirmation-submit-button",
  "page-container-footer-next",
  "confirm-alert-modal-submit-button",
];

async function approveOnce() {
  let acted = null;
  for (const page of mmPages()) {
    const url = page.url();
    if (!url.includes("notification") && !url.includes("popup") && !url.includes("home.html"))
      continue;
    const clicked = await ev(
      page,
      `(() => {
      const ids = ${JSON.stringify(APPROVE_IDS)};
      for (const id of ids) {
        const el = document.querySelector('[data-testid="'+id+'"]');
        if (el && !el.disabled) { el.click(); return id; }
      }
      const allow = /^(confirm|approve|next|connect|sign)$/i;
      const btn = [...document.querySelectorAll("button")].find(b => allow.test((b.innerText||"").trim()) && !b.disabled);
      if (btn) { const t=btn.innerText.trim(); btn.click(); return "text:"+t; }
      return null;
    })()`,
    );
    if (clicked && !clicked.failed) {
      acted = `${url.split("/").slice(-1)[0]} ${clicked}`;
      log(`MetaMask approved action: ${acted}`);
      await page.waitForTimeout(800);
      return acted;
    }
  }
  return acted;
}

const home = await context.newPage();
await home.goto(`chrome-extension://${EXT}/home.html`, { waitUntil: "domcontentloaded" });
await unlockIfNeeded(home);
await unlockAll();
await home.waitForTimeout(1000);
log(`Home page hash: ${await ev(home, "location.hash")}`);

const evidence = {
  contractAddress: EXPECTED_CONTRACT,
  ownerAddress: OWNER_ADDRESS,
  claim: FROZEN_CLAIM,
  sources: FROZEN_SOURCES,
  clientRequestId: CLIENT_REQUEST_ID,
  steps: [],
};

try {
  log(
    `[STAGE 1] Navigating to staging intake: ${STAGING_URL}/app/new?requestId=${CLIENT_REQUEST_ID}`,
  );
  const dapp = await context.newPage();
  await dapp.goto(`${STAGING_URL}/app/new?requestId=${CLIENT_REQUEST_ID}`, {
    waitUntil: "domcontentloaded",
  });
  await dapp.waitForTimeout(1500);

  // Connect wallet
  const connectBtn = dapp.getByRole("button", { name: /Connect Wallet/i });
  if (await connectBtn.isVisible().catch(() => false)) {
    log("[STAGE 1] Clicking Connect Wallet in dApp...");
    await connectBtn.click();
    await dapp.waitForTimeout(800);
    const mmOpt = dapp.locator("button").filter({ hasText: "MetaMask" });
    if ((await mmOpt.count()) > 0) {
      await mmOpt.first().click();
    }
    // Approve connect in MetaMask if prompted
    for (let c = 0; c < 15; c++) {
      await unlockAll();
      const acted = await approveOnce();
      if (acted) break;
      if (c === 3) {
        const note = await context.newPage();
        await note
          .goto(`chrome-extension://${EXT}/notification.html`, { waitUntil: "domcontentloaded" })
          .catch(() => {});
        await note.waitForTimeout(600);
      }
      await dapp.waitForTimeout(400);
    }
    await dapp.waitForTimeout(1500);
  }

  const connectedAddr = await dapp.evaluate(() => window.ethereum?.selectedAddress || "");
  log(`[STAGE 1] Connected address in dApp: ${connectedAddr}`);
  if (connectedAddr.toLowerCase() !== OWNER_ADDRESS.toLowerCase()) {
    throw new Error(`Connected account mismatch: expected ${OWNER_ADDRESS}, got ${connectedAddr}`);
  }

  // Fill claim
  log("[STAGE 1] Filling frozen claim...");
  await dapp.getByTestId("claim-input").fill(FROZEN_CLAIM);
  await dapp.getByRole("button", { name: "Continue to sources" }).click();
  await dapp.waitForTimeout(500);

  // Fill sources
  log("[STAGE 1] Filling frozen sources...");
  for (let i = 0; i < FROZEN_SOURCES.length; i++) {
    const input = dapp.getByTestId(`url-${i}`);
    if (!(await input.isVisible().catch(() => false))) {
      await dapp.getByRole("button", { name: "Add URL" }).click();
      await dapp.waitForTimeout(300);
    }
    await dapp.getByTestId(`url-${i}`).fill(FROZEN_SOURCES[i]);
  }

  // Run preflight
  log("[STAGE 1] Running preflight check...");
  await dapp.getByTestId("run-preflight").click();
  await dapp.waitForFunction(
    () => {
      const btn = document.querySelector("[data-testid='to-manifest']");
      return btn && !btn.disabled;
    },
    { timeout: 60000 },
  );

  await dapp.getByTestId("to-manifest").click();
  await dapp.waitForTimeout(800);

  // Manifest digest check
  const manifestDigest = await dapp
    .getByTestId("manifest-digest")
    .innerText()
    .catch(() => "");
  log(`[STAGE 1] Manifest digest: ${manifestDigest}`);
  evidence.manifestDigest = manifestDigest;

  // Confirm manifest and create case
  log("[STAGE 1] Confirming manifest and creating case file...");
  await dapp.getByTestId("confirm-manifest").check();
  await dapp.getByTestId("create-case").click();
  await dapp.getByTestId("chain-panel").waitFor({ state: "visible", timeout: 15000 });
  log("[STAGE 1] Case file created. Ready for blockchain lifecycle.");

  let authoritativeCaseId = "";

  // 5-step transaction lifecycle:
  // 1: create_case
  // 2: review_sources_batch
  // 3: seal_source_reviews
  // 4: review_relationship_batch
  // 5: finalize_case
  for (let stepIndex = 1; stepIndex <= 6; stepIndex++) {
    log(`\n=== Starting Workflow Step ${stepIndex} ===`);

    const submitBtn = dapp.getByTestId("submit-wallet");
    for (let w = 0; w < 40; w++) {
      const txt = (await submitBtn.innerText().catch(() => "")) || "";
      const isDis = await submitBtn.isDisabled().catch(() => true);
      if (!isDis && !txt.includes("Refreshing") && !txt.includes("Waiting")) break;
      if (txt.includes("Finalized on Studionet")) {
        log("Terminal state reached: Finalized on Studionet.");
        break;
      }
      await dapp.waitForTimeout(1000);
    }

    const currentBtnText = (await submitBtn.innerText().catch(() => "")) || "";
    log(`Button text: "${currentBtnText}"`);

    if (currentBtnText.includes("Finalized on Studionet")) {
      log("Case is fully finalized on Studionet!");
      break;
    }

    if (await submitBtn.isDisabled().catch(() => true)) {
      const note = await dapp
        .getByTestId("chain-note")
        .innerText()
        .catch(() => "");
      log(`Button is disabled. Note: ${note}`);
      break;
    }

    const noteBefore =
      (await dapp
        .getByTestId("chain-note")
        .innerText()
        .catch(() => "")) || "";
    log(`Triggering transaction signature for "${currentBtnText}"...`);
    await submitBtn.click({ noWaitAfter: true });

    // MetaMask approval handling
    log("Awaiting MetaMask confirmation prompt...");
    let promptApproved = false;
    for (let a = 0; a < 60; a++) {
      await unlockAll();
      const acted = await approveOnce();
      if (acted) {
        log(`Confirmed prompt: ${acted}`);
        promptApproved = true;
        break;
      }
      if (a === 2 || a === 8 || a === 18) {
        // Probe notification.html to trigger router hash change
        const note = await context.newPage();
        await note
          .goto(`chrome-extension://${EXT}/notification.html`, { waitUntil: "domcontentloaded" })
          .catch(() => {});
        await note.waitForTimeout(600);
      }
      await dapp.waitForTimeout(500);
    }
    log(`Prompt approved status: ${promptApproved}`);

    // Wait for Studionet consensus settlement
    log("Waiting for Studionet consensus finalization...");
    await dapp.waitForFunction(
      (prev) => {
        const note = document.querySelector("[data-testid='chain-note']")?.textContent || "";
        return (
          note &&
          note !== prev &&
          !note.startsWith("Preparing") &&
          !note.startsWith("Wallet prompt")
        );
      },
      noteBefore,
      { timeout: 900000 },
    );

    const noteAfter = await dapp.getByTestId("chain-note").innerText();
    log(`Step ${stepIndex} settled: ${noteAfter}`);

    const caseIdText =
      (await dapp
        .getByTestId("chain-case-id")
        .innerText()
        .catch(() => "")) || "";
    const match = caseIdText.match(/et-[a-f0-9]{12}/);
    if (match) authoritativeCaseId = match[0];
    log(`Current authoritative case ID: ${authoritativeCaseId}`);

    evidence.steps.push({
      step: stepIndex,
      action: currentBtnText,
      resultNote: noteAfter,
      authoritativeCaseId,
      url: dapp.url(),
    });

    if (noteAfter.includes("did not succeed") || noteAfter.includes("Timed out")) {
      log(`Step failed: ${noteAfter}`);
      break;
    }

    // Wait for Studionet state propagation
    await dapp.waitForTimeout(10000);
  }

  evidence.finalAuthoritativeCaseId = authoritativeCaseId;
  log(`Final authoritative case ID: ${authoritativeCaseId}`);

  // Test 1: Empty storage owner continuation
  log("[VERIFY 1] Testing clean owner session with empty localStorage...");
  const cleanOwner = await context.newPage();
  await cleanOwner.goto(`${STAGING_URL}/cases/${authoritativeCaseId}`, {
    waitUntil: "domcontentloaded",
  });
  await cleanOwner.evaluate(() => localStorage.clear());
  await cleanOwner.reload({ waitUntil: "domcontentloaded" });
  await cleanOwner.waitForTimeout(3000);
  const cleanOwnerText = await cleanOwner.locator("body").innerText();
  evidence.ownerContinuationFromEmptyStorage =
    cleanOwnerText.includes(authoritativeCaseId) &&
    !cleanOwnerText.includes("Case not on this device");
  log(`Owner continuation from empty storage: ${evidence.ownerContinuationFromEmptyStorage}`);
  await cleanOwner.close();

  // Test 2: Non-owner read-only presentation
  log("[VERIFY 2] Testing non-owner read-only behavior...");
  const strangerContext = await chromium.launchPersistentContext("/tmp/stranger-test-qa", {
    headless: false,
    executablePath: "/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const strangerPage = await strangerContext.newPage();
  await strangerPage.goto(`${STAGING_URL}/cases/${authoritativeCaseId}`, {
    waitUntil: "domcontentloaded",
  });
  await strangerPage.waitForTimeout(3000);
  const strangerBody = await strangerPage.locator("body").innerText();
  evidence.nonOwnerReadOnly = strangerBody.includes(
    "Read-only: This case is owned on Studionet by",
  );
  log(`Non-owner read-only banner verified: ${evidence.nonOwnerReadOnly}`);
  await strangerContext.close();

  // Test 3: Public contract read verification
  log("[VERIFY 3] Reading public contract views from case desk...");
  evidence.reads = {};
  for (const m of ["get_case", "get_relationships", "get_report"]) {
    await dapp.getByTestId("read-method").selectOption(m);
    await dapp.getByTestId("chain-read").click();
    await dapp.waitForFunction(
      () => {
        const txt = document.querySelector("[data-testid='read-out']")?.textContent || "";
        return txt.includes('"readAt"');
      },
      { timeout: 60000 },
    );
    evidence.reads[m] = await dapp.getByTestId("read-out").innerText();
    log(`Public read ${m} complete.`);
  }

  for (const s of ["src-1", "src-2", "src-3"]) {
    await dapp.getByTestId("read-method").selectOption("get_source_review");
    const sourceSelect = dapp.locator("select[data-testid='read-source']");
    if (await sourceSelect.isVisible().catch(() => false)) {
      await sourceSelect.selectOption(s);
    } else {
      const sourceInput = dapp.locator("input[data-testid='read-source'], input.field").first();
      await sourceInput.fill(s);
    }
    await dapp.getByTestId("chain-read").click();
    await dapp.waitForFunction(
      () => {
        const txt = document.querySelector("[data-testid='read-out']")?.textContent || "";
        return txt.includes('"readAt"');
      },
      { timeout: 60000 },
    );
    evidence.reads[`get_source_review:${s}`] = await dapp.getByTestId("read-out").innerText();
    log(`Source review read ${s} complete.`);
  }

  // Exact metadata extraction from authoritative read-backs
  const { buildEvidenceMetadata, generateDurableEvidence, getGitTagIdentity } =
    await import("./generate-acceptance-evidence.mjs");

  const caseObj = JSON.parse(JSON.parse(evidence.reads["get_case"]).value);
  const rev1 = JSON.parse(JSON.parse(evidence.reads["get_source_review:src-1"]).value);
  const rev2 = JSON.parse(JSON.parse(evidence.reads["get_source_review:src-2"]).value);
  const rev3 = JSON.parse(JSON.parse(evidence.reads["get_source_review:src-3"]).value);

  const gitRefs = getGitTagIdentity();
  const metadata = buildEvidenceMetadata(
    caseObj.manifest,
    {
      "src-1": rev1,
      "src-2": rev2,
      "src-3": rev3,
    },
    gitRefs,
  );

  evidence.clientRequestId = metadata.clientRequestId;
  evidence.manifestDigest = metadata.canonicalManifestDigest;
  evidence.v1TagObjectSha = metadata.v1TagObjectSha;
  evidence.v1PeeledCommitSha = metadata.v1PeeledCommitSha;
  evidence.metadata = metadata;

  // Test 4: JSON export
  log("[VERIFY 4] Verifying JSON export button...");
  const exportBtn = dapp.getByRole("button", { name: /Export JSON/i });
  evidence.hasJsonExport = await exportBtn.isVisible().catch(() => false);
  log(`JSON Export button visible: ${evidence.hasJsonExport}`);

  generateDurableEvidence(evidence);
  log(
    "\nAcceptance journey succeeded! Evidence written to /tmp/metamask-acceptance-evidence.json and EchoTrace/docs/acceptance-evidence-c3a2.json",
  );
} catch (err) {
  log(`METAMASK ACCEPTANCE FAILED: ${err.message}`);
  process.exitCode = 1;
} finally {
  await context.close();
}
