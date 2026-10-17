const DEPLOYED_STUDIONET_ADDRESS = "0xCABcFaBC7a76d602b8c4b0Aed367853155aDe59B";

export const CONTRACT_ADDRESS = (
  (import.meta.env?.VITE_ECHO_CONTRACT_ADDRESS as string | undefined) || DEPLOYED_STUDIONET_ADDRESS
).trim();

export const DEPLOYMENT_TX =
  "0x8c6aa8e55b97139bbda7ac8524b0f28a5b1a2788e871d2f3aee1c183e99b4a30";

export function chainConfigured(): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(CONTRACT_ADDRESS);
}
