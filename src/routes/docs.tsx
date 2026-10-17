import { createFileRoute } from "@tanstack/react-router";
import { DocsPage } from "@/components/echo/docs-page";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "Documentation — EchoTc" },
      {
        name: "description",
        content: "EchoTc policy, contract methods, Direct Mode limits, and how a Studionet deployment differs.",
      },
      { property: "og:title", content: "Documentation — EchoTc" },
      { property: "og:description", content: "Policy, read methods, and the difference between Direct Mode and Studionet." },
      { name: "twitter:title", content: "Documentation — EchoTc" },
      { name: "twitter:description", content: "Policy, read methods, and the difference between Direct Mode and Studionet." },
    ],
    links: [{ rel: "canonical", href: "/docs" }],
  }),
  component: DocsPage,
});
