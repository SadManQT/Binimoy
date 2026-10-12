import { expect, test } from "vitest";
import { loadConfig } from "./config";

const base = {
  APP_ENV: "local",
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  APP_URL: "http://localhost:3000",
  AUTH_SECRET: "0123456789abcdef0123456789abcdef",
};

test("defaults to mock and fixture modes", () => {
  expect(loadConfig(base)).toMatchObject({
    PAYMENT_MODE: "mock",
    VERIFIER_MODE: "mock",
    RESEARCH_MODE: "fixture",
    AI_MODE: "fixture",
  });
});

test("empty strings from a copied .env.example count as unset", () => {
  const config = loadConfig({
    ...base,
    SEARCH_API_KEY: "",
    MODEL_API_KEY: "",
    RESEARCH_MODE: "",
  });
  expect(config.RESEARCH_MODE).toBe("fixture");
  expect(config.SEARCH_API_KEY).toBeUndefined();
});

test("APP_ENV must be explicit", () => {
  expect(() => loadConfig({ ...base, APP_ENV: undefined })).toThrow(/APP_ENV/);
});

test("live research without a key fails and names the variable", () => {
  expect(() => loadConfig({ ...base, RESEARCH_MODE: "live" })).toThrow(
    /SEARCH_API_KEY/,
  );
});

test("live AI without a key fails and names the variable", () => {
  expect(() => loadConfig({ ...base, AI_MODE: "live" })).toThrow(
    /MODEL_API_KEY/,
  );
});

test("no payment or verifier mode other than mock is registered", () => {
  expect(() => loadConfig({ ...base, PAYMENT_MODE: "live" })).toThrow(
    /PAYMENT_MODE/,
  );
  expect(() => loadConfig({ ...base, VERIFIER_MODE: "live" })).toThrow(
    /VERIFIER_MODE/,
  );
});

test("error text never echoes a supplied key value", () => {
  let message = "";
  try {
    loadConfig({
      ...base,
      PAYMENT_MODE: "live",
      MODEL_API_KEY: "sk-secret-value",
    });
  } catch (error) {
    message = String(error);
  }
  expect(message).toContain("PAYMENT_MODE");
  expect(message).not.toContain("sk-secret-value");
});

test("a short auth secret is refused", () => {
  expect(() => loadConfig({ ...base, AUTH_SECRET: "too-short" })).toThrow(
    /AUTH_SECRET/,
  );
});

test("APP_URL must be a real http(s) origin", () => {
  expect(() => loadConfig({ ...base, APP_URL: "localhost:3000" })).toThrow(
    /APP_URL/,
  );
});

test("no social provider is enabled unless its credentials are set", () => {
  expect(loadConfig(base).social).toEqual({});
});

test("a social provider with both credentials is enabled", () => {
  const config = loadConfig({
    ...base,
    GOOGLE_CLIENT_ID: "id",
    GOOGLE_CLIENT_SECRET: "secret",
  });
  expect(config.social).toEqual({
    google: { clientId: "id", clientSecret: "secret" },
  });
});

test("half-configured social credentials stop startup and name the provider", () => {
  expect(() => loadConfig({ ...base, FACEBOOK_CLIENT_ID: "id" })).toThrow(
    /FACEBOOK_CLIENT_SECRET/,
  );
});
