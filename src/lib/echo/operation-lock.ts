import type { LogicalWorkflowOp } from "./types.ts";

export type OperationStatus =
  | "PREPARING"
  | "BROADCASTED"
  | "ACCEPTED"
  | "FINALIZED_SUCCESS"
  | "FINALIZED_REJECTED"
  | "REJECTED_USER"
  | "TIMEOUT"
  | "FAILED";

export interface DurableOperation {
  key: string;
  chainId: number;
  contractAddress: string;
  account: string;
  caseId: string;
  logicalOp: LogicalWorkflowOp;
  method: string;
  args: string[];
  batchId: string | null;
  hash: string | null;
  status: OperationStatus;
  statusName?: string;
  execution?: string;
  createdAt: string;
  updatedAt: string;
  error?: string | null;
  nonce?: number | null;
}

const STORAGE_KEY = "echotc-operations-v1";

export function toLogicalOp(method: string): LogicalWorkflowOp {
  if (method === "review_sources_batch") return "review_sources";
  if (method === "retry_unavailable") return "retry_sources";
  if (method === "seal_source_reviews") return "seal_sources";
  if (method === "review_relationship_batch") return "review_relationships";
  if (method === "finalize_case") return "finalize_case";
  return "create_case";
}

export function buildOperationKey(
  chainId: number,
  contractAddress: string,
  account: string,
  caseId: string,
  logicalOp: LogicalWorkflowOp,
): string {
  return `${chainId}:${contractAddress.toLowerCase()}:${account.toLowerCase()}:${caseId || "unminted"}:${logicalOp}`;
}

export function isInFlightStatus(status: OperationStatus): boolean {
  return status === "PREPARING" || status === "BROADCASTED" || status === "ACCEPTED" || status === "TIMEOUT";
}

export function getStoredOperations(): Record<string, DurableOperation> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveStoredOperations(ops: Record<string, DurableOperation>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ops));
  } catch {
    // Ignore storage quota or environment errors
  }
}

export function getOperation(key: string): DurableOperation | null {
  const all = getStoredOperations();
  return all[key] || null;
}

export function findInFlightOperation(
  chainId: number,
  contractAddress: string,
  account: string,
  caseId: string,
  logicalOp?: LogicalWorkflowOp,
): DurableOperation | null {
  const all = getStoredOperations();
  const cAddr = contractAddress.toLowerCase();
  const acc = account.toLowerCase();

  for (const op of Object.values(all)) {
    if (op.chainId === chainId && op.contractAddress.toLowerCase() === cAddr && op.account.toLowerCase() === acc) {
      if (!caseId || op.caseId === caseId) {
        if (!logicalOp || op.logicalOp === logicalOp) {
          if (isInFlightStatus(op.status)) {
            return op;
          }
        }
      }
    }
  }
  return null;
}

export function prepareOperation(input: {
  chainId: number;
  contractAddress: string;
  account: string;
  caseId: string;
  method: string;
  args: string[];
  batchId?: string | null;
  now?: string;
}): { op: DurableOperation; isExisting: boolean } {
  const logicalOp = toLogicalOp(input.method);
  const existing = findInFlightOperation(
    input.chainId,
    input.contractAddress,
    input.account,
    input.caseId,
    logicalOp,
  );

  if (existing) {
    return { op: existing, isExisting: true };
  }

  const key = buildOperationKey(
    input.chainId,
    input.contractAddress,
    input.account,
    input.caseId,
    logicalOp,
  );
  const now = input.now || new Date().toISOString();

  const op: DurableOperation = {
    key,
    chainId: input.chainId,
    contractAddress: input.contractAddress,
    account: input.account,
    caseId: input.caseId,
    logicalOp,
    method: input.method,
    args: input.args,
    batchId: input.batchId || null,
    hash: null,
    status: "PREPARING",
    createdAt: now,
    updatedAt: now,
  };

  const all = getStoredOperations();
  all[key] = op;
  saveStoredOperations(all);

  return { op, isExisting: false };
}

export function recordBroadcast(key: string, hash: string, nonce?: number | null, now?: string): DurableOperation | null {
  const all = getStoredOperations();
  const op = all[key];
  if (!op) return null;

  op.hash = hash;
  if (nonce != null) op.nonce = nonce;
  op.status = "BROADCASTED";
  op.updatedAt = now || new Date().toISOString();

  all[key] = op;
  saveStoredOperations(all);
  return op;
}

