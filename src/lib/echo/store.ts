import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { applyPlan, createCase, plan, retryUnavailable } from "./engine.ts";
import { PREVIEW_PRINCIPAL, emptyLedger, type CaseFile, type ChainTx, type Draft, type Ledger, type Receipt } from "./types.ts";

interface EchoState {
  principal: string;
  ledger: Ledger;
  drafts: Record<string, Draft>;
  setPrincipal: (principal: string) => void;
  saveDraft: (draft: Draft) => void;
  removeDraft: (id: string) => void;
  createFromDraft: (draft: Draft, now: string) => { ok: true; caseId: string } | { ok: false; error: string };
  approveNext: (caseId: string, now: string) => { ok: true } | { ok: false; error: string };
  denyNext: (caseId: string, method: string, now: string) => void;
  retry: (caseId: string, now: string) => { ok: true } | { ok: false; error: string };
  recordChain: (
    caseId: string,
    tx: ChainTx,
    chainCaseId: string | null,
    owner: string | null,
    contractAddress?: string | null,
    fallbackFile?: CaseFile | null,
  ) => void;
}

export function getIsolatedCase(
  ledger: Ledger,
  id: string,
  targetContractAddress?: string | null,
): CaseFile | null {
  if (id.includes(":")) {
    return ledger.cases[id] ?? null;
  }
  if (targetContractAddress) {
    const scopedKey = `${targetContractAddress.toLowerCase()}:${id}`;
    if (ledger.cases[scopedKey]) return ledger.cases[scopedKey];
  }
  const candidate = ledger.cases[id];
  if (!candidate) return null;

  if (candidate.chain?.contractAddress && targetContractAddress) {
    if (candidate.chain.contractAddress.toLowerCase() !== targetContractAddress.toLowerCase()) {
      return null;
    }
  }
  return candidate;
}

function receipt(partial: Omit<Receipt, "chainTxHash" | "consensus">): Receipt {
  return { ...partial, chainTxHash: null, consensus: "not_submitted" };
}

const memory = new Map<string, string>();

export const LEDGER_STORAGE_KEY = "echotc-ledger-v1";
export const LEGACY_LEDGER_STORAGE_KEY = "echotrace-ledger-v1";

function ledgerStorage() {
  if (typeof window === "undefined") {
    return {
      getItem: (name: string) => memory.get(name) ?? null,
      setItem: (name: string, value: string) => {
        memory.set(name, value);
      },
      removeItem: (name: string) => {
        memory.delete(name);
      },
    };
  }
  try {
    return window.localStorage;
  } catch {
    return {
      getItem: (name: string) => memory.get(name) ?? null,
      setItem: (name: string, value: string) => {
        memory.set(name, value);
      },
      removeItem: (name: string) => {
        memory.delete(name);
      },
    };
  }
}

const baseStorage = createJSONStorage(ledgerStorage);
if (!baseStorage) throw new Error("Ledger storage is unavailable.");
let allowWrite = false;

function isValidStorageValue(val: unknown): boolean {
  return Boolean(val && typeof val === "object" && !(val instanceof Promise) && "state" in val && (val as { state: unknown }).state);
}

