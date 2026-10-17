import { createServerFn } from "@tanstack/react-start";
import { preflight, type PreflightResult } from "./policy.ts";

export const runPreflight = createServerFn({ method: "POST" })
  .validator((data: { claim: string; urls: string[] }) => {
    if (!data || !Array.isArray(data.urls) || typeof data.claim !== "string") {
      throw new Error("Preflight needs a claim and a list of URLs.");
    }
    return { claim: data.claim.slice(0, 2000), urls: data.urls.slice(0, 20).map((url) => String(url).slice(0, 500)) };
  })
  .handler(async ({ data }): Promise<PreflightResult> => preflight(data.claim, data.urls));
