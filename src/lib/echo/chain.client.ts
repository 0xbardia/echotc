import { CONTRACT_ADDRESS, chainConfigured } from "./chain.ts";

function revertText(data: unknown): string | null {
  const result = (data as { receipt?: { result?: string } } | undefined)?.receipt?.result;
  if (!result) return null;
  try {
    const bytes = Uint8Array.from(atob(result), (char) => char.charCodeAt(0));
    const text = new TextDecoder().decode(bytes.subarray(1)).replaceAll("\u0000", "").trim();
    return text || null;
  } catch {
    return null;
  }
}

export async function readChain(functionName: string, args: string[]) {
  if (!chainConfigured()) {
    return { ok: false as const, error: "No contract address is configured. This read was not sent." };
  }
  const { createClient } = await import("genlayer-js");
  const { studionet } = await import("genlayer-js/chains");
  const client = createClient({ chain: studionet });
  try {
    const value = await client.readContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      functionName,
      args,
    });
    return {
      ok: true as const,
      value,
      readAt: new Date().toISOString(),
      source: "studionet" as const,
      address: CONTRACT_ADDRESS,
    };
  } catch (error) {
    const err = error as {
      message?: string;
      shortMessage?: string;
      details?: string;
      data?: unknown;
      cause?: { message?: string; data?: unknown };
    };
    const decoded = revertText(err.data ?? err.cause?.data);
    return {
      ok: false as const,
      error: decoded || err.shortMessage || err.message || "Read failed.",
      details: err.details ?? null,
      executionResult: "ERROR" as const,
      readAt: new Date().toISOString(),
      source: "studionet" as const,
      address: CONTRACT_ADDRESS,
    };
  }
}

export async function writeChain(functionName: string, args: string[], account: `0x${string}`) {
  if (!chainConfigured()) throw new Error("Contract address is not configured.");
  const { connectedProvider } = await import("@/components/echo/wallet-inner");
  const provider = await connectedProvider();
  const { createClient } = await import("genlayer-js");
  const { studionet } = await import("genlayer-js/chains");
  const client = createClient({
    chain: studionet,
    account,
    provider: provider as never,
  });
  const hash = await client.writeContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    functionName,
    args,
    value: 0n,
  });
  return { hash: String(hash), submittedAt: new Date().toISOString() };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function executionText(tx: Record<string, unknown>): string {
  const names: Record<string, string> = {
    "0": "NOT_VOTED",
    "1": "FINISHED_WITH_RETURN",
    "2": "FINISHED_WITH_ERROR",
  };
  const direct = tx.txExecutionResultName ?? tx.txExecutionResult;
  if (typeof direct === "string" && names[direct]) return names[direct];
  if (typeof direct === "string" && direct) return direct;
  if (typeof direct === "number") return names[String(direct)] || String(direct);
  const consensus = tx.consensus_data as { leader_receipt?: { execution_result?: string }[] } | undefined;
  const raw = consensus?.leader_receipt?.[0]?.execution_result;
  if (!raw) return "NOT_VOTED";
  return names[raw] || raw;
}

export function returnedCaseId(tx: Record<string, unknown>): string | null {
  const consensus = tx.consensus_data as { leader_receipt?: { result?: unknown }[] } | undefined;
  const result = consensus?.leader_receipt?.[0]?.result;
  if (typeof result === "string" && /^et-[a-f0-9]{12}$/.test(result)) return result;
  const text = JSON.stringify(result ?? "");
  const match = text.match(/et-[a-f0-9]{12}/);
  return match ? match[0] : null;
}

export async function challengeChain(txId: `0x${string}`, account: `0x${string}` | null) {
  if (!account) {
    return { ok: false as const, sent: false, error: "Connect a wallet before a challenge. Nothing was sent." };
  }
  const { createClient } = await import("genlayer-js");
  const { studionet } = await import("genlayer-js/chains");
  const { connectedProvider } = await import("@/components/echo/wallet-inner");
  const provider = await connectedProvider();
  const signing = createClient({
    chain: studionet,
    account,
    provider: provider as never,
  });
  try {
    try {
      const open = await signing.canAppeal({ txId });
      if (!open) {
        return { ok: false as const, sent: false, error: "This transaction cannot be appealed. Nothing was sent." };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!message.includes("not supported")) throw error;
    }
    const before = (await signing.getTransaction({ hash: txId as never })) as Record<string, unknown>;
    await signing.appealTransaction({ txId: txId as never, account: account as never, value: 0n });
    const after = (await signing.getTransaction({ hash: txId as never })) as Record<string, unknown>;
    const opened =
      (Boolean(after.appealed) && !before.appealed) ||
      String(after.num_of_rounds ?? after.numOfRounds ?? "") !==
        String(before.num_of_rounds ?? before.numOfRounds ?? "");
    if (!opened) {
      return {
        ok: false as const,
        sent: false,
        error: "No appeal round opened. Studionet returned the existing transaction and left appealed false. Nothing new was recorded.",
      };
    }
    return { ok: true as const, sent: true, txId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Challenge failed.";
    return { ok: false as const, sent: false, error: message };
  }
}

export async function waitChain(hash: string, timeoutMs = 900000) {
  const { createClient } = await import("genlayer-js");
  const { studionet } = await import("genlayer-js/chains");
  const client = createClient({ chain: studionet });
  const started = Date.now();
  let last = "not yet visible";
  while (Date.now() - started < timeoutMs) {
    try {
      const tx = (await client.getTransaction({ hash: hash as never })) as Record<string, unknown>;
      const statusName = String(tx.statusName || tx.status || "");
      last = statusName || last;
      const execution = executionText(tx);
      const succeeded = execution === "FINISHED_WITH_RETURN" || execution === "SUCCESS";
      if (statusName === "FINALIZED") {
        return {
          ok: succeeded,
          statusName,
          execution,
          tx,
          error: succeeded ? "" : `Execution ${execution}. A finalized failure does not change the case.`,
        };
      }
      if (["CANCELED", "UNDETERMINED", "LEADER_TIMEOUT"].includes(statusName)) {
        return { ok: false, statusName, execution, tx, error: `Consensus ended as ${statusName}.` };
      }
    } catch (error) {
      last = error instanceof Error ? error.message : "lookup failed";
    }
    await sleep(12000);
  }
  return { ok: false, statusName: last, execution: "NOT_VOTED", tx: null, error: `Timed out waiting for finalization. Last status: ${last}.` };
}