export function recordStatus(
  key: string,
  status: OperationStatus,
  details?: { statusName?: string; execution?: string; error?: string | null },
  now?: string,
): DurableOperation | null {
  const all = getStoredOperations();
  const op = all[key];
  if (!op) return null;

  op.status = status;
  if (details?.statusName !== undefined) op.statusName = details.statusName;
  if (details?.execution !== undefined) op.execution = details.execution;
  if (details?.error !== undefined) op.error = details.error;
  op.updatedAt = now || new Date().toISOString();

  all[key] = op;
  saveStoredOperations(all);
  return op;
}

export function recordUserRejection(key: string, error: string, now?: string): DurableOperation | null {
  return recordStatus(key, "REJECTED_USER", { error }, now);
}

export function recordTerminalRejection(
  key: string,
  details?: { statusName?: string; execution?: string; error?: string | null },
  now?: string,
): DurableOperation | null {
  return recordStatus(key, "FINALIZED_REJECTED", details, now);
}

export function recordSuccess(
  key: string,
  details?: { statusName?: string; execution?: string },
  now?: string,
): DurableOperation | null {
  return recordStatus(key, "FINALIZED_SUCCESS", details, now);
}

export function recordTimeout(key: string, now?: string): DurableOperation | null {
  return recordStatus(key, "TIMEOUT", undefined, now);
}

export async function withCrossTabLock<T>(
  lockName: string,
  fn: () => Promise<T>,
): Promise<T> {
  const locks = typeof navigator !== "undefined" ? (navigator as { locks?: { request: (...args: unknown[]) => Promise<unknown> } }).locks : undefined;
  if (locks && typeof locks.request === "function") {
    let executed = false;
    let result: T;
    await locks.request(lockName, { ifAvailable: true }, async (lock: unknown) => {
      if (!lock) {
        throw new Error(`Operation locked by another tab (${lockName}).`);
      }
      executed = true;
      result = await fn();
    });
    if (executed) return result!;
    throw new Error(`Operation locked by another tab (${lockName}).`);
  }

  // Without Web Locks, localStorage read-modify-write alone is NOT atomic and cannot safely prevent competing submissions.
  // Fail closed rather than claim false mutual exclusion.
  throw new Error(`Web Locks API is required for cross-tab mutual exclusion (${lockName}). Failing closed to prevent competing submissions.`);
}

export async function reconcileOperation(
  opInput: DurableOperation,
  lookupTx: (hash: string) => Promise<Record<string, unknown> | null>,
  now?: string,
): Promise<{ op: DurableOperation; changed: boolean }> {
  const op = getOperation(opInput.key) || opInput;
  if (!op.hash) {
    if (op.status === "PREPARING") {
      const createdAt = new Date(op.createdAt).getTime();
      const current = now ? new Date(now).getTime() : Date.now();
      // If stuck in PREPARING with no hash for > 5 minutes, mark as FAILED
      if (current - createdAt > 300000) {
        recordStatus(op.key, "FAILED", { error: "Operation abandoned before transaction broadcast." }, now);
        return { op: getOperation(op.key)!, changed: true };
      }
    }
    return { op, changed: false };
  }

  try {
    const tx = await lookupTx(op.hash);
    if (!tx) return { op, changed: false };

    const statusName = String(tx.statusName || tx.status || "");
    const executionDirect = tx.txExecutionResultName ?? tx.txExecutionResult;
    const consensus = tx.consensus_data as { leader_receipt?: { execution_result?: string }[] } | undefined;
    const execution = String(executionDirect || consensus?.leader_receipt?.[0]?.execution_result || "NOT_VOTED");

    if (statusName === "FINALIZED") {
      const isSuccess = execution === "SUCCESS" || execution === "FINISHED_WITH_RETURN";
      const newStatus: OperationStatus = isSuccess ? "FINALIZED_SUCCESS" : "FINALIZED_REJECTED";
      recordStatus(
        op.key,
        newStatus,
        {
          statusName,
          execution,
          error: isSuccess ? null : `Consensus finalized with ${execution}.`,
        },
        now,
      );
      return { op: getOperation(op.key)!, changed: true };
    }

    if (statusName === "CANCELED" || statusName === "UNDETERMINED" || statusName === "LEADER_TIMEOUT") {
      recordStatus(
        op.key,
        "FINALIZED_REJECTED",
        {
          statusName,
          execution,
          error: `Consensus terminated with status ${statusName}.`,
        },
        now,
      );
      return { op: getOperation(op.key)!, changed: true };
    }

    // Still in-flight
    if (statusName !== op.statusName || op.status !== "ACCEPTED") {
      recordStatus(op.key, "ACCEPTED", { statusName, execution }, now);
      return { op: getOperation(op.key)!, changed: true };
    }

    return { op, changed: false };
  } catch {
    return { op, changed: false };
  }
}
