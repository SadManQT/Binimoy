// Spec D.13, V7-36: the Scenario Lab lives in its own database schema. A
// reset removes that schema and nothing else, and it cannot be pointed at the
// application's own data or at production by any flag.

export const LAB_SCHEMA = "lp_lab";

// Returns why the lab tools must refuse to run, or null when they may.
export function labRefusal(env: {
  APP_ENV?: string;
  DB_SCHEMA?: string;
  PAYMENT_MODE?: string;
}): string | null {
  if (env.DB_SCHEMA !== LAB_SCHEMA) {
    return `The lab tools only work on the "${LAB_SCHEMA}" schema. Set DB_SCHEMA=${LAB_SCHEMA}.`;
  }
  if (
    env.APP_ENV !== "local" &&
    env.APP_ENV !== "test" &&
    env.APP_ENV !== "staging"
  ) {
    return "The lab tools do not run when APP_ENV is production or unset.";
  }
  if (env.PAYMENT_MODE !== undefined && env.PAYMENT_MODE !== "mock") {
    return "The lab tools do not run unless PAYMENT_MODE is mock.";
  }
  return null;
}
