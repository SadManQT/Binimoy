import { expect, test } from "vitest";
import { labRefusal } from "./lab";

test("V7-36: the lab tools refuse any schema but their own, production, and any real payment mode", () => {
  const ok = { APP_ENV: "local", DB_SCHEMA: "lp_lab", PAYMENT_MODE: "mock" };
  expect(labRefusal(ok)).toBeNull();
  expect(labRefusal({ ...ok, APP_ENV: "staging" })).toBeNull();
  for (const env of [
    { ...ok, DB_SCHEMA: "public" },
    { ...ok, DB_SCHEMA: undefined },
    { ...ok, DB_SCHEMA: "lp_test" },
    { ...ok, DB_SCHEMA: "lp_lab; select 1" },
    { ...ok, APP_ENV: "production" },
    { ...ok, APP_ENV: undefined },
    { ...ok, PAYMENT_MODE: "live" },
  ]) {
    expect(labRefusal(env), JSON.stringify(env)).toEqual(expect.any(String));
  }
});
