import assert from "node:assert/strict";
import test from "node:test";
import {
  findInFlightOperation,
  isInFlightStatus,
  prepareOperation,
  recordBroadcast,
  recordTimeout,
  recordUserRejection,
  reconcileOperation,
  toLogicalOp,
  withCrossTabLock,
} from "./operation-lock.ts";

// In-memory localStorage mock for node test runner
class MockLocalStorage {
  private store: Record<string, string> = {};

  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
  clear(): void {
    this.store = {};
  }
}

const mockStorage = new MockLocalStorage();
(globalThis as unknown as { localStorage: MockLocalStorage }).localStorage = mockStorage;

const CHAIN_ID = 61999;
const CONTRACT_A = "0x0BcE79508f7705412D6c6E83750D12547715DB53";
const CONTRACT_B = "0x1111111111111111111111111111111111111111";
const ACCOUNT_A = "0x39cCdcf2338CE3D6c8F345A0ebb11a19F193EAbA";
const ACCOUNT_B = "0x7F7c95C97C615abebB45e64102c0A8dE5e5BC0bF";
const CASE_1 = "et-4c73855e5a49";
const CASE_2 = "et-74ec46d2f72e";

test("Logical operation mapping: collapses batch operations to core logical operations", () => {
  assert.equal(toLogicalOp("create_case"), "create_case");
  assert.equal(toLogicalOp("review_sources_batch"), "review_sources");
  assert.equal(toLogicalOp("retry_unavailable"), "retry_sources");
  assert.equal(toLogicalOp("seal_source_reviews"), "seal_sources");
  assert.equal(toLogicalOp("review_relationship_batch"), "review_relationships");
  assert.equal(toLogicalOp("finalize_case"), "finalize_case");
});

test("Fresh batch ID cannot bypass pending-operation gate and reuses existing batchId", () => {
  mockStorage.clear();

  // Initial preparation with batchId-1
  const { op: op1, isExisting: isExisting1 } = prepareOperation({
    chainId: CHAIN_ID,
    contractAddress: CONTRACT_A,
    account: ACCOUNT_A,
    caseId: CASE_1,
    method: "review_sources_batch",
    args: [CASE_1, "b-batch-1"],
    batchId: "b-batch-1",
  });
  assert.equal(isExisting1, false);
  assert.equal(op1.batchId, "b-batch-1");
  assert.equal(op1.status, "PREPARING");

  // Subsequent call attempting fresh batchId-2 for the same logical operation
  const { op: op2, isExisting: isExisting2 } = prepareOperation({
    chainId: CHAIN_ID,
    contractAddress: CONTRACT_A,
    account: ACCOUNT_A,
    caseId: CASE_1,
    method: "review_sources_batch",
    args: [CASE_1, "b-batch-2-fresh"],
    batchId: "b-batch-2-fresh",
  });

  // Must detect existing operation and return original batch ID without allowing bypass
  assert.equal(isExisting2, true);
  assert.equal(op2.key, op1.key);
  assert.equal(op2.batchId, "b-batch-1");
  assert.equal(op2.args[1], "b-batch-1");
});

test("Reload while transaction is unresolved preserves operation and blocks duplicate write", () => {
  mockStorage.clear();

  const { op } = prepareOperation({
    chainId: CHAIN_ID,
    contractAddress: CONTRACT_A,
    account: ACCOUNT_A,
    caseId: CASE_1,
    method: "review_sources_batch",
    args: [CASE_1, "b-batch-1"],
    batchId: "b-batch-1",
  });

  // Record broadcast
  const broadcasted = recordBroadcast(op.key, "0xhash123", 1);
  assert.equal(broadcasted?.status, "BROADCASTED");
  assert.equal(broadcasted?.hash, "0xhash123");

  // Simulate page reload by querying stored state fresh
  const inFlightAfterReload = findInFlightOperation(CHAIN_ID, CONTRACT_A, ACCOUNT_A, CASE_1);
  assert.ok(inFlightAfterReload, "In-flight operation must be recovered after reload");
  assert.equal(inFlightAfterReload.hash, "0xhash123");
  assert.equal(inFlightAfterReload.batchId, "b-batch-1");
  assert.equal(isInFlightStatus(inFlightAfterReload.status), true);
});

