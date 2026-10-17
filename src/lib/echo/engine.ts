import { fixtureFor } from "./fixtures.ts";
import { buildSources, canonicalManifest, normalizeHttpsUrl, normalizeSpace, preflight, quoteAnchored } from "./policy.ts";
import {
  MAX_ATTEMPTS,
  MAX_SOURCES,
  POLICY_TEXT,
  POLICY_VERSION,
  REL_BATCH,
  SOURCE_BATCH,
  type CaseFile,
  type Contribution,
  type Family,
  type ItemStatus,
  type Ledger,
  type Manifest,
  type Relationship,
  type RelType,
  type Report,
  type SourceReview,
  type Stance,
} from "./types.ts";

export interface EngineOk {
  ok: true;
  ledger: Ledger;
  caseId: string;
}
export interface EngineErr {
  ok: false;
  error: string;
}
export type EngineResult = EngineOk | EngineErr;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function idFor(key: string): string {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `et-${(h >>> 0).toString(16).padStart(8, "0")}`;
}

function rollup(relations: Stance[]): Stance | null {
  if (!relations.length) return null;
  const set = new Set(relations);
  if (set.size === 1) return relations[0];
  return "unclear";
}

function reviewSource(url: string, sourceId: string, attempts: number): SourceReview {
  const page = fixtureFor(url);
  if (!page || page.unavailable || !page.text) {
    return {
      sourceId,
      fetchStatus: page ? "unavailable" : "unavailable",
      stance: null,
      contributions: [],
      attempts,
      coverageNote: page?.coverageNote ?? "Direct Mode has no rendered text for this host.",
      limitations: page
        ? page.limitations
        : "No quote was invented. A deployed contract must render this URL with gl.nondet.web.render before any evidence is accepted.",
    };
  }
  const contributions: Contribution[] = [];
  page.contributions.forEach((item, index) => {
    if (!quoteAnchored(page.text ?? "", item.quote)) return;
    contributions.push({
      id: `ev-${sourceId}-${index + 1}`,
      sourceId,
      quote: normalizeSpace(item.quote),
      evidenceKind: item.evidenceKind,
      originUrl: item.originUrl,
      originLabel: item.originLabel,
      relation: item.relation,
      explanation: item.explanation,
    });
  });
  const fetchStatus: ItemStatus = "reviewed";
  return {
    sourceId,
    fetchStatus,
    stance: contributions.length ? rollup(contributions.map((c) => c.relation)) : "unclear",
    contributions,
    attempts,
    coverageNote: page.coverageNote,
    limitations: page.limitations,
  };
}

function ownerCase(ledger: Ledger, caseId: string, actor: string): CaseFile | EngineErr {
  const found = ledger.cases[caseId];
  if (!found) return { ok: false, error: "Case not found." };
  if (found.owner !== actor) return { ok: false, error: "Only the case owner can change this case." };
  if (found.status === "FINALIZED") return { ok: false, error: "Finalized cases are frozen." };
  return found;
}

