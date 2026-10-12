// Sets up the local Matrix homeserver used by the secret vault (spec D.7).
// Generates its config and keys once, writes random local-only secrets, and
// records the connection values in .env. Nothing here is used outside a
// developer machine.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";

const IMAGE =
  "matrixdotorg/synapse@sha256:abeb932f2a9293fcbb886d5ddd0f55a34d532708ebb8dc5642934dd91ca26237";
const SERVER_NAME = "binimoy.local";
const DATA = new URL("../infra/synapse/data/", import.meta.url).pathname;
const CONFIG = `${DATA}homeserver.yaml`;
const ENV = new URL("../.env", import.meta.url).pathname;

mkdirSync(DATA, { recursive: true });
if (!existsSync(CONFIG)) {
  execFileSync(
    "docker",
    [
      "run",
      "--rm",
      "-v",
      `${DATA}:/data`,
      "-e",
      `SYNAPSE_SERVER_NAME=${SERVER_NAME}`,
      "-e",
      "SYNAPSE_REPORT_STATS=no",
      IMAGE,
      "generate",
    ],
    { stdio: "inherit" },
  );
  const jwtSecret = randomBytes(32).toString("hex");
  appendFileSync(
    CONFIG,
    `
# --- Binimoy local overrides ---
enable_registration: false
# The app signs a short-lived token for the signed-in user; the browser trades
# it for its own device. No Matrix password exists anywhere.
jwt_config:
  enabled: true
  secret: "${jwtSecret}"
  algorithm: "HS256"
  subject_claim: "sub"
# D.7: no federation.
federation_domain_whitelist: []
allow_public_rooms_over_federation: false
encryption_enabled_by_default_for_room_type: all
# Local tests create many sessions quickly.
rc_login:
  address: { per_second: 100, burst_count: 200 }
  account: { per_second: 100, burst_count: 200 }
rc_message: { per_second: 100, burst_count: 200 }
rc_joins:
  local: { per_second: 100, burst_count: 200 }
rc_invites:
  per_room: { per_second: 100, burst_count: 200 }
  per_user: { per_second: 100, burst_count: 200 }
`,
  );
}

// The generated registration secret may contain characters that an .env
// file cannot carry (such as #), so it is replaced by a hex one.
{
  const current = readFileSync(CONFIG, "utf8");
  if (!/^registration_shared_secret: "[0-9a-f]{64}"$/m.test(current)) {
    writeFileSync(
      CONFIG,
      current.replace(
        /^registration_shared_secret: .*$/m,
        `registration_shared_secret: "${randomBytes(32).toString("hex")}"`,
      ),
    );
  }
}
const config = readFileSync(CONFIG, "utf8");
const pick = (pattern) => pattern.exec(config)?.[1];
const values = {
  MATRIX_HOMESERVER_URL: "http://localhost:8448",
  MATRIX_SERVER_NAME: SERVER_NAME,
  MATRIX_JWT_SECRET: pick(/jwt_config:[\s\S]*?secret: "([^"]+)"/),
  MATRIX_REGISTRATION_SECRET: pick(
    /^registration_shared_secret: "?([^"\n]+)"?/m,
  ),
};
let env = existsSync(ENV) ? readFileSync(ENV, "utf8") : "";
for (const [key, value] of Object.entries(values)) {
  if (!value)
    throw new Error(`could not read ${key} from the homeserver config`);
  const line = `${key}=${value}`;
  env = new RegExp(`^${key}=.*$`, "m").test(env)
    ? env.replace(new RegExp(`^${key}=.*$`, "m"), line)
    : `${env.trimEnd()}\n${line}\n`;
}
writeFileSync(ENV, env);
console.log("Matrix homeserver configured; connection values written to .env");