test("Local waiter timeout retains in-flight protection and does not permit resend", () => {
  mockStorage.clear();

  const { op } = prepareOperation({
    chainId: CHAIN_ID,
    contractAddress: CONTRACT_A,
    account: ACCOUNT_A,
    caseId: CASE_1,
    method: "review_sources_batch",
    args: [CASE_1, "b-batch-timeout"],
    batchId: "b-batch-timeout",
  });
  recordBroadcast(op.key, "0xhashtimeout");

  // Local waiter times out waiting for consensus
  recordTimeout(op.key);

  const timedOutOp = findInFlightOperation(CHAIN_ID, CONTRACT_A, ACCOUNT_A, CASE_1);
  assert.ok(timedOutOp);
  assert.equal(timedOutOp.status, "TIMEOUT");
  assert.equal(isInFlightStatus(timedOutOp.status), true);

  // New attempt while TIMEOUT must still be locked
  const attempt = prepareOperation({
    chainId: CHAIN_ID,
    contractAddress: CONTRACT_A,
    account: ACCOUNT_A,
    caseId: CASE_1,
    method: "review_sources_batch",
    args: [CASE_1, "b-batch-resend-attempt"],
    batchId: "b-batch-resend-attempt",
  });
  assert.equal(attempt.isExisting, true);
  assert.equal(attempt.op.hash, "0xhashtimeout");
  assert.equal(attempt.op.batchId, "b-batch-timeout");
});

test("Account, case, and contract switching isolation", () => {
  mockStorage.clear();

  // Operation for ACCOUNT_A on CASE_1
  prepareOperation({
    chainId: CHAIN_ID,
    contractAddress: CONTRACT_A,
    account: ACCOUNT_A,
    caseId: CASE_1,
    method: "review_sources_batch",
    args: [CASE_1, "b1"],
  });

  // ACCOUNT_B on CASE_1 must not be blocked
  assert.equal(findInFlightOperation(CHAIN_ID, CONTRACT_A, ACCOUNT_B, CASE_1), null);

  // ACCOUNT_A on CASE_2 must not be blocked
  assert.equal(findInFlightOperation(CHAIN_ID, CONTRACT_A, ACCOUNT_A, CASE_2), null);

  // ACCOUNT_A on CONTRACT_B must not be blocked
  assert.equal(findInFlightOperation(CHAIN_ID, CONTRACT_B, ACCOUNT_A, CASE_1), null);
});

test("Terminal consensus rejection vs successful application distinction", async () => {
  mockStorage.clear();

  // Case A: Consensus rejection (MAJORITY_DISAGREE)
  const { op: opReject } = prepareOperation({
    chainId: CHAIN_ID,
    contractAddress: CONTRACT_A,
    account: ACCOUNT_A,
    caseId: CASE_1,
    method: "review_sources_batch",
    args: [CASE_1, "b1"],
  });
  recordBroadcast(opReject.key, "0xhash-reject");

  // Reconcile with network returning FINALIZED but MAJORITY_DISAGREE
  const { op: reconciledReject } = await reconcileOperation(opReject, async () => ({
    statusName: "FINALIZED",
    txExecutionResultName: "MAJORITY_DISAGREE",
  }));

  assert.equal(reconciledReject.status, "FINALIZED_REJECTED");
  assert.equal(isInFlightStatus(reconciledReject.status), false);
  // Rejection clears in-flight gate so owner is permitted to re-attempt
  assert.equal(findInFlightOperation(CHAIN_ID, CONTRACT_A, ACCOUNT_A, CASE_1), null);

  // Case B: Consensus success (SUCCESS)
  const { op: opSuccess } = prepareOperation({
    chainId: CHAIN_ID,
    contractAddress: CONTRACT_A,
    account: ACCOUNT_A,
    caseId: CASE_2,
    method: "create_case",
    args: ["{}"],
  });
  recordBroadcast(opSuccess.key, "0xhash-success");

  const { op: reconciledSuccess } = await reconcileOperation(opSuccess, async () => ({
    statusName: "FINALIZED",
    txExecutionResultName: "SUCCESS",
  }));

  assert.equal(reconciledSuccess.status, "FINALIZED_SUCCESS");
  assert.equal(isInFlightStatus(reconciledSuccess.status), false);
});