export function createCase(
  ledger: Ledger,
  actor: string,
  input: {
    claim: string;
    urls: string[];
    discoveries: string[];
    clientRequestId: string;
    parentCaseId: string | null;
    now: string;
  },
): EngineResult {
  const next = clone(ledger);
  const claim = normalizeSpace(input.claim);
  const gate = preflight(claim, input.urls);
  if (!gate.ok) return { ok: false, error: gate.errors.join(" ") };
  const discoveries: string[] = [];
  for (const raw of input.discoveries) {
    const normalized = normalizeHttpsUrl(raw);
    if ("error" in normalized) return { ok: false, error: normalized.error };
    if (!gate.urls.includes(normalized.url) && !discoveries.includes(normalized.url)) discoveries.push(normalized.url);
  }
  const sources = buildSources(gate.urls, discoveries);
  if (sources.length > MAX_SOURCES) return { ok: false, error: "The manifest exceeds 12 sources." };
  if (input.parentCaseId && !next.cases[input.parentCaseId]) {
    return { ok: false, error: "Parent case does not exist." };
  }
  const canonical = canonicalManifest({
    claim,
    sources,
    clientRequestId: input.clientRequestId,
    parentCaseId: input.parentCaseId,
  });
  const key = `${actor}|${input.clientRequestId}`;
  const prior = next.idempotency[key];
  if (prior) {
    if (prior.manifestCanonical !== canonical) {
      return { ok: false, error: "This request id was already used with a different manifest." };
    }
    return { ok: true, ledger: next, caseId: prior.caseId };
  }
  const manifest: Manifest = {
    claim,
    language: "en",
    sources,
    policyVersion: POLICY_VERSION,
    clientRequestId: input.clientRequestId,
    parentCaseId: input.parentCaseId,
    manifestCanonical: canonical,
  };
  const caseId = idFor(key);
  const file: CaseFile = {
    id: caseId,
    owner: actor,
    status: "CREATED",
    manifest,
    reviews: sources.map((source) => ({
      sourceId: source.id,
      fetchStatus: "pending",
      stance: null,
      contributions: [],
      attempts: 0,
      coverageNote: "",
      limitations: "",
    })),
    relationships: [],
    report: null,
    appliedBatches: [],
    receipts: [],
    createdAt: input.now,
    updatedAt: input.now,
  };
  next.cases[caseId] = file;
  next.idempotency[key] = { caseId, manifestCanonical: canonical };
  return { ok: true, ledger: next, caseId };
}

export function reviewSourcesBatch(
  ledger: Ledger,
  actor: string,
  caseId: string,
  batchId: string,
  now: string,
): EngineResult {
  const next = clone(ledger);
  const found = ownerCase(next, caseId, actor);
  if ("ok" in found) return found;
  if (found.status !== "CREATED" && found.status !== "SOURCE_REVIEW") {
    return { ok: false, error: "Source review is closed." };
  }
  if (found.appliedBatches.includes(batchId)) return { ok: true, ledger: next, caseId };
  const pending = found.reviews.filter((review) => review.fetchStatus === "pending").slice(0, SOURCE_BATCH);
  if (!pending.length) return { ok: false, error: "No pending sources remain." };
  for (const review of pending) {
    const source = found.manifest.sources.find((item) => item.id === review.sourceId);
    if (!source) return { ok: false, error: "Manifest source missing." };
    const reviewed = reviewSource(source.url, source.id, review.attempts + 1);
    const index = found.reviews.findIndex((item) => item.sourceId === review.sourceId);
    found.reviews[index] = reviewed;
  }
  found.status = "SOURCE_REVIEW";
  found.appliedBatches.push(batchId);
  found.updatedAt = now;
  return { ok: true, ledger: next, caseId };
}

export function retryUnavailable(
  ledger: Ledger,
  actor: string,
  caseId: string,
  now: string,
): EngineResult {
  const next = clone(ledger);
  const found = ownerCase(next, caseId, actor);
  if ("ok" in found) return found;
  if (found.status !== "SOURCE_REVIEW" && found.status !== "CREATED") {
    return { ok: false, error: "Retries belong to source review." };
  }
  const targets = found.reviews.filter(
    (review) =>
      (review.fetchStatus === "unavailable" || review.fetchStatus === "failed") &&
      review.attempts < MAX_ATTEMPTS,
  );
  if (!targets.length) return { ok: false, error: "No retryable sources remain." };
  for (const review of targets.slice(0, SOURCE_BATCH)) {
    const source = found.manifest.sources.find((item) => item.id === review.sourceId);
    if (!source) continue;
    const reviewed = reviewSource(source.url, source.id, review.attempts + 1);
    const index = found.reviews.findIndex((item) => item.sourceId === review.sourceId);
    found.reviews[index] = reviewed;
  }
  found.updatedAt = now;
  return { ok: true, ledger: next, caseId };
}

export function classifyRelationship(originUrl: string | null, inManifest: boolean): RelType {
  if (!originUrl) return "distinct_evidence_shown";
  if (!inManifest) return "unresolved";
  return "explicit_dependency";
}

