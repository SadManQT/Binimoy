import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";

// One session lookup per request, shared by the header and the page.
export const getSession = cache(async () =>
  auth().api.getSession({ headers: await headers() }),
);

// Identity for every page and action comes from the session cookie only.
export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session.user;
}
