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

// `bindsField`: the fact only counts when the provider reports it for exactly
// the destination or identifier the agreement names in that field.
type Predicate = { proof: ProofType; capability?: string; bindsField?: string };

const mock = (capability: string, bindsField?: string): Predicate => ({
  proof: "independent_fact",
  capability,
  ...(bindsField ? { bindsField } : {}),
});

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
  "mock_game.attributes_match": mock("mock_game_publisher"),
  "mock_topup.supplier_authorized": mock("mock_topup_supplier"),
  "mock_topup.fulfilled_to_destination": mock(
    "mock_topup_supplier",
    "player_id",
  ),
  "mock_topup.quantity_matches": mock("mock_topup_supplier"),
  "mock_saas.plan_matches": mock("mock_saas_provider"),
  "mock_saas.role_and_seats": mock("mock_saas_provider", "buyer_account"),
  "mock_giftcard.balance_matches": mock("mock_giftcard_issuer"),
  "mock_build.tests_pass": mock("mock_build_runner"),
  "mock_registrar.transfer_confirmed": mock("mock_registrar", "domain"),
  "mock_enrollment.transfer_permitted": mock("mock_enrollment_provider"),
  "mock_enrollment.enrolled_at_destination": mock(
    "mock_enrollment_provider",
    "account_destination",
  ),
  "mock_enrollment.duration_matches": mock("mock_enrollment_provider"),
};

export type Capabilities = Record<string, CapabilityStatus>;

// D.1: what each adapter is, and how far it has been tested. Every "mock_"
// entry is one synthetic provider (packages/db/src/verification.ts) that
// answers from facts a tester sets; it proves the workflow, not that any real
// provider offers the same check. The vault is a real Matrix homeserver that
// has only ever been run locally.
export const CAPABILITIES: Capabilities = {
  secret_vault: "LIVE_TESTED",
  mock_license_issuer: "MOCK_TESTED",
  mock_account_provider: "MOCK_TESTED",
  mock_game_publisher: "MOCK_TESTED",
  mock_topup_supplier: "MOCK_TESTED",
  mock_saas_provider: "MOCK_TESTED",
  mock_giftcard_issuer: "MOCK_TESTED",
  mock_build_runner: "MOCK_TESTED",
  mock_registrar: "MOCK_TESTED",
  mock_enrollment_provider: "MOCK_TESTED",
};
