import { createFileRoute } from "@tanstack/react-router";
import { RoadmapPage } from "@/components/echo/roadmap-page";

export const Route = createFileRoute("/roadmap")({
  head: () => ({
    meta: [
      { title: "Roadmap — EchoTc" },
      { name: "description", content: "What EchoTc has shipped, what is in progress, and what is only planned." },
      { property: "og:title", content: "Roadmap — EchoTc" },
      { property: "og:description", content: "Shipped, in progress, and planned. No partner wall and no invented audit tier." },
      { name: "twitter:title", content: "Roadmap — EchoTc" },
      { name: "twitter:description", content: "Shipped, in progress, and planned. No partner wall and no invented audit tier." },
    ],
    links: [{ rel: "canonical", href: "/roadmap" }],
  }),
  component: RoadmapPage,
});
