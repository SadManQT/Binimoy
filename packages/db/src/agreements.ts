import { createHash, randomBytes } from "node:crypto";
import { type ErrorCode, parseMoney } from "@lp/contracts";
import {
  CAPABILITIES,
  getTemplate,
  type Template,
  validateTemplate,
} from "@lp/templates";
import type { PoolClient } from "pg";
import { z } from "zod";
import {
  type ApplyHook,
  type CommandResult,
  createAggregate,
  executeCommand,
  systemTransition,
} from "./commands";
import type { Pool } from "./index";

const INVITE_HOURS = 72;

type Failure<E extends ErrorCode = ErrorCode> = { ok: false; error: E };
const fail = <E extends ErrorCode>(error: E): Failure<E> => ({
  ok: false,
  error,
});

// INV-01: everything both parties agree to, as one snapshot. The template's
// items and timing are copied in, so a later template version cannot change
// an existing agreement.
export type Terms = {
  templateId: string;
  templateVersion: number;
  categoryId: string;
  policyVersion: string;
  capabilityVersion: string;
  title: string;
  mode: string;
  currency: string;
  amountMinor: string;
  feeMinor: string;
  product: Record<string, string>;
  items: Template["items"];
  timing: Template["timing"];
  refundRule: string;
  objectiveRelease: boolean;
  residualRisks: Template["residualRisks"];
  // C14.12: empty unless the template splits the price into milestones.
  // Agreements made before milestones existed have no such key.
  milestones?: { title: string; amountMinor: string }[];
};

const termsInput = z.object({
  templateId: z.string(),
  templateVersion: z.number().int(),
  title: z.string().trim().min(3).max(120),
  mode: z.string(),
  amountMinor: z.string(),
  product: z.record(z.string(), z.string().trim().max(500)),
  milestones: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(120),
        amountMinor: z.string(),
      }),
    )
    .max(6)
    .optional(),
});

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
const hashTerms = (terms: Terms) =>
  createHash("sha256").update(canonical(terms)).digest("hex");

// Returns null when the input cannot become valid terms.
function buildTerms(input: unknown): Terms | null {
  const parsed = termsInput.safeParse(input);
  if (!parsed.success) return null;
  const data = parsed.data;
  let template: Template;
  try {
    template = getTemplate(data.templateId, data.templateVersion);
  } catch {
    return null;
  }
  // D.1: capability and template checks run before anything can be funded.
  if (validateTemplate(template, CAPABILITIES).length > 0) return null;
  if (!(template.supportedModes as string[]).includes(data.mode)) return null;
  const milestones = data.milestones ?? [];
  try {
    if (parseMoney(data.amountMinor) <= 0n) return null;
    // Each milestone has its own positive price, and together they are
    // exactly the price of the deal (INV-03).
    const parts = milestones.map((m) => parseMoney(m.amountMinor));
    if (parts.some((part) => part <= 0n)) return null;
    if (
      template.milestones
        ? parts.reduce((a, b) => a + b, 0n) !== parseMoney(data.amountMinor)
        : parts.length > 0
    ) {
      return null;
    }
  } catch {
    return null;
  }
  const keys = template.fields.map((f) => f.key);
  if (Object.keys(data.product).some((key) => !keys.includes(key))) return null;
  for (const field of template.fields) {
    if (field.required && !data.product[field.key]) return null;
  }
  return {
    templateId: template.templateId,
    templateVersion: template.version,
    categoryId: template.categoryId,
    policyVersion: template.policyVersion,
    capabilityVersion: template.capabilityVersion,
    title: data.title,
    mode: data.mode,
    currency: template.currency,
    amountMinor: data.amountMinor,
    // Default test fee is zero (D.4). Any fee must appear here to be charged.
    feeMinor: "0",
    product: data.product,
    items: template.items,
    timing: template.timing,
    refundRule: template.refundRule,
    objectiveRelease: template.objectiveRelease,
    residualRisks: template.residualRisks,
    milestones,
  };
}

async function insertVersion(
  client: PoolClient,
  agreementId: string,
  versionNo: number,
  terms: Terms,
  userId: string,
): Promise<string> {
  const termsHash = hashTerms(terms);
  await client.query(
    "insert into agreement_version (agreement_id, version_no, terms, terms_hash, created_by) values ($1, $2, $3, $4, $5)",
    [agreementId, versionNo, terms, termsHash, userId],
  );
  return termsHash;
}

