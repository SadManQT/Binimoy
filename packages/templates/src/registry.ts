// Spec D.1: verification predicates and adapter capabilities come from this
// reviewed registry. A template can only name what is listed here; it cannot
// carry code of its own.

export type ProofType =
  | "seller_statement"
  | "buyer_observation"
  | "independent_fact";

export type CapabilityStatus =
  | "MOCK_TESTED"
  | "LIVE_TESTED"
  | "UNSUPPORTED"
  | "UNCONFIGURED";

type Predicate = { proof: ProofType; capability?: string };

export const PREDICATES: Record<string, Predicate> = {
  seller_declares: { proof: "seller_statement" },
  buyer_confirms: { proof: "buyer_observation" },
  "vault.package_bound": {
    proof: "independent_fact",
    capability: "secret_vault",
  },
  "mock_license.entitlement_matches": {
    proof: "independent_fact",
    capability: "mock_license_issuer",
  },
  "mock_license.activated_on_destination": {
    proof: "independent_fact",
    capability: "mock_license_issuer",
  },
  "mock_account.identity_matches": {
    proof: "independent_fact",
    capability: "mock_account_provider",
  },
  "mock_account.transfer_confirmed": {
    proof: "independent_fact",
    capability: "mock_account_provider",
  },
  "mock_account.recovery_controlled_by_buyer": {
    proof: "independent_fact",
    capability: "mock_account_provider",
  },
  "mock_account.prior_sessions_revoked": {
    proof: "independent_fact",
    capability: "mock_account_provider",
  },
};

export type Capabilities = Record<string, CapabilityStatus>;

// Every capability starts UNCONFIGURED. The task that builds and tests an
// adapter (the vault in LP-007, the mock providers in LP-008) changes its
// entry here, with the test evidence in its handoff.
export const CAPABILITIES: Capabilities = {
  secret_vault: "UNCONFIGURED",
  mock_license_issuer: "UNCONFIGURED",
  mock_account_provider: "UNCONFIGURED",
};
