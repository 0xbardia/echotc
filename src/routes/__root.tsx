import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { WalletProviders } from "@/components/echo/wallet-provider";
import { Shell } from "@/components/echo/shell";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "EchoTc — evidence provenance, not a verdict" },
      {
        name: "description",
        content:
          "EchoTc maps claim-specific evidence provenance and shows when many articles rely on one observed origin.",
      },
      { name: "theme-color", content: "#1f4d3a" },
      { name: "robots", content: "index,follow" },
      { property: "og:site_name", content: "EchoTc" },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "/og.jpg" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "/og.jpg" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__pwa/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__pwa/icon-180.png" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <AuthProvider>
          <WalletProviders>
            <Shell>
              <Outlet />
            </Shell>
          </WalletProviders>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}
