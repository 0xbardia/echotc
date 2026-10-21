#!/usr/bin/env node
/**
 * Browser QA Suite for EchoTc
 *
 * Runs deterministic end-to-end browser scenarios against a running preview
 * (defaults to http://127.0.0.1:8080 or BASE_URL env).
 *
 * Options:
 *   --live-reads   Include live read-only RPC calls to GenLayer Studionet (default: disabled)
 *   --base-url     Base URL to test against (default: http://127.0.0.1:8080)
 */

import { chromium } from "playwright";
import { preflight, quoteAnchored } from "../src/lib/echo/policy.ts";

const args = process.argv.slice(2);
const liveReadsEnabled = args.includes("--live-reads") || process.env.LIVE_READS === "true";
const baseUrl = args.find((a) => a.startsWith("--base-url="))?.split("=")[1] || process.env.BASE_URL || "http://127.0.0.1:8080";

const launchOptions = {
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
};
if (process.env.CHROME_BIN) {
  launchOptions.executablePath = process.env.CHROME_BIN;
} else if (process.platform === "linux") {
  // Try system Chrome if playwright-bundled browser is not installed
  try {
    const fs = await import("node:fs");
    if (fs.existsSync("/usr/bin/google-chrome")) {
      launchOptions.executablePath = "/usr/bin/google-chrome";
    }
  } catch {
    // Non-linux environments or missing chrome binary fall through to default Playwright browser
  }
}

const browser = await chromium.launch(launchOptions);
const page = await browser.newPage();
const results = [];

function record(category, scenario, status, detail) {
  results.push({ category, scenario, status, detail });
  console.log(`[${status}] ${category} :: ${scenario} - ${detail}`);
}

