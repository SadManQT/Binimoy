import type { ErrorCode } from "@lp/contracts";
import { looksLikeSecret } from "@lp/domain";
import { z } from "zod";
import { recordMonitoringConsent } from "./access";
import type { Pool } from "./index";

// Spec B3 and D.8: one monitored room per deal. It is readable by the server,
// by the deal's assigned reviewer, and (once both parties consent) by AI. It
// is not private between the parties, and the UI says so.

type Failure<E extends ErrorCode> = { ok: false; error: E };
const fail = <E extends ErrorCode>(error: E): Failure<E> => ({
  ok: false,
  error,
});

// What both parties are asked to accept before using the room. A change to
// any of this is a new version and needs consent again (D.8).
export const MONITORING_POLICY = {
  version: "monitoring-v1",
  purposes: ["delivery_assistance", "problem_diagnosis", "dispute_resolution"],
  // No model is connected in this release; this names where messages would go.
  modelDestination: "none: AI assistance is not enabled yet",
  attachmentClasses: [] as string[],
};

const MAX_BODY = 4000;

async function partyRole(pool: Pool, dealId: string, userId: string) {
  if (!z.uuid().safeParse(dealId).success) return undefined;
  const { rows } = await pool.query(
    "select role from deal_party where deal_id = $1 and user_id = $2",
    [dealId, userId],
  );
  return rows[0]?.role as "buyer" | "seller" | undefined;
}

const hasConsent = async (pool: Pool, dealId: string, userId: string) =>
  (
    await pool.query(
      `select 1 from monitoring_consent
       where deal_id = $1 and user_id = $2 and policy_version = $3 and withdrawn_at is null`,
      [dealId, userId, MONITORING_POLICY.version],
    )
  ).rowCount === 1;

export const acceptMonitoring = (pool: Pool, userId: string, dealId: string) =>
  recordMonitoringConsent(pool, {
    dealId,
    userId,
    policyVersion: MONITORING_POLICY.version,
    purposes: MONITORING_POLICY.purposes,
    modelDestination: MONITORING_POLICY.modelDestination,
    attachmentClasses: MONITORING_POLICY.attachmentClasses,
  });

// D.2: a party, or the reviewer currently assigned to a dispute on this deal.
async function mayRead(pool: Pool, dealId: string, userId: string) {
  if (await partyRole(pool, dealId, userId)) return true;
  if (!z.uuid().safeParse(dealId).success) return false;
  const { rows } = await pool.query(
    `select 1 from review_assignment r
     join dispute d on d.dispute_id = r.dispute_id
     where d.deal_id = $1 and r.reviewer_id = $2 and r.released_at is null
       and exists (select 1 from staff_role s
                   where s.user_id = $2 and s.role = 'reviewer' and s.revoked_at is null)
     limit 1`,
    [dealId, userId],
  );
  return rows.length === 1;
}

function checkBody(
  body: string,
):
  | { ok: true; body: string }
  | Failure<"VALIDATION_FAILED" | "SECRET_SUSPECTED"> {
  const trimmed = body.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_BODY) {
    return fail("VALIDATION_FAILED");
  }
  // B3: refuse what looks like a password, code or PIN before it is stored.
  // Nothing is saved, so nothing has to be cleaned up afterwards.
  if (looksLikeSecret(trimmed)) return fail("SECRET_SUSPECTED");
  return { ok: true, body: trimmed };
}

export async function postMessage(
  pool: Pool,
  input: { userId: string; dealId: string; body: string },
): Promise<
  | { ok: true; messageId: string }
  | Failure<
      | "NOT_AUTHORIZED"
      | "MISSING_CONSENT"
      | "VALIDATION_FAILED"
      | "SECRET_SUSPECTED"
    >