test("User rejection in wallet releases operation gate immediately", () => {
  mockStorage.clear();

  const { op } = prepareOperation({
    chainId: CHAIN_ID,
    contractAddress: CONTRACT_A,
    account: ACCOUNT_A,
    caseId: CASE_1,
    method: "create_case",
    args: ["{}"],
  });
  assert.equal(isInFlightStatus(op.status), true);

  // User clicks cancel in MetaMask
  recordUserRejection(op.key, "User denied transaction signature.");

  const opAfter = findInFlightOperation(CHAIN_ID, CONTRACT_A, ACCOUNT_A, CASE_1);
  assert.equal(opAfter, null, "User cancellation must release in-flight gate immediately");
});

test("Cross-tab locking prevents concurrent submissions", async () => {
  mockStorage.clear();

  let executed = false;
  await withCrossTabLock("test-case-lock", async () => {
    executed = true;

    // Inside lock, trying to acquire same lock from another tab should fail
    await assert.rejects(
      async () => {
        await withCrossTabLock("test-case-lock", async () => {});
      },
      /Operation locked by another tab/,
    );
  });

  assert.equal(executed, true);

  // After release, acquiring lock again succeeds
  let second = false;
  await withCrossTabLock("test-case-lock", async () => {
    second = true;
  });
  assert.equal(second, true);
});

test("Locking fails closed when Web Locks API is unavailable", async () => {
  const originalLocks = (navigator as { locks?: unknown }).locks;
  try {
    Object.defineProperty(navigator, "locks", {
      value: undefined,
      configurable: true,
      writable: true,
    });

    await assert.rejects(
      async () => {
        await withCrossTabLock("no-locks-test", async () => {});
      },
      /Web Locks API is required for cross-tab mutual exclusion/,
    );
  } finally {
    Object.defineProperty(navigator, "locks", {
      value: originalLocks,
      configurable: true,
      writable: true,
    });
  }
});

test("Concurrency check: localStorage read-modify-write without atomicity permits race conditions", async () => {
  // Proves why localStorage alone cannot guarantee mutual exclusion across concurrent contexts
  const sharedStorage: Record<string, string> = {};
  let criticalSectionConcurrentCount = 0;
  let maxConcurrentObserved = 0;

  async function simulatedUnsafeLock(name: string, _fn: () => Promise<void>) {
    // Interleaved read-then-write pattern typical of naive localStorage locks
    const raw = sharedStorage[name];
    if (raw && JSON.parse(raw).locked) {
      throw new Error("Locked");
    }
    // Yield execution to simulate concurrent tab read happening before write
    await new Promise((resolve) => setTimeout(resolve, 5));
    sharedStorage[name] = JSON.stringify({ locked: true });

    criticalSectionConcurrentCount++;
    if (criticalSectionConcurrentCount > maxConcurrentObserved) {
      maxConcurrentObserved = criticalSectionConcurrentCount;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
    criticalSectionConcurrentCount--;
    delete sharedStorage[name];
  }

  // Two concurrent calls execute simultaneously
  await Promise.all([
    simulatedUnsafeLock("race-test", async () => {}),
    simulatedUnsafeLock("race-test", async () => {}),
  ]);

  // Demonstrates both entered the critical section simultaneously due to lack of atomic lock
  assert.equal(maxConcurrentObserved, 2, "Unsafe localStorage read-modify-write allowed concurrent entrance");
});
