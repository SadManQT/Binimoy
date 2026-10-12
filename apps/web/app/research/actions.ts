"use server";

import {
  fixtureRetriever,
  fixtureSearchProvider,
  httpRetriever,
  runResearch,
  setCardMatch,
  tavilySearchProvider,
} from "@lp/adapters";
import { loadConfig } from "@lp/contracts";
import { redirect } from "next/navigation";
import { pool } from "../../lib/pool";
import { requireUser } from "../../lib/session";

export async function runResearchAction(form: FormData) {
  const user = await requireUser();
  // Live mode uses the configured provider and real pages; fixture mode
  // replays invented pages. There is no fallback from one to the other, and
  // every result records which provider produced it.
  const config = loadConfig(process.env);
  const live = config.RESEARCH_MODE === "live" && config.SEARCH_API_KEY;
  const result = await runResearch(pool(), {
    userId: user.id,
    subjectInput: String(form.get("subject") ?? ""),
    search: live
      ? tavilySearchProvider(config.SEARCH_API_KEY as string)
      : fixtureSearchProvider(),
    retrieve: live ? httpRetriever() : fixtureRetriever(),
  });
  redirect(
    result.ok
      ? `/research/${result.collectionId}`
      : `/research?error=${result.error}`,
  );
}

export async function setCardMatchAction(form: FormData) {
  const user = await requireUser();
  const collectionId = String(form.get("collectionId") ?? "");
  await setCardMatch(pool(), {
    userId: user.id,
    cardId: String(form.get("cardId") ?? ""),
    match: form.get("match") === "exact" ? "exact" : "ambiguous",
  });
  redirect(`/research/${encodeURIComponent(collectionId)}`);
}
