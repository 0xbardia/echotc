import { ConnectButton, RainbowKitProvider, connectorsForWallets, lightTheme } from "@rainbow-me/rainbowkit";
import { injectedWallet, metaMaskWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { WagmiProvider, createConfig, createConnector, http, useAccount } from "wagmi";
import { injected } from "wagmi/connectors";
import { getConnections } from "@wagmi/core";
import { defineChain } from "viem";
import { PREVIEW_PRINCIPAL } from "@/lib/echo/types";
import { useEcho } from "@/lib/echo/store";
import { ReadyContext } from "./wallet-context";

import "@rainbow-me/rainbowkit/styles.css";

export const studionetChain = defineChain({
  id: 61999,
  name: "GenLayer Studionet",
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  rpcUrls: { default: { http: ["https://studio.genlayer.com/api"] } },
  blockExplorers: { default: { name: "Studio", url: "https://studio.genlayer.com" } },
  testnet: true,
});

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined;

function browserWallet() {
  return {
    id: "echotc-browser",
    name: "Browser wallet",
    iconUrl: "/favicon.svg",
    iconBackground: "#1f4d3a",
    installed: true,
    createConnector: () =>
      createConnector((config) => {
        const inner = injected({ shimDisconnect: true })(config);
        return {
          ...inner,
          async getChainId() {
            const ethereum = (globalThis as { ethereum?: { request?: unknown } }).ethereum;
            if (!ethereum?.request) {
              throw new Error("No browser wallet in this frame. Wallets do not inject into embedded previews. Open the desk in its own browser tab.");
            }
            return inner.getChainId();
          },
          async connect(parameters) {
            const ethereum = (globalThis as { ethereum?: { request?: unknown } }).ethereum;
            if (!ethereum?.request) {
              throw new Error("No browser wallet in this frame. Wallets do not inject into embedded previews. Open the desk in its own browser tab.");
            }
            return inner.connect(parameters);
          },
        };
      }),
  };
}

const connectors = connectorsForWallets(
  [
    {
      groupName: "Use this account to sign",
      wallets: [browserWallet, injectedWallet, metaMaskWallet, ...(projectId ? [walletConnectWallet] : [])],
    },
  ],
  {
    appName: "EchoTc",
    projectId: projectId || "echotc-no-walletconnect-project",
  },
);

export const walletConfig = createConfig({
  chains: [studionetChain],
  connectors,
  transports: { [studionetChain.id]: http(studionetChain.rpcUrls.default.http[0]) },
  ssr: true,
});

const queryClient = new QueryClient();

export async function connectedProvider() {
  const [connection] = getConnections(walletConfig);
  if (!connection) throw new Error("Connect a wallet before signing. The preview principal cannot sign.");
  const provider = await connection.connector.getProvider();
  if (!provider) throw new Error("The connected wallet did not expose a signing provider.");
  return provider;
}

function PrincipalSync() {
  const { address, isConnected } = useAccount();
  const setPrincipal = useEcho((state) => state.setPrincipal);
  useEffect(() => {
    setPrincipal(isConnected && address ? address.toLowerCase() : PREVIEW_PRINCIPAL);
  }, [address, isConnected, setPrincipal]);
  return null;
}

export function WalletInner({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={walletConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          modalSize="compact"
          theme={lightTheme({
            accentColor: "#1f4d3a",
            accentColorForeground: "#fbf7f1",
            borderRadius: "large",
            fontStack: "system",
          })}
        >
          <ReadyContext.Provider value={true}>
            <PrincipalSync />
            {children}
          </ReadyContext.Provider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export function ConnectSlotInner() {
  const [note, setNote] = useState("");
  const hasWallet = typeof window !== "undefined" && Boolean((window as { ethereum?: { request?: unknown } }).ethereum?.request);
  if (!hasWallet && !projectId) {
    return (
      <div className="connect-slot">
        <button className="btn" type="button" onClick={() => setNote((current) => current ? "" : "No browser wallet in this frame. Embedded previews cannot see MetaMask. Open the desk in its own tab, or set a WalletConnect project id.")}>
          Connect wallet
        </button>
        {note ? <p className="wallet-note" role="status">{note}</p> : null}
      </div>
    );
  }
  return (
    <div className="connect-slot">
      <ConnectButton chainStatus="icon" accountStatus="address" showBalance={false} />
    </div>
  );
}

export function walletProjectConfigured() {
  return Boolean(projectId);
}