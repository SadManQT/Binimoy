import type { PoolClient } from "pg";
import type { Pool } from "./index";
import { claimOutbox, completeOutbox, failOutbox } from "./outbox";

// Spec D.6: notices. The only channel that exists is the in-app list, and
// its delivery signal is an authenticated page having shown the notice.
// That is "shown", never "read". No email or SMS is sent by anything here.

export type NoticeKind =
  | "AGREEMENT_ACCEPTED"
  | "FUNDING_CONFIRMED"
  | "DELIVERY_SUBMITTED"
  | "OBJECTIVE_RELEASE_NOTICE"
  | "SETTLEMENT_AUTHORIZED"
  | "TRANSFER_COMPLETED"
  | "TRANSFER_FAILED"
  | "DISPUTE_OPENED"
  | "DISPUTE_UPDATED";

// For use inside a caller's transaction, when the notice is itself part of
// what is being committed.
export async function insertNotice(
  client: Pool | PoolClient,
  input: {
    recipientId: string;
    dealId: string;
    kind: NoticeKind;
    detail?: Record<string, string | number>;
    eventId?: string;
  },
): Promise<string | null> {
  const { rows } = await client.query(
    `insert into notice (recipient_id, deal_id, kind, detail, event_id)
     values ($1, $2, $3, $4, $5)
     on conflict (event_id, recipient_id) do nothing returning id`,
    [
      input.recipientId,
      input.dealId,
      input.kind,
      JSON.stringify(input.detail ?? {}),
      input.eventId ?? null,
    ],
  );
  return rows[0]?.id ?? null;
}

type To = "both" | "buyer";
// Which recorded transitions people are told about. Keyed by aggregate type
// and the state reached. Anything not listed produces no notice.
const RULES: Record<string, Record<string, [NoticeKind, To]>> = {
  agreement: { ACCEPTED: ["AGREEMENT_ACCEPTED", "both"] },
  funding_invoice: { CONFIRMED: ["FUNDING_CONFIRMED", "both"] },
  delivery: { SUBMITTED: ["DELIVERY_SUBMITTED", "buyer"] },
  authorization: { RESERVED: ["SETTLEMENT_AUTHORIZED", "both"] },
  adapter_operation: {
    SUCCEEDED: ["TRANSFER_COMPLETED", "both"],
    FAILED_FINAL: ["TRANSFER_FAILED", "both"],
  },
};

async function noticesForEvent(pool: Pool, eventId: string): Promise<void> {
  const { rows } = await pool.query(
    `select a.type, a.deal_id, e.payload ->> 'to' as reached
     from event e join aggregate a on a.id = e.aggregate_id where e.event_id = $1`,
    [eventId],
  );
  const event = rows[0];
  if (!event) return;
  const rule =
    event.type === "dispute"
      ? (["DISPUTE_UPDATED", "both"] as const)
      : RULES[event.type]?.[event.reached];
  if (!rule) return;
  const parties = await pool.query(
    "select user_id, role from deal_party where deal_id = $1",
    [event.deal_id],
  );
  for (const party of parties.rows) {
    if (rule[1] === "buyer" && party.role !== "buyer") continue;
    await insertNotice(pool, {
      recipientId: party.user_id,
      dealId: event.deal_id,
      kind: rule[0],
      // The state name is all the detail a notice carries.
      detail: { state: event.reached },
      eventId,
    });
  }
}

// Run by the worker: turns recorded events into notices. A failure leaves
// the entry for a bounded number of retries, then dead-letters it (D.5).
export async function deliverOutbox(
  pool: Pool,
  owner: string,
): Promise<number> {
  const claims = await claimOutbox(pool, owner, 50, 60);
  let done = 0;
  for (const claim of claims) {
    try {
      await noticesForEvent(pool, claim.eventId);
      if (await completeOutbox(pool, claim)) done += 1;
    } catch (error) {
      await failOutbox(pool, claim, String(error).slice(0, 500));
    }
  }
  return done;
}

export type Notice = {
  id: string;
  kind: NoticeKind;
  dealId: string | null;
  dealTitle: string | null;
  detail: Record<string, string | number>;
  createdAt: string;
  renderedAt: string | null;
};

export async function listNotices(
  pool: Pool,
  userId: string,
): Promise<Notice[]> {
  const { rows } = await pool.query(
    `select n.id, n.kind, n.deal_id, d.title, n.detail, n.created_at, n.rendered_at
     from notice n left join deal d on d.id = n.deal_id
     where n.recipient_id = $1 order by n.created_at desc, n.id limit 100`,
    [userId],
  );
  return rows.map((n) => ({
    id: n.id,
    kind: n.kind,
    dealId: n.deal_id,
    dealTitle: n.title,
    detail: n.detail,
    createdAt: (n.created_at as Date).toISOString(),
    renderedAt: n.rendered_at?.toISOString() ?? null,
  }));
}

export async function unseenNotices(
  pool: Pool,
  userId: string,
): Promise<number> {
  const { rows } = await pool.query(
    "select count(*)::int as n from notice where recipient_id = $1 and rendered_at is null",
    [userId],
  );
  return rows[0].n;
}

// Called by a page that is about to show these notices to their recipient.
// D.6, V7-15: an objective-release challenge period starts here, in full,
// and only once. Returns how many notices were newly shown.
export async function renderNotices(
  pool: Pool,
  userId: string,
  dealId?: string,
): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const shown = await client.query(
      `update notice set rendered_at = now()
       where recipient_id = $1 and rendered_at is null
         and ($2::uuid is null or deal_id = $2)
       returning id`,
      [userId, dealId ?? null],
    );
    await client.query(
      `update objective_window
       set due_at = now() + make_interval(hours => challenge_hours)
       where due_at is null and notice_id = any($1)`,
      [shown.rows.map((r) => r.id)],
    );
    await client.query("commit");
    return shown.rowCount ?? 0;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
