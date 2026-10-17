export const POLICY_VERSION = "echotrace-policy-1.0.0";
export const CONTRACT_NAME = "EchoTrace";
export const PREVIEW_PRINCIPAL = "preview:local";
export const MAX_CLAIM = 500;
export const MIN_SUBMITTED = 3;
export const MAX_SUBMITTED = 8;
export const MAX_SOURCES = 12;
export const SOURCE_BATCH = 3;
export const REL_BATCH = 4;
export const MAX_ATTEMPTS = 2;

export type SourceRole = "submitted" | "discovered";
export type ItemStatus = "pending" | "reviewed" | "unavailable" | "rejected" | "failed";
export type Stance = "supports" | "contradicts" | "mentions_only" | "unclear";
export type EvidenceKind = "announcement" | "interview" | "wire" | "commentary" | "mention";
export type RelType =
  | "explicit_dependency"
  | "possible_dependency"
  | "distinct_evidence_shown"
  | "unresolved";
export type CaseStatus = "CREATED" | "SOURCE_REVIEW" | "RELATIONSHIP_REVIEW" | "FINALIZED";

export interface SourceRef {
  id: string;
  url: string;
  role: SourceRole;
  parentSourceId: string | null;
  title: string;
}

export interface Contribution {
  id: string;
  sourceId: string;
  quote: string;
  evidenceKind: EvidenceKind;
  originUrl: string | null;
  originLabel: string;
  relation: Stance;
  explanation: string;
}

export interface SourceReview {
  sourceId: string;
  fetchStatus: ItemStatus;
  stance: Stance | null;
  contributions: Contribution[];
  attempts: number;
  coverageNote: string;
  limitations: string;
}

export interface Relationship {
  id: string;
  fromSourceId: string;
  toSourceId: string | null;
  originLabel: string;
  type: RelType;
  supportingEvidenceIds: string[];
  explanation: string;
  status: ItemStatus;
}

export interface Family {
  originLabel: string;
  originUrl: string | null;
  contributionIds: string[];
  sourceIds: string[];
  reviewed: boolean;
}

export interface Report {
  complete: boolean;
  partial: boolean;
  sourcesReviewed: number;
  sourcesUnavailable: number;
  sourcesRejected: number;
  sourcesFailed: number;
  relationshipCoverage: string;
  families: Family[];
  unresolved: string[];
  limitations: string[];
  policyVersion: string;
  contractIdentity: string;
}

export interface Manifest {
  claim: string;
  language: "en";
  sources: SourceRef[];
  policyVersion: string;
  clientRequestId: string;
  parentCaseId: string | null;
  manifestCanonical: string;
}

export interface ChainTx {
  method: string;
  hash: string;
  statusName: string;
  execution: string;
  at: string;
  detail: string;
}

export interface ChainLink {
  caseId: string | null;
  owner: string | null;
  txs: ChainTx[];
}

export interface Receipt {
  id: string;
  method: string;
  phase: "denied" | "application_success" | "reverted";
  consensus: "not_submitted";
  execution: "DENIED_BY_USER" | "FINISHED_WITH_RETURN" | "REVERTED";
  chainTxHash: null;
  at: string;
  detail: string;
}

export interface CaseFile {
  id: string;
  owner: string;
  status: CaseStatus;
  manifest: Manifest;
  reviews: SourceReview[];
  relationships: Relationship[];
  report: Report | null;
  appliedBatches: string[];
  receipts: Receipt[];
  chain?: ChainLink;
  createdAt: string;
  updatedAt: string;
}

export interface Ledger {
  cases: Record<string, CaseFile>;
  idempotency: Record<string, { caseId: string; manifestCanonical: string }>;
}

export interface Draft {
  id: string;
  claim: string;
  urls: string[];
  discoveries: string[];
  clientRequestId: string | null;
  parentCaseId: string | null;
  updatedAt: string;
}

export const POLICY_TEXT = [
  "EchoTc v1 reviews claim-specific evidence provenance. It does not certify a claim as true or false.",
  "One exact English claim, at most 500 characters. The user must approve any wording change.",
  "Three to eight submitted public https URLs, and at most twelve sources after one-hop discovery.",
  "The manifest, policy, and configuration context freeze at create_case.",
  "Only the case owner may review, seal, retry, or finalize. Reads are public.",
  "Quotes must be anchored in observed text. Unanchored quotes are dropped, never repaired.",
  "Article count is not a witness count. Shared wording is not independence.",
  "Partial finalization is allowed only when at least one source was reviewed and every gap stays labeled.",
  "A content snapshot is not cryptographic proof of publisher authenticity.",
  "Hostname checks are not DNS-rebinding protection. Direct Mode does not render arbitrary hosts.",
].join(" ");

export function emptyLedger(): Ledger {
  return { cases: {}, idempotency: {} };
}