function buildRelationships(file: CaseFile): Relationship[] {
  const map = new Map<string, Relationship>();
  for (const review of file.reviews) {
    if (review.fetchStatus !== "reviewed") continue;
    for (const contribution of review.contributions) {
      const target = contribution.originUrl
        ? file.manifest.sources.find((source) => source.url === contribution.originUrl)
        : undefined;
      const resolvedType = classifyRelationship(contribution.originUrl, Boolean(target));
      const key = `${review.sourceId}|${target?.id ?? contribution.originLabel}|${resolvedType}`;
      const existing = map.get(key);
      if (existing) {
        existing.supportingEvidenceIds.push(contribution.id);
        continue;
      }
      const gap = Boolean(contribution.originUrl) && !target;
      map.set(key, {
        id: `rel-${map.size + 1}`,
        fromSourceId: review.sourceId,
        toSourceId: target?.id ?? null,
        originLabel: contribution.originLabel,
        type: resolvedType,
        supportingEvidenceIds: [contribution.id],
        explanation: gap
          ? `${contribution.explanation} The origin was not in the frozen manifest, so it stays an origin gap.`
          : contribution.explanation,
        status: "pending",
      });
    }
  }
  return [...map.values()];
}

export function sealSourceReviews(ledger: Ledger, actor: string, caseId: string, now: string): EngineResult {
  const next = clone(ledger);
  const found = ownerCase(next, caseId, actor);
  if ("ok" in found) return found;
  if (found.status !== "SOURCE_REVIEW") return { ok: false, error: "Seal is only available during source review." };
  if (found.reviews.some((review) => review.fetchStatus === "pending")) {
    return { ok: false, error: "Pending sources cannot be sealed." };
  }
  found.relationships = buildRelationships(found);
  found.status = "RELATIONSHIP_REVIEW";
  found.updatedAt = now;
  return { ok: true, ledger: next, caseId };
}

export function reviewRelationshipBatch(
  ledger: Ledger,
  actor: string,
  caseId: string,
  batchId: string,
  now: string,
): EngineResult {
  const next = clone(ledger);
  const found = ownerCase(next, caseId, actor);
  if ("ok" in found) return found;
  if (found.status !== "RELATIONSHIP_REVIEW") return { ok: false, error: "Relationship review is not open." };
  if (found.appliedBatches.includes(batchId)) return { ok: true, ledger: next, caseId };
  const pending = found.relationships.filter((item) => item.status === "pending").slice(0, REL_BATCH);
  if (!pending.length) return { ok: false, error: "No pending relationships remain." };
  for (const item of pending) item.status = "reviewed";
  found.appliedBatches.push(batchId);
  found.updatedAt = now;
  return { ok: true, ledger: next, caseId };
}

function familiesOf(file: CaseFile): Family[] {
  const groups = new Map<string, Family>();
  for (const review of file.reviews) {
    for (const contribution of review.contributions) {
      const key = contribution.originLabel;
      const current = groups.get(key) ?? {
        originLabel: contribution.originLabel,
        originUrl: contribution.originUrl,
        contributionIds: [],
        sourceIds: [],
        reviewed: contribution.originUrl
          ? file.manifest.sources.some((source) => source.url === contribution.originUrl)
          : true,
      };
      current.contributionIds.push(contribution.id);
      if (!current.sourceIds.includes(review.sourceId)) current.sourceIds.push(review.sourceId);
      groups.set(key, current);
    }
  }
  return [...groups.values()];
}