const storage = {
  getItem: (name: string) => {
    try {
      const current = baseStorage.getItem(name);
      if (isValidStorageValue(current)) {
        return current;
      }
      if (name === LEDGER_STORAGE_KEY) {
        const legacy = baseStorage.getItem(LEGACY_LEDGER_STORAGE_KEY);
        if (isValidStorageValue(legacy)) {
          return legacy;
        }
      }
      return current;
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: Parameters<typeof baseStorage.setItem>[1]) => {
    if (!allowWrite && !useEcho?.persist?.hasHydrated()) return;
    try {
      return baseStorage.setItem(name, value);
    } catch {
      // Storage unavailable or quota exceeded
    }
  },
  removeItem: (name: string) => {
    try {
      return baseStorage.removeItem(name);
    } catch {
      // Storage unavailable
    }
  },
};

export const useEcho = create<EchoState>()(
  persist(
    (set, get) => ({
      principal: PREVIEW_PRINCIPAL,
      ledger: emptyLedger(),
      drafts: {},
      setPrincipal: (principal) => set({ principal }),
      saveDraft: (draft) => set((state) => ({ drafts: { ...state.drafts, [draft.id]: draft } })),
      removeDraft: (id) =>
        set((state) => {
          const drafts = { ...state.drafts };
          delete drafts[id];
          return { drafts };
        }),
      createFromDraft: (draft, now) => {
        if (!draft.clientRequestId) return { ok: false, error: "Mint a request id before creating a case." };
        const result = createCase(get().ledger, get().principal, {
          claim: draft.claim,
          urls: draft.urls,
          discoveries: draft.discoveries,
          clientRequestId: draft.clientRequestId,
          parentCaseId: draft.parentCaseId,
          now,
        });
        if (!result.ok) return result;
        const existed = Boolean(get().ledger.cases[result.caseId]);
        const file = result.ledger.cases[result.caseId];
        if (!existed) {
          file.receipts.push(
            receipt({
              id: `rc-${file.receipts.length + 1}`,
              method: "create_case",
              phase: "application_success",
              execution: "FINISHED_WITH_RETURN",
              at: now,
              detail: "Direct Mode recorded the frozen manifest. This is not a chain transaction.",
            }),
          );
        }
        set({ ledger: result.ledger });
        return { ok: true, caseId: result.caseId };
      },
      approveNext: (caseId, now) => {
        const before = get().ledger.cases[caseId];
        const step = before ? plan(before) : null;
        const result = applyPlan(get().ledger, get().principal, caseId, now);
        if (!result.ok) return result;
        const file = result.ledger.cases[caseId];
        file.receipts.push(
          receipt({
            id: `rc-${file.receipts.length + 1}`,
            method: step?.method ?? "advance",
            phase: "application_success",
            execution: "FINISHED_WITH_RETURN",
            at: now,
            detail: "Direct Mode advanced the case. Consensus was not submitted. The execution analogue is FINISHED_WITH_RETURN, which is not a chain receipt.",
          }),
        );
        set({ ledger: result.ledger });
        return { ok: true };
      },
      denyNext: (caseId, method, now) => {
        const ledger = structuredClone(get().ledger);
        const file = ledger.cases[caseId];
        if (!file || file.owner !== get().principal) return;
        file.receipts.push(
          receipt({
            id: `rc-${file.receipts.length + 1}`,
            method,
            phase: "denied",
            execution: "DENIED_BY_USER",
            at: now,
            detail: "You denied this approval. The case was not changed. Denial is not an execution failure.",
          }),
        );
        file.updatedAt = now;
        set({ ledger });
      },
      retry: (caseId, now) => {
        const result = retryUnavailable(get().ledger, get().principal, caseId, now);
        if (!result.ok) return result;
        const file = result.ledger.cases[caseId];
        file.receipts.push(
          receipt({
            id: `rc-${file.receipts.length + 1}`,
            method: "retry_unavailable",
            phase: "application_success",
            execution: "FINISHED_WITH_RETURN",
            at: now,
            detail: "Owner retry. A still-unavailable source stays unavailable.",
          }),
        );
        set({ ledger: result.ledger });
        return { ok: true };
      },
      recordChain: (caseId, tx, chainCaseId, owner, contractAddress, fallbackFile) => {
        const ledger = structuredClone(get().ledger);
        let file = ledger.cases[caseId];
        if (!file && fallbackFile) {
          file = structuredClone(fallbackFile);
          ledger.cases[caseId] = file;
        }
        if (!file) return;
        const chain = file.chain ?? { caseId: null, owner: null, txs: [] };
        if (chainCaseId) {
          chain.caseId = chainCaseId;
        }
        if (owner) chain.owner = owner;
        if (contractAddress) chain.contractAddress = contractAddress;
        chain.txs.push(tx);
        file.chain = chain;
        file.updatedAt = tx.at;

        if (chainCaseId) {
          const targetKey = chainCaseId;
          const existing = ledger.cases[targetKey];
          if (
            existing &&
            existing !== file &&
            existing.chain?.contractAddress &&
            contractAddress &&
            existing.chain.contractAddress.toLowerCase() !== contractAddress.toLowerCase()
          ) {
            // Do not overwrite case from another contract address! Use scoped key
            ledger.cases[`${contractAddress.toLowerCase()}:${targetKey}`] = file;
          } else {
            ledger.cases[targetKey] = file;
          }
        }
        set({ ledger });
      },
    }),
    { name: LEDGER_STORAGE_KEY, skipHydration: true, storage, partialize: (state) => ({ ledger: state.ledger, drafts: state.drafts }) },
  ),
);

if (typeof window !== "undefined") {
  useEcho.persist.onFinishHydration(() => {
    allowWrite = true;
  });
  void useEcho.persist.rehydrate();
}
