import { loadConfig } from "@lp/contracts";
import { createPool, type Pool } from "@lp/db";

const cache = globalThis as { lpPool?: Pool };

// Cached on globalThis so dev hot reload does not open a new pool per edit.
export function pool(): Pool {
  cache.lpPool ??= createPool(loadConfig(process.env).DATABASE_URL);
  return cache.lpPool;
}