> {
  if (!(await partyRole(pool, input.dealId, input.userId))) {
    return fail("NOT_AUTHORIZED");
  }
  // No silent or retroactive consent: the author must have accepted first.
  if (!(await hasConsent(pool, input.dealId, input.userId))) {
    return fail("MISSING_CONSENT");
  }
  const checked = checkBody(input.body);
  if (!checked.ok) return checked;
  const client = await pool.connect();
  try {
    await client.query("begin");
    const message = await client.query(
      "insert into monitored_message (deal_id, author_id) values ($1, $2) returning id",
      [input.dealId, input.userId],
    );
    const messageId: string = message.rows[0].id;
    await client.query(
      "insert into monitored_message_version (message_id, version_no, kind, body) values ($1, 1, 'original', $2)",
      [messageId, checked.body],
    );
    await client.query("commit");
    return { ok: true, messageId };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// An edit or a deletion adds a version. The earlier text stays on record:
// what was said, and when it was changed, are both evidence (B3).
export async function reviseMessage(
  pool: Pool,
  input: { userId: string; messageId: string; body: string | null },
): Promise<
  | { ok: true; versionNo: number }
  | Failure<
      | "NOT_AUTHORIZED"
      | "MISSING_CONSENT"
      | "VALIDATION_FAILED"
      | "SECRET_SUSPECTED"
      | "ILLEGAL_TRANSITION"
    >
> {
  if (!z.uuid().safeParse(input.messageId).success)
    return fail("NOT_AUTHORIZED");
  const client = await pool.connect();
  try {
    await client.query("begin");
    const done = async <T>(value: T, commit = false) => {
      await client.query(commit ? "commit" : "rollback");
      return value;
    };
    const { rows } = await client.query(
      "select deal_id, author_id from monitored_message where id = $1 for update",
      [input.messageId],
    );
    const message = rows[0];
    // Only the author revises their own message.
    if (message?.author_id !== input.userId)
      return done(fail("NOT_AUTHORIZED"));
    if (!(await hasConsent(pool, message.deal_id, input.userId))) {
      return done(fail("MISSING_CONSENT"));
    }
    const latest = await client.query(
      "select version_no, kind from monitored_message_version where message_id = $1 order by version_no desc limit 1",
      [input.messageId],
    );
    if (["deleted", "redacted"].includes(latest.rows[0].kind)) {
      return done(fail("ILLEGAL_TRANSITION"));
    }
    let body: string | null = null;
    if (input.body !== null) {
      const checked = checkBody(input.body);
      if (!checked.ok) return done(checked);
      body = checked.body;
    }
    const versionNo: number = latest.rows[0].version_no + 1;
    await client.query(
      "insert into monitored_message_version (message_id, version_no, kind, body) values ($1, $2, $3, $4)",
      [input.messageId, versionNo, body === null ? "deleted" : "edit", body],
    );
    return done({ ok: true as const, versionNo }, true);
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// V7-25: either party can flag a message as containing a secret. Its text is
// removed from every version, and a private incident is recorded without the
// secret. This cannot un-show it to whoever already read it: the person whose
// secret it was must still change it at the provider.
export async function reportSecretExposure(
  pool: Pool,
  input: { userId: string; messageId: string },
): Promise<{ ok: true } | Failure<"NOT_AUTHORIZED">> {
  if (!z.uuid().safeParse(input.messageId).success)
    return fail("NOT_AUTHORIZED");
  const { rows } = await pool.query(
    "select deal_id from monitored_message where id = $1",
    [input.messageId],
  );
  const dealId: string | undefined = rows[0]?.deal_id;
  if (!dealId || !(await partyRole(pool, dealId, input.userId))) {
    return fail("NOT_AUTHORIZED");
  }
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      "update monitored_message_version set body = null, kind = 'redacted' where message_id = $1 and body is not null",
      [input.messageId],
    );
    await client.query(
      "insert into secret_incident (deal_id, message_id, reported_by) values ($1, $2, $3)",
      [dealId, input.messageId, input.userId],
    );
    await client.query("commit");
    return { ok: true };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export type MessageVersion = {
  seq: number;
  versionNo: number;
  kind: "original" | "edit" | "deleted" | "redacted";
  body: string | null;
  createdAt: Date;
};
export type Message = {
  messageId: string;
  authorRole: "buyer" | "seller";
  mine: boolean;
  // Oldest first. The last entry is what the message currently says.
  versions: MessageVersion[];
};

export type Conversation = {
  messages: Message[];
  // The highest version seq returned: pass it back as `after` to get only
  // what is new, without duplicates, after a reconnect.
  cursor: number;
  iConsented: boolean;
  aiMayRead: boolean;
};

// Null for anyone who is neither a party nor the assigned reviewer.
export async function getConversation(
  pool: Pool,
  input: { userId: string; dealId: string; after?: number },
): Promise<Conversation | null> {
  if (!(await mayRead(pool, input.dealId, input.userId))) return null;
  const after = input.after ?? 0;
  const { rows } = await pool.query(
    `select m.id, m.author_id, p.role, v.seq, v.version_no, v.kind, v.body, v.created_at
     from monitored_message m
     join deal_party p on p.deal_id = m.deal_id and p.user_id = m.author_id
     join monitored_message_version v on v.message_id = m.id
     where m.deal_id = $1
       and m.id in (select message_id from monitored_message_version x
                    join monitored_message mm on mm.id = x.message_id
                    where mm.deal_id = $1 and x.seq > $2)
     order by m.created_at, m.id, v.version_no`,
    [input.dealId, after],
  );
  const messages = new Map<string, Message>();
  let cursor = after;
  for (const row of rows) {
    const seq = Number(row.seq);
    cursor = Math.max(cursor, seq);
    const message = messages.get(row.id) ?? {
      messageId: row.id as string,
      authorRole: row.role as "buyer" | "seller",
      mine: row.author_id === input.userId,
      versions: [],
    };
    message.versions.push({
      seq,
      versionNo: row.version_no,
      kind: row.kind,
      body: row.body,
      createdAt: row.created_at,
    });
    messages.set(row.id, message);
  }
  const consent = await pool.query(
    `select count(*)::int as n,
       coalesce(bool_or(c.user_id = $2), false) as mine
     from deal_party p
     join monitoring_consent c on c.deal_id = p.deal_id and c.user_id = p.user_id
       and c.policy_version = $3 and c.withdrawn_at is null
     where p.deal_id = $1`,
    [input.dealId, input.userId, MONITORING_POLICY.version],
  );
  return {
    messages: [...messages.values()],
    cursor,
    iConsented: consent.rows[0].mine,
    // B13-11: AI may read only while both parties' consents are active.
    aiMayRead: consent.rows[0].n === 2,
  };
}
