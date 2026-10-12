import { createHash } from "node:crypto";
import { commandEnvelope, type ErrorCode } from "@lp/contracts";
import {
  type AggregateType,
  allowedTargets,
  checkTransition,
  MACHINES,
  type Role,
} from "@lp/domain";
import type { PoolClient } from "pg";
import { z } from "zod";
import type { Pool } from "./index";

// The actor is supplied by the server (session or worker), never by the client.
export type Actor =
  | { kind: "user"; userId: string }
  | { kind: "system"; name: string };

export type CommandResult =
  | { ok: true; state: string; aggregateVersion: number; eventId: string }
  | { ok: false; error: ErrorCode };

export type CommandInput = {
  environment: string;
  actor: Actor;
  aggregateId: string;
  command: string;
  envelope: unknown;
  // Required when the command has more than one possible target state and no
  // `apply` hook chooses it.
  to?: string;
  // Command-specific guards and writes. Runs inside the transaction, under the
  // aggregate lock, after role, idempotency and version checks have passed.
  apply?: ApplyHook;
};

export type ApplyContext = {
  aggregate: {
    id: string;
    type: AggregateType;
    dealId: string;
    state: string;
    version: number;
  };
  actor: Actor;
  roles: Role[];
  payload: Record<string, unknown>;
};
export type ApplyResult =
  // `event` replaces the command payload in the stored event, for commands
  // whose payload should not be kept verbatim.
  { to?: string; event?: Record<string, unknown> } | { error: ErrorCode };
export type ApplyHook = (
  client: PoolClient,
  context: ApplyContext,
) => Promise<ApplyResult>;

const fail = (error: ErrorCode): CommandResult => ({ ok: false, error });

// Key order must not change the hash: {a,b} and {b,a} are the same payload.
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

export async function createAggregate(
  client: PoolClient,
  input: { type: AggregateType; dealId: string },
): Promise<string> {
  const { rows } = await client.query(
    "insert into aggregate (type, deal_id, state) values ($1, $2, $3) returning id",
    [input.type, input.dealId, MACHINES[input.type].initial],
  );
  return rows[0].id;
}

// ponytail: only party roles are resolved. Reviewer, appeal reviewer and
// approver come from scoped assignments, added in LP-010; until then every
// command that needs one of them is denied.
async function resolveRoles(
  client: PoolClient,
  actor: Actor,
  dealId: string,
): Promise<Role[]> {
  if (actor.kind === "system") return ["system"];
  const { rows } = await client.query(
    "select role from deal_party where deal_id = $1 and user_id = $2",
    [dealId, actor.userId],
  );
  return rows.map((r) => r.role as Role);
}

export async function executeCommand(
  pool: Pool,
  input: CommandInput,
): Promise<CommandResult> {
  const parsed = commandEnvelope.safeParse(input.envelope);
  const ids = z
    .uuid()
    .array()
    .safeParse([
      input.aggregateId,
      ...(input.actor.kind === "user" ? [input.actor.userId] : []),
    ]);
  if (!parsed.success || !ids.success) return fail("VALIDATION_FAILED");
  const envelope = parsed.data;
  const principal =
    input.actor.kind === "user"
      ? `user:${input.actor.userId}`
      : `system:${input.actor.name}`;

  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await run(client, input, envelope, principal);
    await client.query(result.ok ? "commit" : "rollback");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function run(
  client: PoolClient,
  input: CommandInput,
  envelope: z.infer<typeof commandEnvelope>,
  principal: string,
): Promise<CommandResult> {
  // The row lock serializes every command on this aggregate, across web and
  // worker processes. Everything below runs under it.
  const { rows } = await client.query(
    "select type, deal_id, state, version from aggregate where id = $1 for update",
    [input.aggregateId],
  );
  const aggregate = rows[0];
  // Unknown id and no access are indistinguishable: an id is not a permission.
  if (!aggregate) return fail("NOT_AUTHORIZED");
  if (envelope.dealId && envelope.dealId !== aggregate.deal_id) {
    return fail("NOT_AUTHORIZED");
  }
  const roles = await resolveRoles(client, input.actor, aggregate.deal_id);
  if (roles.length === 0) return fail("NOT_AUTHORIZED");

  const payloadHash = createHash("sha256")
    .update(canonical({ to: input.to ?? null, payload: envelope.payload }))
    .digest("hex");
  const seen = await client.query(
    `select payload_hash, result from idempotency
     where aggregate_id = $1 and principal = $2 and command = $3
       and environment = $4 and key = $5`,
    [
      input.aggregateId,
      principal,
      input.command,
      input.environment,
      envelope.idempotencyKey,
    ],
  );
  if (seen.rows[0]) {
    return seen.rows[0].payload_hash === payloadHash
      ? (seen.rows[0].result as CommandResult)
      : fail("IDEMPOTENCY_CONFLICT");
  }

  if (envelope.expectedAggregateVersion !== aggregate.version) {
    return fail("VERSION_CONFLICT");
  }
  // Role and state are checked before the hook, so an actor who may not issue
  // this command never reaches command-specific code.
  const permitted = allowedTargets(
    aggregate.type,
    aggregate.state,
    input.command,
    roles,
  );
  if (!permitted.ok) return fail(permitted.error);
  const applied = input.apply
    ? await input.apply(client, {
        aggregate: {
          id: input.aggregateId,
          type: aggregate.type,
          dealId: aggregate.deal_id,
          state: aggregate.state,
          version: aggregate.version,
        },
        actor: input.actor,
        roles,
        payload: envelope.payload,
      })
    : {};
  if ("error" in applied) return fail(applied.error);
  const transition = checkTransition(
    aggregate.type,
    aggregate.state,
    input.command,
    roles,
    applied.to ?? input.to,
  );
  if (!transition.ok) return fail(transition.error);

  const version = aggregate.version + 1;
  const updated = await client.query(
    "update aggregate set state = $1, version = $2 where id = $3 and version = $4",
    [transition.to, version, input.aggregateId, aggregate.version],
  );
  // Zero affected rows is a conflict, never a success (D.3).
  if (updated.rowCount !== 1) return fail("VERSION_CONFLICT");

  const event = await client.query(
    `insert into event (event_type, aggregate_id, aggregate_version, actor_ref,
       causation_id, correlation_id, schema_version, payload)
     values ($1, $2, $3, $4, $5, $5, 1, $6) returning event_id`,
    [
      `${aggregate.type}.${input.command}`,
      input.aggregateId,
      version,
      principal,
      envelope.commandId,
      {
        from: aggregate.state,
        to: transition.to,
        data: applied.event ?? envelope.payload,
      },
    ],
  );
  const eventId: string = event.rows[0].event_id;
  await client.query("insert into outbox (event_id) values ($1)", [eventId]);

  const result: CommandResult = {
    ok: true,
    state: transition.to,
    aggregateVersion: version,
    eventId,
  };
  await client.query(
    `insert into idempotency (aggregate_id, principal, command, environment,
       key, payload_hash, result)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.aggregateId,
      principal,
      input.command,
      input.environment,
      envelope.idempotencyKey,
      payloadHash,
      result,
    ],
  );
  return result;
}
