import type { Pool } from "./index";

export type StaffRole =
  | "reviewer"
  | "appeal_reviewer"
  | "approver"
  | "moderator"
  | "operator";

type ConsentResult = { ok: true } | { ok: false; error: "NOT_AUTHORIZED" };

// D.8: records who agreed to exactly which monitoring policy. Agreeing again
// while a consent is active changes nothing.
export async function recordMonitoringConsent(
  pool: Pool,
  input: {
    dealId: string;
    userId: string;
    policyVersion: string;
    purposes: string[];
    modelDestination: string;
    attachmentClasses: string[];
  },
): Promise<ConsentResult> {
  try {
    await pool.query(
      `insert into monitoring_consent
         (deal_id, user_id, policy_version, purposes, model_destination, attachment_classes)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (deal_id, user_id, policy_version) where withdrawn_at is null
       do nothing`,
      [
        input.dealId,
        input.userId,
        input.policyVersion,
        input.purposes,
        input.modelDestination,
        input.attachmentClasses,
      ],
    );
    return { ok: true };
  } catch (error) {
    // Foreign key to deal_party: only a party to the deal can consent for it.
    if ((error as { code?: string }).code === "23503") {
      return { ok: false, error: "NOT_AUTHORIZED" };
    }
    throw error;
  }
}

// Stops future processing. It does not delete the record or anything derived
// before the withdrawal.
export async function withdrawMonitoringConsent(
  pool: Pool,
  input: { dealId: string; userId: string },
): Promise<void> {
  await pool.query(
    `update monitoring_consent set withdrawn_at = now()
     where deal_id = $1 and user_id = $2 and withdrawn_at is null`,
    [input.dealId, input.userId],
  );
}

// True only when both parties hold an active consent to this exact version.
// Callers check this immediately before each AI read, not once per deal.
export async function monitoringAllowed(
  pool: Pool,
  dealId: string,
  policyVersion: string,
): Promise<boolean> {
  const { rows } = await pool.query(
    `select count(*)::int as n from deal_party p
     where p.deal_id = $1 and exists (
       select 1 from monitoring_consent c
       where c.deal_id = p.deal_id and c.user_id = p.user_id
         and c.policy_version = $2 and c.withdrawn_at is null)`,
    [dealId, policyVersion],
  );
  return rows[0].n === 2;
}

// D.2: enrollment is closed. These are called by an operator tool, never by a
// request handler acting on user input.
export async function grantStaffRole(
  pool: Pool,
  input: { userId: string; role: StaffRole; grantedBy: string; reason: string },
): Promise<void> {
  await pool.query(
    `insert into staff_role (user_id, role, granted_by, reason) values ($1, $2, $3, $4)
     on conflict (user_id, role) where revoked_at is null do nothing`,
    [input.userId, input.role, input.grantedBy, input.reason],
  );
}

export async function revokeStaffRole(
  pool: Pool,
  input: { userId: string; role: StaffRole; revokedBy: string },
): Promise<void> {
  await pool.query(
    `update staff_role set revoked_at = now(), revoked_by = $3
     where user_id = $1 and role = $2 and revoked_at is null`,
    [input.userId, input.role, input.revokedBy],
  );
}

export async function activeStaffRoles(
  pool: Pool,
  userId: string,
): Promise<StaffRole[]> {
  const { rows } = await pool.query(
    "select role from staff_role where user_id = $1 and revoked_at is null order by role",
    [userId],
  );
  return rows.map((r) => r.role as StaffRole);
}
