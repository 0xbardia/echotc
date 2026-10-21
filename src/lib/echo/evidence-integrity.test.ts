import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

test("Evidence Integrity: exact quote length verification", () => {
  const quote1 =
    "As described in RFC 2606 and RFC 6761, a number of domains such as example.com and example.org are maintained for documentation purposes.";
  const quote2 =
    "They are reserved by the Internet Assigned Numbers Authority (IANA) at the direction of the Internet Engineering Task Force (IETF) as special-use domain names for documentation purposes.";

  // Exact lengths from actual stored quote strings
  assert.equal(quote1.length, 137, "src-1 quote length must be exactly 137 ASCII characters");
  assert.notEqual(quote1.length, 142, "src-1 quote length must not be stale/incorrect 142");

  assert.equal(quote2.length, 186, "src-2 quote length must be exactly 186 ASCII characters");
  assert.notEqual(quote2.length, 178, "src-2 quote length must not be stale/incorrect 178");

  // Pure ASCII verification: ensures length is identical across bytes, code units, and code points
  for (let i = 0; i < quote1.length; i++) {
    assert.ok(quote1.charCodeAt(i) < 128, `src-1 char at ${i} must be ASCII`);
  }
  for (let i = 0; i < quote2.length; i++) {
    assert.ok(quote2.charCodeAt(i) < 128, `src-2 char at ${i} must be ASCII`);
  }
});

test("Evidence Integrity: canonical manifest digest computation", () => {
  const manifest = {
    claim: "The domain names example.com, example.net, and example.org are reserved for documentation purposes.",
    language: "en",
    sources: [
      { id: "src-1", parentSourceId: null, role: "submitted", url: "https://www.iana.org/domains/reserved" },
      { id: "src-2", parentSourceId: null, role: "submitted", url: "https://en.wikipedia.org/wiki/Example.com" },
      { id: "src-3", parentSourceId: null, role: "submitted", url: "https://httpbin.org/html" },
    ],
    policyVersion: "echotrace-policy-1.0.0",
    clientRequestId: "req-repaired-mm-mvhfpo8o",
    parentCaseId: null,
  };

  const canonicalObj = {
    claim: manifest.claim,
    clientRequestId: manifest.clientRequestId,
    language: manifest.language,
    parentCaseId: manifest.parentCaseId,
    policyVersion: manifest.policyVersion,
    sources: manifest.sources,
  };

  const keys = Object.keys(canonicalObj).sort();
  const sortedObj: Record<string, unknown> = {};
  for (const k of keys) sortedObj[k] = (canonicalObj as Record<string, unknown>)[k];

  const canonicalBytes = Buffer.from(JSON.stringify(sortedObj), "utf8");
  const digest = crypto.createHash("sha256").update(canonicalBytes).digest("hex");

  assert.equal(digest, "1c96863679c950cf3460444563363fa35c6e11178f198214c9522c6d66b66614");
});

test("Evidence Integrity: v1.0.0 tag object vs peeled commit separation", () => {
  let tagObject = "";
  let peeledCommit = "";

  try {
    tagObject = execSync("git rev-parse refs/tags/v1.0.0", { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
    peeledCommit = execSync("git rev-parse 'refs/tags/v1.0.0^{commit}'", { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
  } catch {
    // In shallow CI checkout where tags are not fetched by actions/checkout@v4 default
    return;
  }

  assert.equal(tagObject, "728fd688b67d2300d8340d4c2aaaaffc5e6f83f8", "v1.0.0 tag object SHA");
  assert.equal(peeledCommit, "cb8abef0a36d55a557ed5e938475ffa3d725f84a", "v1.0.0 peeled commit SHA");
  assert.notEqual(tagObject, peeledCommit, "Tag object must remain distinct from peeled commit object");
});

test("Evidence Integrity: durable evidence JSON metadata integrity", () => {
  const durableJsonPath = path.resolve(process.cwd(), "EchoTrace/docs/acceptance-evidence-c3a2.json");
  assert.ok(fs.existsSync(durableJsonPath), "EchoTrace/docs/acceptance-evidence-c3a2.json must exist");

  const evidence = JSON.parse(fs.readFileSync(durableJsonPath, "utf8"));
  assert.ok(evidence.metadata, "evidence.metadata must be present");

  const meta = evidence.metadata;
  assert.equal(meta.clientRequestId, "req-repaired-mm-mvhfpo8o");
  assert.equal(meta.canonicalManifestDigest, "1c96863679c950cf3460444563363fa35c6e11178f198214c9522c6d66b66614");
  assert.equal(meta.v1TagObjectSha, "728fd688b67d2300d8340d4c2aaaaffc5e6f83f8");
  assert.equal(meta.v1PeeledCommitSha, "cb8abef0a36d55a557ed5e938475ffa3d725f84a");
  assert.notEqual(meta.v1TagObjectSha, meta.v1PeeledCommitSha);

  const src1 = meta.sources["src-1"];
  const src2 = meta.sources["src-2"];
  const src3 = meta.sources["src-3"];

  assert.ok(src1 && src2 && src3, "all 3 sources must have metadata entries");
  assert.equal(src1.quoteLength, 137, "src-1 quoteLength must be 137");
  assert.notEqual(src1.quoteLength, 142, "src-1 quoteLength must not be 142");
  assert.equal(src1.quote.length, src1.quoteLength, "src-1 quote string length must match reported length");
  assert.equal(src1.quoteOffset, 188, "src-1 quote offset must be 188");
  assert.equal(
    src1.offsetVerificationScope,
    "reported by the accepted execution output; original-text offset not independently rechecked.",
  );

  assert.equal(src2.quoteLength, 186, "src-2 quoteLength must be 186");
  assert.notEqual(src2.quoteLength, 178, "src-2 quoteLength must not be 178");
  assert.equal(src2.quote.length, src2.quoteLength, "src-2 quote string length must match reported length");
  assert.equal(src2.quoteOffset, 872, "src-2 quote offset must be 872");
  assert.equal(
    src2.offsetVerificationScope,
    "reported by the accepted execution output; original-text offset not independently rechecked.",
  );

  assert.equal(src3.quoteLength, 0);
  assert.equal(src3.offsetVerificationScope, "not applicable; stance is unrelated with empty contributions");
});

test("Evidence Integrity: markdown report reconciliation", () => {
  const mdPath = path.resolve(process.cwd(), "EchoTrace/docs/acceptance-evidence-c3a2.md");
  assert.ok(fs.existsSync(mdPath), "EchoTrace/docs/acceptance-evidence-c3a2.md must exist");

  const md = fs.readFileSync(mdPath, "utf8");
  assert.ok(/`src-1`.*137.*188/.test(md), "src-1 length 137 and offset 188 present");
  assert.ok(/`src-2`.*186.*872/.test(md), "src-2 length 186 and offset 872 present");
  assert.ok(
    md.includes("Reported by the accepted execution output; original-text offset not independently rechecked."),
    "scope clause present in report",
  );
  // Verify stale values are not reported
  assert.ok(!/\|\s*142\s*\|/.test(md), "stale length 142 must not be reported");
  assert.ok(!/\|\s*178\s*\|/.test(md), "stale length 178 must not be reported");
});
