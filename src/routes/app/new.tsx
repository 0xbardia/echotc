import { createFileRoute } from "@tanstack/react-router";
import { NewCase } from "@/components/echo/new-case";

export const Route = createFileRoute("/app/new")({
  validateSearch: (search: Record<string, unknown>) => ({
    parent: typeof search.parent === "string" ? search.parent : "",
  }),
  head: () => ({
    meta: [
      { title: "New case — EchoTc" },
      { name: "description", content: "Freeze one claim and three to eight public URLs before provenance review." },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "/app/new" }],
  }),
  component: NewCaseRoute,
});

function NewCaseRoute() {
  const { parent } = Route.useSearch();
  return <NewCase parentId={parent ?? ""} />;
}