function buildReport(file: CaseFile): Report {
  const count = (status: ItemStatus) => file.reviews.filter((review) => review.fetchStatus === status).length;
  const unresolved = file.relationships
    .filter((item) => item.type === "unresolved" || item.toSourceId === null && item.type !== "distinct_evidence_shown")
    .map((item) => `${item.originLabel}: ${item.explanation}`);
  const partial = count("unavailable") + count("failed") + count("rejected") > 0 || unresolved.length > 0;
  return {
    complete: !partial && file.reviews.every((review) => review.fetchStatus === "reviewed"),
    partial,
    sourcesReviewed: count("reviewed"),
    sourcesUnavailable: count("unavailable"),
    sourcesRejected: count("rejected"),
    sourcesFailed: count("failed"),
    relationshipCoverage: `${file.relationships.filter((item) => item.status === "reviewed").length}/${file.relationships.length} scheduled relationships recorded`,
    families: familiesOf(file),
    unresolved,
    limitations: [
      "EchoTc does not certify the claim.",
      "Article count is not a witness count.",
      "Direct Mode used the labeled fixture library or recorded an unrendered host. It is not Studionet consensus.",
      POLICY_TEXT,
    ],
    policyVersion: POLICY_VERSION,
    contractIdentity: "direct-mode:" + POLICY_VERSION,
  };
}

export function finalizeCase(ledger: Ledger, actor: string, caseId: string, now: string): EngineResult {
  const next = clone(ledger);
  const found = ownerCase(next, caseId, actor);
  if ("ok" in found) return found;
  if (found.status !== "RELATIONSHIP_REVIEW") return { ok: false, error: "Finalize is only available after seal." };
  if (found.relationships.some((item) => item.status === "pending")) {
    return { ok: false, error: "Relationship coverage is incomplete." };
  }
  if (!found.reviews.some((review) => review.fetchStatus === "reviewed")) {
    return { ok: false, error: "Refusing to finalize a case with no reviewed source." };
  }
  found.report = buildReport(found);
  found.status = "FINALIZED";
  found.updatedAt = now;
  return { ok: true, ledger: next, caseId };
}

export interface PlannedAction {
  method:
    | "review_sources_batch"
    | "seal_source_reviews"
    | "review_relationship_batch"
    | "finalize_case";
  batchId: string | null;
  title: string;
  explain: string;
  remaining: number;
}

export function plan(file: CaseFile): PlannedAction | null {
  if (file.status === "FINALIZED") return null;
  const pendingSources = file.reviews.filter((review) => review.fetchStatus === "pending").length;
  const sourceBatches = Math.ceil(pendingSources / SOURCE_BATCH);
  const pendingRels =
    file.status === "RELATIONSHIP_REVIEW"
      ? file.relationships.filter((item) => item.status === "pending").length
      : 0;
  const relBatches = file.status === "RELATIONSHIP_REVIEW" ? Math.ceil(pendingRels / REL_BATCH) : 1;
  if (file.status === "CREATED" || file.status === "SOURCE_REVIEW") {
    if (pendingSources) {
      const first = file.reviews.find((review) => review.fetchStatus === "pending");
      return {
        method: "review_sources_batch",
        batchId: `src-${first?.sourceId}`,
        title: "Review sources",
        explain:
          "The next pending sources are rendered and checked. Quotes that are not in the observed text are dropped. You are not choosing which sources to skip.",
        remaining: sourceBatches + 1 + relBatches + 1,
      };
    }
    return {
      method: "seal_source_reviews",
      batchId: null,
      title: "Seal source reviews",
      explain:
        "Sealing freezes the evidence and derives the relationship schedule from it. Unavailable sources stay unavailable. They are not turned into verdicts.",
      remaining: 1 + relBatches + 1,
    };
  }
  if (pendingRels) {
    const first = file.relationships.find((item) => item.status === "pending");
    return {
      method: "review_relationship_batch",
      batchId: `rel-${first?.id}`,
      title: "Record relationships",
      explain:
        "This records the next derived relationships. It does not let you delete an origin or type a verdict.",
      remaining: relBatches + 1,
    };
  }
  return {
    method: "finalize_case",
    batchId: null,
    title: "Finalize case",
    explain:
      "Final application state. If any source is unavailable or an origin is unreviewed, the report stays partial. That is not chain FINALIZED and it is not proof the claim is true.",
    remaining: 1,
  };
}

