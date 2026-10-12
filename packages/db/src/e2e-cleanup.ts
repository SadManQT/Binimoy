import { withdrawReport } from "./community";
import { createPool } from "./index";

// Withdraws published reports left behind by an aborted browser test, as
// their own authors. A withdrawal is a recorded state change, not a deletion.
//   pnpm exec tsx --env-file=.env packages/db/src/e2e-cleanup.ts
const pool = createPool(process.env.DATABASE_URL as string);
try {
  const { rows } = await pool.query(
    `select r.id, r.author_id, s.display_name from community_report r
     join subject s on s.id = r.subject_id
     where r.state = 'PUBLISHED' and s.display_name like 'E2E %'`,
  );
  for (const row of rows) {
    const result = await withdrawReport(pool, {
      userId: row.author_id,
      reportId: row.id,
    });
    console.log(row.display_name, result.ok ? "withdrawn" : result.error);
  }
  console.log(`${rows.length} leftover test report(s) handled`);
} finally {
  await pool.end();
}
