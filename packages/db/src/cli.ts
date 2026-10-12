import { createPool } from "./index";
import { migrate } from "./migrate";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env and fill it in.",
  );
}
const pool = createPool(url);
console.log(
  JSON.stringify({ msg: "migrations_applied", applied: await migrate(pool) }),
);
await pool.end();
