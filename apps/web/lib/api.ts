import { loadConfig } from "@lp/contracts";
import { NextResponse } from "next/server";
import { auth } from "./auth";

export const apiError = (error: string, status: number) =>
  NextResponse.json({ error }, { status });

// For JSON route handlers. Server actions get the same protections from the
// framework; route handlers need them stated.
export async function apiUser(request: Request) {
  // D.2: a state-changing request must come from our own origin.
  if (request.method !== "GET") {
    const origin = request.headers.get("origin");
    if (origin !== loadConfig(process.env).APP_URL) return null;
  }
  const session = await auth().api.getSession({ headers: request.headers });
  return session?.user ?? null;
}
