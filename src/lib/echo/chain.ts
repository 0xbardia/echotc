/**
 * Syntactic address validation for 20-byte hex address.
 * Syntactic check only; does not prove contract interface compatibility.
 */
export function isValidContractAddress(address: unknown): address is `0x${string}` {
  return typeof address === "string" && /^0x[a-fA-F0-9]{40}$/.test(address.trim());
}

/**
 * Resolve explicitly configured EchoTrace contract address from environment or parameter.
 * Returns null when unconfigured or syntactically invalid. No baked fallback.
 */
export function getConfiguredContractAddress(overrideAddress?: string): `0x${string}` | null {
  if (overrideAddress !== undefined) {
    return isValidContractAddress(overrideAddress) ? (overrideAddress.trim() as `0x${string}`) : null;
  }
  const envVal =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_ECHO_CONTRACT_ADDRESS) ||
    (typeof process !== "undefined" && process.env?.VITE_ECHO_CONTRACT_ADDRESS) ||
    "";
  const trimmed = typeof envVal === "string" ? envVal.trim() : "";
  if (!isValidContractAddress(trimmed)) {
    return null;
  }
  return trimmed as `0x${string}`;
}

export const CONTRACT_ADDRESS: string =
  ((typeof import.meta !== "undefined" && import.meta.env?.VITE_ECHO_CONTRACT_ADDRESS) ||
    (typeof process !== "undefined" && process.env?.VITE_ECHO_CONTRACT_ADDRESS) ||
    "").trim();

export const DEPLOYMENT_TX =
  "0x8c6aa8e55b97139bbda7ac8524b0f28a5b1a2788e871d2f3aee1c183e99b4a30";

export function chainConfigured(overrideAddress?: string): boolean {
  return Boolean(getConfiguredContractAddress(overrideAddress));
}
