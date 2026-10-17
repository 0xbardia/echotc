/**
 * Mount once in `__root.tsx` so the App preview chrome can drive navigation
 * (and later receive registered routes). Noops when the app is not embedded.
 */

import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  collectRoutePathsFromTree,
  installPreviewHostBridge,
} from "@/lib/preview-host-bridge";

export function PreviewHostBridge() {
  const router = useRouter();

  useEffect(() => {
    return installPreviewHostBridge({
      navigate: (path) => {
        router.history.push(path);
      },
      getRoutePaths: () => {
        const paths = collectRoutePathsFromTree(router.routeTree);
        try {
          const raw = localStorage.getItem("echotc-ledger-v1") || localStorage.getItem("echotrace-ledger-v1");
          const cases = raw ? Object.keys(JSON.parse(raw).state?.ledger?.cases ?? {}) : [];
          for (const id of cases) paths.push(`/cases/${id}`);
        } catch {
          // The ledger is optional. Static routes still report.
        }
        return paths;
      },
    });
  }, [router]);

  return null;
}
