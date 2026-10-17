import { createFileRoute } from "@tanstack/react-router";
import { CaseDesk } from "@/components/echo/case-desk";

export const Route = createFileRoute("/cases/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Case ${params.id} — EchoTc` },
      { name: "description", content: "Source reviews, origin relationships, and direct reads for one EchoTc case." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CaseRoute,
});

function CaseRoute() {
  const { id } = Route.useParams();
  return <CaseDesk id={id} />;
}
