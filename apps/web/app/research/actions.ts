"use server";

import {
  fixtureRetriever,
  fixtureSearchProvider,
  runResearch,
  setCardMatch,
} from "@lp/adapters";
import { loadConfig } from "@lp/contracts";
import { redirect } from "next/navigation";
import { pool } from "../../lib/pool";
import { requireUser } from "../../lib/session";

export async function runResearchAction(form: FormData) {
  const user = await requireUser();
  // No live search provider is built yet. Fixtures are never passed off as
  // live results.
  if (loadConfig(process.env).RESEARCH_MODE !== "fixture") {
    redirect("/research?error=LIVE_SEARCH_NOT_BUILT");
  }
  const result = await runResearch(pool(), {
    userId: user.id,
    subjectInput: String(form.get("subject") ?? ""),
    search: fixtureSearchProvider(),
    retrieve: fixtureRetriever(),
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