export async function createDeal(
  pool: Pool,
  userId: string,
  input: unknown,
): Promise<
  | { ok: true; dealId: string; agreementId: string }
  | Failure<"VALIDATION_FAILED">
> {
  const role = z.object({ role: z.enum(["buyer", "seller"]) }).safeParse(input);
  const terms = buildTerms(input);
  if (!role.success || !terms) return fail("VALIDATION_FAILED");

  const client = await pool.connect();
  try {
    await client.query("begin");
    const deal = await client.query(
      "insert into deal (created_by, title) values ($1, $2) returning id",
      [userId, terms.title],
    );
    const dealId: string = deal.rows[0].id;
    await client.query(
      "insert into deal_party (deal_id, user_id, role) values ($1, $2, $3)",
      [dealId, userId, role.data.role],
    );
    const agreementId = await createAggregate(client, {
      type: "agreement",
      dealId,
    });
    await insertVersion(client, agreementId, 1, terms, userId);
    await client.query("commit");
    return { ok: true, dealId, agreementId };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

// The token is returned once and never stored. A new invitation replaces any
// earlier open one for the deal.
export async function createInvite(
  pool: Pool,
  userId: string,
  dealId: string,
): Promise<
  | { ok: true; token: string; role: "buyer" | "seller"; expiresAt: Date }
  | Failure<"NOT_AUTHORIZED" | "INVITE_INVALID">
> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    // Lock the agreement so an invitation cannot race a withdrawal.
    const { rows } = await client.query(
      `select a.state, p.role
       from aggregate a
       left join deal_party p on p.deal_id = a.deal_id
       where a.deal_id = $1 and a.type = 'agreement'
       for update of a`,
      [dealId],
    );
    const parties = await client.query(
      "select user_id, role from deal_party where deal_id = $1",
      [dealId],
    );
    const mine = parties.rows.find((p) => p.user_id === userId);
    if (rows.length === 0 || !mine) {
      await client.query("rollback");
      return fail("NOT_AUTHORIZED");
    }
    const open = ["DRAFT", "AWAITING_ACCEPTANCE"].includes(rows[0].state);
    if (!open || parties.rows.length !== 1) {
      await client.query("rollback");
      return fail("INVITE_INVALID");
    }
    const role = mine.role === "buyer" ? "seller" : "buyer";
    const token = randomBytes(32).toString("base64url");
    await client.query(
      "update deal_invite set revoked_at = now() where deal_id = $1 and accepted_at is null and revoked_at is null",
      [dealId],
    );
    const invite = await client.query(
      `insert into deal_invite (deal_id, role, token_hash, created_by, expires_at)
       values ($1, $2, $3, $4, now() + make_interval(hours => $5))
       returning expires_at`,
      [dealId, role, hashToken(token), userId, INVITE_HOURS],
    );
    await client.query("commit");
    return { ok: true, token, role, expiresAt: invite.rows[0].expires_at };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function acceptInvite(
  pool: Pool,
  userId: string,
  token: string,
): Promise<
  { ok: true; dealId: string } | Failure<"NOT_AUTHORIZED" | "INVITE_INVALID">
> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    // Expiry uses the database clock, never the caller's (D.3).
    const { rows } = await client.query(
      `select id, deal_id, role from deal_invite
       where token_hash = $1 and accepted_at is null and revoked_at is null
         and expires_at > now()
       for update`,
      [hashToken(token)],
    );
    const invite = rows[0];
    if (!invite) {
      await client.query("rollback");
      return fail("INVITE_INVALID");
    }
    try {
      await client.query(
        "insert into deal_party (deal_id, user_id, role) values ($1, $2, $3)",
        [invite.deal_id, userId, invite.role],
      );
    } catch (error) {
      await client.query("rollback");
      // The inviter using their own link, or the role already being filled.
      if ((error as { code?: string }).code === "23505") {
        return fail("NOT_AUTHORIZED");
      }
      throw error;
    }
    await client.query(
      "update deal_invite set accepted_by = $1, accepted_at = now() where id = $2",
      [userId, invite.id],
    );
    await client.query("commit");
    return { ok: true, dealId: invite.deal_id };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function currentVersion(client: PoolClient, agreementId: string) {
  const { rows } = await client.query(
    "select version_no, terms_hash from agreement_version where agreement_id = $1 order by version_no desc limit 1",
    [agreementId],
  );
  return rows[0] as { version_no: number; terms_hash: string };
}

const HOOKS = {
  ProposeAgreement: async (client, { aggregate }) => {
    const { rows } = await client.query(
      "select count(*)::int as n from deal_party where deal_id = $1",
      [aggregate.dealId],
    );
    if (rows[0].n !== 2) return { error: "COUNTERPARTY_MISSING" };
    const version = await currentVersion(client, aggregate.id);
    return {
      event: { versionNo: version.version_no, termsHash: version.terms_hash },
    };
  },

  // Full replacement of the editable terms. The template cannot be switched.
  ReviseAgreement: async (client, { aggregate, actor, payload }) => {
    if (actor.kind !== "user") return { error: "NOT_AUTHORIZED" };
    const terms = buildTerms(payload);
    if (!terms) return { error: "VALIDATION_FAILED" };
    const previous = await currentVersion(client, aggregate.id);
    const versionNo = previous.version_no + 1;
    const termsHash = await insertVersion(
      client,
      aggregate.id,
      versionNo,
      terms,
      actor.userId,
    );
    return { event: { versionNo, termsHash } };
  },

  AcceptAgreement: async (client, { aggregate, actor, payload }) => {
    if (actor.kind !== "user") return { error: "NOT_AUTHORIZED" };
    const version = await currentVersion(client, aggregate.id);
    // Consent is to exact terms. A hash of anything else is a stale consent.
    if (payload.termsHash !== version.terms_hash) {
      return { error: "VERSION_CONFLICT" };
    }
    await client.query(
      `insert into agreement_acceptance (agreement_id, version_no, user_id, terms_hash)
       values ($1, $2, $3, $4) on conflict do nothing`,
      [aggregate.id, version.version_no, actor.userId, version.terms_hash],
    );
    const { rows } = await client.query(
      `select count(*)::int as n from agreement_acceptance a
       join deal_party p on p.deal_id = $3 and p.user_id = a.user_id
       where a.agreement_id = $1 and a.version_no = $2`,
      [aggregate.id, version.version_no, aggregate.dealId],
    );
    return {
      to: rows[0].n === 2 ? "ACCEPTED" : "AWAITING_ACCEPTANCE",
      event: { versionNo: version.version_no, termsHash: version.terms_hash },
    };
  },

  // D.3: either party may withdraw while the deal is unfunded. Once a payment
  // has started, money may be in flight, so withdrawal is no longer possible.
  WithdrawAgreement: async (client, { aggregate, commandId }) => {
    const invoices = await client.query(
      `select f.invoice_id, a.state from funding_invoice f
       join aggregate a on a.id = f.invoice_id
       where f.deal_id = $1 and f.active`,
      [aggregate.dealId],
    );
    for (const invoice of invoices.rows) {
      if (invoice.state !== "CREATED") return { error: "ALREADY_FUNDED" };
      await systemTransition(client, {
        aggregateId: invoice.invoice_id,
        command: "CancelInvoice",
        causationId: commandId,
      });
      await client.query(
        "update funding_invoice set active = false where invoice_id = $1",
        [invoice.invoice_id],
      );
    }
    await client.query(
      "update deal_invite set revoked_at = now() where deal_id = $1 and accepted_at is null and revoked_at is null",
      [aggregate.dealId],
    );
    return { event: {} };
  },
} satisfies Record<string, ApplyHook>;

export type AgreementCommand = keyof typeof HOOKS;

export function agreementCommand(
  pool: Pool,
  environment: string,
  input: {
    userId: string;
    agreementId: string;
    command: AgreementCommand;
    envelope: unknown;
  },
): Promise<CommandResult> {
  const hook = HOOKS[input.command];
  if (!hook) return Promise.resolve(fail("VALIDATION_FAILED"));
  return executeCommand(pool, {
    environment,
    actor: { kind: "user", userId: input.userId },
    aggregateId: input.agreementId,
    command: input.command,
    envelope: input.envelope,
    apply: hook,
  });
}

export type DealView = {
  dealId: string;
  title: string;
  myRole: "buyer" | "seller";
  // userId is needed to address the counterparty in the secret vault.
  parties: { role: "buyer" | "seller"; name: string; userId: string }[];
  agreement: {
    id: string;
    state: string;
    aggregateVersion: number;
    versionNo: number;
    terms: Terms;
    termsHash: string;
    acceptedBy: ("buyer" | "seller")[];
  };
};

// Null for anyone who is not a party: an id is not a permission (D.2).
export async function getDealView(
  pool: Pool,
  userId: string,
  dealId: string,
): Promise<DealView | null> {
  if (!z.uuid().safeParse(dealId).success) return null;
  const parties = await pool.query(
    `select p.role, p.user_id, u.name from deal_party p
     join app_user u on u.id = p.user_id where p.deal_id = $1 order by p.role`,
    [dealId],
  );
  const mine = parties.rows.find((p) => p.user_id === userId);
  if (!mine) return null;
  const { rows } = await pool.query(
    `select d.title, a.id, a.state, a.version, v.version_no, v.terms, v.terms_hash,
       coalesce((select array_agg(p.role order by p.role)
                 from agreement_acceptance x
                 join deal_party p on p.deal_id = d.id and p.user_id = x.user_id
                 where x.agreement_id = a.id and x.version_no = v.version_no), '{}') as accepted_by
     from deal d
     join aggregate a on a.deal_id = d.id and a.type = 'agreement'
     join lateral (select * from agreement_version
                   where agreement_id = a.id order by version_no desc limit 1) v on true
     where d.id = $1`,
    [dealId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    dealId,
    title: row.title,
    myRole: mine.role,
    parties: parties.rows.map((p) => ({
      role: p.role,
      name: p.name,
      userId: p.user_id,
    })),
    agreement: {
      id: row.id,
      state: row.state,
      aggregateVersion: row.version,
      versionNo: row.version_no,
      terms: row.terms,
      termsHash: row.terms_hash,
      acceptedBy: row.accepted_by,
    },
  };
}

export async function listDeals(
  pool: Pool,
  userId: string,
): Promise<{ dealId: string; title: string; role: string; state: string }[]> {
  const { rows } = await pool.query(
    `select d.id as "dealId", d.title, p.role, a.state
     from deal_party p
     join deal d on d.id = p.deal_id
     join aggregate a on a.deal_id = d.id and a.type = 'agreement'
     where p.user_id = $1 order by d.created_at desc`,
    [userId],
  );
  return rows;
}

// What an invited person may see before joining: the title and their role.
export async function peekInvite(
  pool: Pool,
  token: string,
): Promise<{ title: string; role: "buyer" | "seller" } | null> {
  const { rows } = await pool.query(
    `select d.title, i.role from deal_invite i join deal d on d.id = i.deal_id
     where i.token_hash = $1 and i.accepted_at is null and i.revoked_at is null
       and i.expires_at > now()`,
    [hashToken(token)],
  );
  return rows[0] ?? null;
}

// A short fingerprint of everything a party sees on the deal page. An open
// page asks for it every few seconds and re-reads the deal when it differs,
// so one side sees the other side's action without reloading. Null for anyone
// who is not a party (D.2). It carries no deal content.
// ponytail: polled, one cheap query per open page every few seconds. Move to
// LISTEN/NOTIFY or server-sent events if open pages become many.
export async function dealPulse(
  pool: Pool,
  userId: string,
  dealId: string,
): Promise<string | null> {
  if (!z.uuid().safeParse(dealId).success) return null;
  const { rows } = await pool.query(
    `select concat_ws('.',
       (select count(*) from deal_party where deal_id = $1),
       (select coalesce(sum(version), 0) from aggregate where deal_id = $1),
       (select count(*) from agreement_acceptance x
          join aggregate a on a.id = x.agreement_id where a.deal_id = $1),
       (select coalesce(max(v.seq), 0) from monitored_message_version v
          join monitored_message m on m.id = v.message_id where m.deal_id = $1),
       (select count(*) + count(withdrawn_at) from monitoring_consent where deal_id = $1),
       (select count(*) + count(finished_at) from ai_job where deal_id = $1),
       (select count(*) + count(closed_at) from resolution_proposal where deal_id = $1),
       (select count(*) from decision_waiver w
          join review_decision r on r.id = w.decision_id
          join dispute d on d.dispute_id = r.dispute_id where d.deal_id = $1),
       (select coalesce(extract(epoch from max(set_at)), 0) from mock_provider_fact where deal_id = $1),
       (select count(*) from objective_window o
          join delivery_package p on p.package_id = o.package_id where p.deal_id = $1),
       (select count(*) from vault_room where deal_id = $1)
     ) as pulse
     where exists (select 1 from deal_party where deal_id = $1 and user_id = $2)`,
    [dealId, userId],
  );
  return rows[0]?.pulse ?? null;
}
