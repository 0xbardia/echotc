import type { CaseFile } from "./types.ts";

export interface ChainReview {
  sourceId: string;
  fetchStatus: string;
  attempts: number;
}

export interface ChainSnapshot {
  caseId: string;
  status: string;
  owner: string;
  reviews: ChainReview[];
  relationships: { status: string }[];
}

export interface ChainCall {
  method: "create_case" | "review_sources_batch" | "retry_unavailable" | "seal_source_reviews" | "review_relationship_batch" | "finalize_case";
  args: string[];
  title: string;
  explain: string;
}

export function chainExecutionSucceeded(execution: string): boolean {
  return execution === "SUCCESS" || execution === "FINISHED_WITH_RETURN";
}

export function isChainCaseId(value: string | null | undefined): boolean {
  return Boolean(value && /^et-[a-f0-9]{12}$/.test(value));
}

export function contractManifestJson(file: CaseFile): string {
  return JSON.stringify({
    claim: file.manifest.claim,
    sources: file.manifest.sources.map((source) => ({
      url: source.url,
      role: source.role,
      parentSourceId: source.parentSourceId,
    })),
    clientRequestId: file.manifest.clientRequestId,
    parentCaseId: isChainCaseId(file.manifest.parentCaseId) ? file.manifest.parentCaseId : null,
  });
}

export function nextChainCall(file: CaseFile, snapshot: ChainSnapshot | null, batchId: string): ChainCall | null {
  if (!snapshot) {
    return {
      method: "create_case",
      args: [contractManifestJson(file)],
      title: "Create the case on Studionet",
      explain: "The wallet signs create_case with this frozen manifest. The contract assigns the case id. A Direct Mode id is not sent as that id.",
    };
  }
  const pending = snapshot.reviews.filter((review) => review.fetchStatus === "pending");
  const reviewed = snapshot.reviews.filter((review) => review.fetchStatus === "reviewed");
  const retryable = snapshot.reviews.filter(
    (review) => (review.fetchStatus === "unavailable" || review.fetchStatus === "failed") && review.attempts < 2,
  );
  if (snapshot.status === "CREATED" || (snapshot.status === "SOURCE_REVIEW" && pending.length > 0)) {
    return {
      method: "review_sources_batch",
      args: [snapshot.caseId, batchId],
      title: "Review the next source batch",
      explain: "The contract renders up to three pending public pages and keeps only quotes present in that text.",
    };
  }
  if (snapshot.status === "SOURCE_REVIEW" && reviewed.length === 0 && retryable.length > 0) {
    return {
      method: "retry_unavailable",
      args: [snapshot.caseId],
      title: "Retry sources that did not render",
      explain: "No source has been reviewed yet. One owner retry is allowed. A source can stay unavailable.",
    };
  }
  if (snapshot.status === "SOURCE_REVIEW") {
    return {
      method: "seal_source_reviews",
      args: [snapshot.caseId],
      title: "Seal source reviews",
      explain: "Relationships are derived from anchored contributions. Pending sources cannot be sealed.",
    };
  }
  if (snapshot.status === "RELATIONSHIP_REVIEW") {
    const open = snapshot.relationships.filter((item) => item.status === "pending");
    if (open.length > 0) {
      return {
        method: "review_relationship_batch",
        args: [snapshot.caseId, batchId],
        title: "Cover the next relationship batch",
        explain: "This records coverage. It does not change relationship types that were frozen at seal.",
      };
    }
    return {
      method: "finalize_case",
      args: [snapshot.caseId],
      title: "Finalize the case",
      explain: "Finalize refuses a case with no reviewed source. A partial report stays partial.",
    };
  }
  return null;
}
