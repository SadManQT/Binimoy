import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

// Identity for every page and action comes from the session cookie only.
export async function requireUser() {
  const session = await auth().api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  return session.user;
}
