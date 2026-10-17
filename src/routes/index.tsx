import { createFileRoute } from "@tanstack/react-router";
import { FAQ, Landing } from "@/components/echo/landing";

const DESCRIPTION =
  "EchoTc maps claim-specific evidence provenance, revealing when multiple articles rely on the same underlying source.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EchoTc — Eight articles. How many actual witnesses?" },
      { name: "description", content: DESCRIPTION },
      { name: "keywords", content: "evidence provenance, source collapse, GenLayer, claim review, origin gap" },
      { name: "theme-color", content: "#1f4d3a" },
      { property: "og:title", content: "EchoTc — Eight articles. How many actual witnesses?" },
      { property: "og:description", content: DESCRIPTION },
      { name: "twitter:title", content: "EchoTc — Eight articles. How many actual witnesses?" },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: "/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebSite",
              name: "EchoTc",
              description: DESCRIPTION,
              inLanguage: "en",
            },
            {
              "@type": "SoftwareApplication",
              name: "EchoTc",
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web",
              description: DESCRIPTION,
              offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            },
            {
              "@type": "FAQPage",
              mainEntity: FAQ.map((item) => ({
                "@type": "Question",
                name: item.q,
                acceptedAnswer: { "@type": "Answer", text: item.a },
              })),
            },
          ],
        }),
      },
    ],
  }),
  component: Landing,
});