try {
  // 1. ROUTING & ACCESSIBILITY
  const routes = [
    { path: "/", titlePrefix: "EchoTc — Eight articles" },
    { path: "/docs", titlePrefix: "Documentation — EchoTc" },
    { path: "/roadmap", titlePrefix: "Roadmap — EchoTc" },
    { path: "/app", titlePrefix: "Desk — EchoTc" },
    { path: "/app/new", titlePrefix: "New case — EchoTc" },
  ];

  for (const r of routes) {
    const res = await page.goto(`${baseUrl}${r.path}`, { waitUntil: "networkidle" });
    const ok = res.status() === 200;
    const title = await page.title();
    record("Routing", `Route ${r.path} status 200`, ok ? "PASS" : "FAIL", `Status ${res.status()}, title: "${title}"`);
  }

  // Check skip link and H1 hierarchy on landing
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  const skipLink = await page.locator("a.skip").count();
  record("Accessibility", "Skip to content link", skipLink > 0 ? "PASS" : "FAIL", "a.skip present");
  const h1Count = await page.locator("h1").count();
  record("Accessibility", "Heading 1 hierarchy", h1Count >= 1 ? "PASS" : "FAIL", `Found ${h1Count} h1 elements`);

  // 2. RESPONSIVE NAVIGATION & OVERFLOW
  const viewports = [320, 375, 390, 768, 1024, 1080, 1081, 1440];
  for (const w of viewports) {
    await page.setViewportSize({ width: w, height: 800 });

    // Landing page overflow & mobile menu check
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    const landingOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    record("Responsive", `Landing ${w}px overflow`, !landingOverflow ? "PASS" : "FAIL", `scrollWidth <= ${w}px`);

    if (w <= 1080) {
      const lpMenu = await page.locator("details.lp-menu").count();
      record("Responsive", `Landing details.lp-menu at ${w}px`, lpMenu === 1 ? "PASS" : "FAIL", `details.lp-menu count: ${lpMenu}`);
    }

    // Desk page overflow & mobile nav check
    await page.goto(`${baseUrl}/app`, { waitUntil: "networkidle" });
    const deskOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    record("Responsive", `Desk ${w}px overflow`, !deskOverflow ? "PASS" : "FAIL", `scrollWidth <= ${w}px`);

    if (w <= 1080) {
      await page.locator("details.mobile-nav").waitFor({ timeout: 3000 }).catch(() => {});
      const mobileNav = await page.locator("details.mobile-nav").count();
      record("Responsive", `App details.mobile-nav at ${w}px`, mobileNav === 1 ? "PASS" : "FAIL", `details.mobile-nav count: ${mobileNav}`);
    } else {
      const desktopNav = await page.locator("nav.nav-links").isVisible();
      record("Responsive", `Desktop nav visible at ${w}px`, desktopNav ? "PASS" : "FAIL", "nav.nav-links visible");
    }
  }

  // Reset to desktop viewport for form & workflow tests
  await page.setViewportSize({ width: 1280, height: 800 });

  // 3. CLAIM & SOURCE INPUT VALIDATION
  await page.goto(`${baseUrl}/app/new`, { waitUntil: "networkidle" });

  // Blank claim
  await page.getByTestId("claim-input").fill("");
  const continueBtn = page.getByRole("button", { name: "Continue to sources" });
  record("Validation", "Blank claim disables Continue", await continueBtn.isDisabled() ? "PASS" : "FAIL", "Button disabled on empty claim");

  // Whitespace-only claim
  await page.getByTestId("claim-input").fill("   \t\n   ");
  record("Validation", "Whitespace claim disables Continue", await continueBtn.isDisabled() ? "PASS" : "FAIL", "Button disabled on whitespace claim");

  // Unicode / Persian text
  const persianSample = "بررسی سوابق انتشار گزارش مالی شرکت در سال گذشته";
  await page.getByTestId("claim-input").fill(persianSample);
  const claimValue = await page.getByTestId("claim-input").inputValue();
  record("Validation", "Persian / Unicode claim input", claimValue === persianSample ? "PASS" : "FAIL", "Preserved without corruption");

  // Source boundary testing via policy evaluator
  const p = (urls) => preflight("claim text", urls);
  const u = (n) => Array.from({ length: n }, (_, i) => `https://fixtures.echotrace.local/s-${i + 1}.html`);
  const bounds = {
    count0: !p([]).ok,
    count2: !p(u(2)).ok,
    count3: p(u(3)).ok,
    count8: p(u(8)).ok,
    count9: !p(u(9)).ok,
  };
  record("Validation", "Source count 0 rejected", bounds.count0 ? "PASS" : "FAIL", "Preflight fails for 0 sources");
  record("Validation", "Source count 2 rejected", bounds.count2 ? "PASS" : "FAIL", "Preflight fails for 2 sources (min 3)");
  record("Validation", "Source count 3 accepted", bounds.count3 ? "PASS" : "FAIL", "Preflight succeeds for 3 sources");
  record("Validation", "Source count 8 accepted", bounds.count8 ? "PASS" : "FAIL", "Preflight succeeds for 8 sources");
  record("Validation", "Source count 9 rejected", bounds.count9 ? "PASS" : "FAIL", "Preflight fails for 9 sources (max 8)");

  // Quotation fidelity check
  const pageContent = "Harborline announced an innovative pilot project in March.";
  const exactSub = "announced an innovative pilot project";
  const inventedSub = "announced a revolutionary contract";
  const quoteFidelity = quoteAnchored(pageContent, exactSub) && !quoteAnchored(pageContent, inventedSub);
  record("Validation", "Quotation fidelity (strict substring)", quoteFidelity ? "PASS" : "FAIL", "Anchored quote must strictly exist in page content");

  // Insecure scheme rejection in UI
  await page.getByTestId("use-example").click();
  await page.waitForTimeout(300);
  await page.getByTestId("url-0").fill("http://insecure.example.com/report");
  await page.getByTestId("run-preflight").click();
  await page.waitForTimeout(500);
  const errorText = await page.locator("p.error[role='alert']").innerText().catch(() => "");
  record("Validation", "Insecure scheme rejected in UI", errorText.includes("Only public https") ? "PASS" : "FAIL", `Alert: "${errorText}"`);

  // Restore valid fixtures and complete preflight
  await page.getByTestId("load-example").click();
  await page.waitForTimeout(300);
  await page.getByTestId("run-preflight").click();
  await page.locator(".banner-ok").waitFor({ state: "visible", timeout: 5000 });

  // 4. DIRECT MODE WORKFLOW
  await page.getByTestId("to-manifest").click();
  await page.waitForTimeout(300);
  await page.getByTestId("confirm-manifest").check();
  await page.getByTestId("create-case").click();
  await page.waitForURL(/\/cases\/et-[a-f0-9]{8,12}/, { timeout: 10000 });
  const caseUrl = page.url();
  record("Direct Workflow", "Case creation navigates to /cases/:id", caseUrl.includes("/cases/et-") ? "PASS" : "FAIL", `URL: ${caseUrl}`);

  // Deny preserves CREATED state
  let statusText = await page.getByTestId("case-status").innerText();
  record("Direct Workflow", "Initial state is CREATED", statusText.includes("CREATED") ? "PASS" : "FAIL", `Status: ${statusText}`);
  await page.getByTestId("deny").click();
  await page.waitForTimeout(400);
  statusText = await page.getByTestId("case-status").innerText();
  record("Direct Workflow", "Deny keeps state at CREATED", statusText.includes("CREATED") ? "PASS" : "FAIL", `Status after deny: ${statusText}`);

  // Approve through to finalization
  let approvals = 0;
  while (approvals < 8) {
    const approveBtn = page.getByTestId("approve");
    if (!(await approveBtn.isVisible()) || (await approveBtn.isDisabled())) break;
    await approveBtn.click();
    await page.waitForTimeout(500);
    approvals++;
  }
  statusText = await page.getByTestId("case-status").innerText();
  record("Direct Workflow", "Approved workflow reaches FINALIZED", statusText.includes("FINALIZED") ? "PASS" : "FAIL", `Final status: ${statusText}`);
  const hasPartialBanner = await page.getByTestId("partial-banner").isVisible();
  record("Direct Workflow", "Partial report clearly indicated", hasPartialBanner ? "PASS" : "FAIL", "Partial banner rendered");

  // Rehydration from localStorage
  await page.reload({ waitUntil: "networkidle" });
  statusText = await page.getByTestId("case-status").innerText();
  record("Direct Workflow", "State restored identically on reload", statusText.includes("FINALIZED") ? "PASS" : "FAIL", `Restored: ${statusText}`);

  // Direct Mode local view read
  await page.getByTestId("read-method").selectOption("get_report");
  await page.getByTestId("local-read").click();
  await page.waitForTimeout(300);
  const localOut = await page.getByTestId("read-out").innerText();
  record("Direct Workflow", "Local read returns report", localOut.includes('"finalized": true') ? "PASS" : "FAIL", "Report verified via local-read");

  // 5. RESILIENCE & ERROR HANDLING
  // Deep link to missing case
  await page.goto(`${baseUrl}/cases/et-nonexistent-0000`, { waitUntil: "networkidle" });
  const missingText = await page.locator("body").innerText();
  record("Resilience", "Missing case deep link", missingText.includes("Case not on this device") ? "PASS" : "FAIL", "Friendly missing record notice");

  // Corrupt localStorage handling
  const validLedger = await page.evaluate(() => localStorage.getItem("echotc-ledger-v1") || localStorage.getItem("echotrace-ledger-v1"));
  await page.evaluate(() => {
    localStorage.setItem("echotc-ledger-v1", "{ broken:::json ");
  });
  await page.goto(`${baseUrl}/app`, { waitUntil: "networkidle" });
  const deskText = await page.locator("body").innerText();
  record("Resilience", "Corrupt localStorage handled gracefully", deskText.includes("Intake Desk") || deskText.includes("Desk") ? "PASS" : "FAIL", "Desk rendered without crash");

  // Storage migration verification: seed legacy key only, verify migration to new key
  await page.evaluate(() => {
    const legacy = JSON.stringify({
      state: {
        ledger: {
          cases: {
            "et-migrated-888": {
              id: "et-migrated-888",
              owner: "preview:local",
              status: "FINALIZED",
              manifest: {
                claim: "Migrated case from legacy ledger",
                language: "en",
                sources: [],
                policyVersion: "echotrace-policy-1.0.0",
                clientRequestId: "req-migrated",
                parentCaseId: null
              },
              manifestCanonical: "{}",
              reviews: [],
              relationships: [],
              report: { complete: true, partial: false },
              appliedBatches: [],
              receipts: [],
              createdAt: "2026-10-17T00:00:00.000Z",
              updatedAt: "2026-10-17T00:00:00.000Z"
            }
          }
        },
        drafts: {}
      },
      version: 0
    });
    localStorage.removeItem("echotc-ledger-v1");
    localStorage.setItem("echotrace-ledger-v1", legacy);
  });
  await page.goto(`${baseUrl}/app`, { waitUntil: "networkidle" });
  const migratedDeskText = await page.locator("body").innerText();
  const legacyStillPresent = await page.evaluate(() => Boolean(localStorage.getItem("echotrace-ledger-v1")));
  record("Storage Migration", "Legacy case restored and preserved", migratedDeskText.includes("et-migrated-888") && legacyStillPresent ? "PASS" : "FAIL", "Legacy case rendered; legacy storage untouched");

  // Restore valid ledger for subsequent reads
  if (validLedger) {
    await page.evaluate((val) => localStorage.setItem("echotc-ledger-v1", val), validLedger);
  }

  // Disconnected wallet note
  const connectBtn = page.getByRole("button", { name: "Connect wallet" });
  if (await connectBtn.isVisible()) {
    await connectBtn.click();
    await page.waitForTimeout(400);
    const note = await page.locator(".wallet-note").innerText().catch(() => "");
    record("Wallet UX", "Missing wallet instructions", note.includes("No browser wallet") ? "PASS" : "FAIL", note);
  }

  // 6. OPT-IN LIVE READS (STUDIONET)
  if (liveReadsEnabled) {
    console.log("\n--- Running Opt-in Live Studionet Read Methods ---");
    await page.goto(caseUrl, { waitUntil: "networkidle" });
    const methods = [
      "get_policy_version",
      "get_policy",
      "get_case_count",
      "get_case",
      "get_source_review",
      "get_relationships",
      "get_report",
    ];
    for (const m of methods) {
      await page.getByTestId("read-method").selectOption(m);
      await page.getByTestId("chain-read").click();
      await page.waitForFunction(
        () => {
          const text = document.querySelector("[data-testid='read-out']")?.textContent || "";
          return text.includes('"readAt"') || text.includes('"error"');
        },
        { timeout: 30000 }
      );
      const out = await page.getByTestId("read-out").innerText();
      record("Studionet Reads", `Method ${m}`, out.includes('"ok": true') ? "PASS" : "FAIL", `Response preview: ${out.slice(0, 80).replaceAll("\n", " ")}`);
    }
  } else {
    record("Studionet Reads", "Live Studionet reads", "NOT RUN (OPT-IN)", "Use --live-reads flag to execute readContract against live Studionet");
  }

  console.log("\n=== EXECUTION SUMMARY ===");
  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const notRun = results.filter((r) => r.status.includes("NOT RUN")).length;
  console.log(`PASS: ${pass} | FAIL: ${fail} | NOT RUN: ${notRun}`);

  if (fail > 0) process.exitCode = 1;
} catch (error) {
  console.error("FATAL RUNNER ERROR:", error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
