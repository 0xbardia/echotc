import { useContext, useEffect, useState, type ReactNode } from "react";
import { ReadyContext } from "./wallet-context";

export function useWalletReady() {
  return useContext(ReadyContext);
}

export function WalletProviders({ children }: { children: ReactNode }) {
  const [Inner, setInner] = useState<(({ children }: { children: ReactNode }) => ReactNode) | null>(null);
  useEffect(() => {
    void import("./wallet-inner").then((mod) => setInner(() => mod.WalletInner));
  }, []);
  if (!Inner) return <ReadyContext.Provider value={false}>{children}</ReadyContext.Provider>;
  return <Inner>{children}</Inner>;
}

export function ConnectSlot() {
  const ready = useWalletReady();
  const [Slot, setSlot] = useState<(() => ReactNode) | null>(null);
  useEffect(() => {
    if (!ready) return;
    void import("./wallet-inner").then((mod) => setSlot(() => mod.ConnectSlotInner));
  }, [ready]);
  if (!Slot) {
    return (
      <button className="btn" type="button" disabled>
        Connect wallet
      </button>
    );
  }
  return <Slot />;
}
