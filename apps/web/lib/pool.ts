import { loadConfig } from "@lp/contracts";
import { createPool, type Pool } from "@lp/db";

const cache = globalThis as { lpPool?: Pool };

// Cached on globalThis so dev hot reload does not open a new pool per edit.
export function pool(): Pool {
  const config = loadConfig(process.env);
  cache.lpPool ??= createPool(config.DATABASE_URL, config.DB_SCHEMA);
  return cache.lpPool;
}
