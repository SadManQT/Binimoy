import { userInfo } from "node:os";
import {
  activeStaffRoles,
  grantStaffRole,
  revokeStaffRole,
  type StaffRole,
} from "./access";
import { createPool } from "./index";

// Operator tool (D.2): staff roles are granted here, never through the app.
//   pnpm staff grant <email> <role> "<reason>"
//   pnpm staff revoke <email> <role>
//   pnpm staff list <email>
const [action, email, role, reason] = process.argv.slice(2);
const ROLES = [
  "reviewer",
  "appeal_reviewer",
  "approver",
  "moderator",
  "operator",
];
const usage = () => {
  console.error(
    'Usage: pnpm staff grant <email> <role> "<reason>" | revoke <email> <role> | list <email>',
  );
  process.exit(1);
};
if (!action || !email || !process.env.DATABASE_URL) usage();

const pool = createPool(process.env.DATABASE_URL as string);
const operator = `operator:${userInfo().username}`;
try {
  const found = await pool.query("select id from app_user where email = $1", [
    email,
  ]);
  const userId: string | undefined = found.rows[0]?.id;
  if (!userId) {
    console.error(
      `No account with the email ${email}. They must sign up first.`,
    );
    process.exitCode = 1;
  } else if (action === "list") {
    console.log(
      (await activeStaffRoles(pool, userId)).join(", ") || "(no staff roles)",
    );
  } else if (!role || !ROLES.includes(role)) {
    usage();
  } else if (action === "grant") {
    if (!reason) usage();
    await grantStaffRole(pool, {
      userId,
      role: role as StaffRole,
      grantedBy: operator,
      reason: reason as string,
    });
    console.log(`Granted ${role} to ${email} (recorded as ${operator}).`);
  } else if (action === "revoke") {
    await revokeStaffRole(pool, {
      userId,
      role: role as StaffRole,
      revokedBy: operator,
    });
    console.log(`Revoked ${role} from ${email} (recorded as ${operator}).`);
  } else {
    usage();
  }
} finally {
  await pool.end();
}
