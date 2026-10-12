import { createVaultAdmin, type VaultAdmin } from "@lp/adapters";
import { loadConfig } from "@lp/contracts";

const cache = globalThis as { lpVaultAdmin?: Promise<VaultAdmin> };

// Null when no homeserver is configured: the vault is then unavailable, and
// callers must say so instead of pretending a delivery happened (INV-13).
export function vaultConfig() {
  return loadConfig(process.env).vault;
}

export function vaultAdmin(): Promise<VaultAdmin> | null {
  const config = vaultConfig();
  if (!config) return null;
  cache.lpVaultAdmin ??= createVaultAdmin(config);
  return cache.lpVaultAdmin;
}
