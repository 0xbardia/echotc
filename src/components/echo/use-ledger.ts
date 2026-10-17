import { useEffect, useState } from "react";
import { useEcho } from "@/lib/echo/store";

type PersistApi = {
  hasHydrated: () => boolean;
  onFinishHydration: (callback: () => void) => () => void;
  rehydrate: () => Promise<void> | void;
};

function ledgerPersist(): PersistApi | undefined {
  return (useEcho as { persist?: PersistApi }).persist;
}

export function useLedgerReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const persist = ledgerPersist();
    if (!persist) {
      setReady(true);
      return;
    }
    if (persist.hasHydrated()) {
      setReady(true);
      return;
    }
    const unsub = persist.onFinishHydration(() => setReady(true));
    void Promise.resolve(persist.rehydrate());
    return unsub;
  }, []);
  return ready;
}