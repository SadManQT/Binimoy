import { existsSync } from "node:fs";
import type { NextConfig } from "next";

// One root .env serves web and worker. Deployed containers pass real env vars
// and have no file; variables that are already set are never overridden.
if (existsSync("../../.env")) process.loadEnvFile("../../.env");

const config: NextConfig = {
  output: "standalone",
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
