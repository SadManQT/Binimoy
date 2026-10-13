import { existsSync } from "node:fs";
import type { NextConfig } from "next";

// One root .env serves web and worker. Deployed containers pass real env vars
// and have no file; variables that are already set are never overridden.
if (existsSync("../../.env")) process.loadEnvFile("../../.env");

// No standalone output: both the container image and the tests start the app
// with `next start`, which does not use it, and it cost several hundred
// megabytes of copied dependencies on every build.
const config: NextConfig = {
  // Evidence pictures are posted through a form action: up to 2 MB each,
  // plus the form's own overhead. The database layer enforces the real limit.
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
  transpilePackages: [
    "@lp/adapters",
    "@lp/contracts",
    "@lp/db",
    "@lp/domain",
    "@lp/fixtures",
    "@lp/templates",
  ],
};

export default config;