export function applyPlan(ledger: Ledger, actor: string, caseId: string, now: string): EngineResult {
  const file = ledger.cases[caseId];
  if (!file) return { ok: false, error: "Case not found." };
  const step = plan(file);
  if (!step) return { ok: false, error: "Nothing left to do." };
  if (step.method === "review_sources_batch") {
    return reviewSourcesBatch(ledger, actor, caseId, step.batchId ?? "src", now);
  }
  if (step.method === "seal_source_reviews") return sealSourceReviews(ledger, actor, caseId, now);
  if (step.method === "review_relationship_batch") {
    return reviewRelationshipBatch(ledger, actor, caseId, step.batchId ?? "rel", now);
  }
  return finalizeCase(ledger, actor, caseId, now);
}

export function removalImpact(file: CaseFile, hiddenLabels: string[]) {
  if (!file.report) return null;
  const hidden = new Set(hiddenLabels);
  const visible = file.reviews.flatMap((review) =>
    review.contributions.filter((contribution) => !hidden.has(contribution.originLabel)),
  );
  const supporting = visible.filter((contribution) => contribution.relation === "supports");
  return {
    supporting: supporting.length,
    visible: visible.length,
    statement:
      supporting.length === 0
        ? "No supporting evidence remains in the reviewed set after this display filter. That does not mean the claim is false."
        : `${supporting.length} supporting contribution${supporting.length === 1 ? "" : "s"} remain in the reviewed set. This is not an independence count.`,
  };
}

export function retryable(file: CaseFile): boolean {
  return (
    file.status === "SOURCE_REVIEW" &&
    file.reviews.some(
      (review) =>
        (review.fetchStatus === "unavailable" || review.fetchStatus === "failed") &&
        review.attempts < MAX_ATTEMPTS,
    )
  );
}

export type ViewName =
  | "get_policy_version"
  | "get_policy"
  | "get_case_count"
  | "get_case"
  | "get_source_review"
  | "get_relationships"
  | "get_report";

export function callView(
  ledger: Ledger,
  method: ViewName,
  args: { caseId?: string; sourceId?: string },
): { ok: true; value: unknown } | { ok: false; error: string } {
  if (method === "get_policy_version") return { ok: true, value: POLICY_VERSION };
  if (method === "get_policy") {
    return {
      ok: true,
      value: {
        version: POLICY_VERSION,
        text: POLICY_TEXT,
        minSubmitted: 3,
        maxSubmitted: 8,
        maxSources: MAX_SOURCES,
        partialFinalization: true,
      },
    };
  }
  if (method === "get_case_count") return { ok: true, value: Object.keys(ledger.cases).length };
  const file = args.caseId ? ledger.cases[args.caseId] : undefined;
  if (!file) {
    if (method === "get_relationships") return { ok: true, value: { found: false, relationships: [] } };
    if (method === "get_source_review") {
      return { ok: true, value: { found: false, caseId: args.caseId ?? "", sourceId: args.sourceId ?? "", fetchStatus: "absent" } };
    }
    if (method === "get_report") {
      return { ok: true, value: { found: false, finalized: false, complete: false, partial: false, caseId: args.caseId ?? "" } };
    }
    return { ok: true, value: { found: false, id: args.caseId ?? "" } };
  }
  if (method === "get_case") {
    return {
      ok: true,
      value: {
        found: true,
        id: file.id,
        owner: file.owner,
        status: file.status,
        manifest: file.manifest,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
      },
    };
  }
  if (method === "get_source_review") {
    const review = file.reviews.find((item) => item.sourceId === args.sourceId);
    if (!review) {
      return { ok: true, value: { found: false, caseId: file.id, sourceId: args.sourceId ?? "", fetchStatus: "absent" } };
    }
    return { ok: true, value: { ...review, found: true } };
  }
  if (method === "get_relationships") return { ok: true, value: { found: true, relationships: file.relationships } };
  if (file.report) return { ok: true, value: { ...file.report, found: true, finalized: true } };
  return {
    ok: true,
    value: {
      found: true,
      finalized: false,
      complete: false,
      partial: false,
      caseId: file.id,
      status: file.status,
      limitations: ["No report is sealed yet. This read is not a verdict."],
    },
  };
}
