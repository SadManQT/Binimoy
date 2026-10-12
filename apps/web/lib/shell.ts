import { pool } from "./pool";
import { getSession } from "./session";

export type Shell = {
  user: { name: string } | null;
  unseen: number;
  roles: string[];
};
const SIGNED_OUT: Shell = { user: null, unseen: 0, roles: [] };

// What the header needs. A failure here must never take a page down with it:
// the header falls back to its signed-out form.
export async function getShell(): Promise<Shell> {
  try {
    const session = await getSession();
    if (!session) return SIGNED_OUT;
    const { rows } = await pool().query(
      `select
         (select count(*)::int from notice where recipient_id = $1 and rendered_at is null) as unseen,
         array(select role from staff_role where user_id = $1 and revoked_at is null) as roles`,
      [session.user.id],
    );
    return {
      user: { name: session.user.name },
      unseen: rows[0].unseen,
      roles: rows[0].roles,
    };
  } catch {
    return SIGNED_OUT;
  }
}
