import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/components/echo/dashboard";

export const Route = createFileRoute("/app/")({
  head: () => ({
    meta: [
      { title: "Desk — EchoTc" },
      { name: "description", content: "Open EchoTc cases, public reads, and the labeled Direct Mode ledger." },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "/app" }],
  }),
  component: Dashboard,
});
