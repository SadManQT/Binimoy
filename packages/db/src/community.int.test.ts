import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, test } from "vitest";
import { grantStaffRole } from "./access";
import {
  addFollowup,
  appealReport,
  claimReport,
  decideFollowup,
  decideReport,
  getReport,
  listPublished,
  moderationQueue,
  SUBMISSION_DAILY_BUDGET,
  saveDraft,
  submitReport,
  withdrawReport,
} from "./community";
import { migrate } from "./migrate";
import { testPool } from "./testing";

const pool = await testPool();
beforeAll(async () => {
  await migrate(pool);
});
afterAll(() => pool.end());

async function newUser(role?: "moderator"): Promise<string> {
  const { rows } = await pool.query(
    "insert into app_user (name, email) values ('Person', $1) returning id",
    [`u-${randomUUID()}@example.test`],
  );
  const userId: string = rows[0].id;
  if (role) {
    await grantStaffRole(pool, {
      userId,
      role,
      grantedBy: userId,
      reason: "test",
    });
  }
  return userId;
}

const NARRATIVE =
  "I paid 2500 taka by bKash to 01712345678 on 3 August and got nothing.";
const PUBLIC = "I paid 2500 taka on 3 August and did not receive the license.";

// Each test uses its own shop name so published lists do not mix.
const shop = () => `Shop ${randomUUID().slice(0, 8)}`;

async function draft(
  userId: string,
  fields: Partial<Parameters<typeof saveDraft>[1]> = {},
) {
  const saved = await saveDraft(pool, {
    userId,
    subject: shop(),
    category: "software_license",
    eventDate: "2026-08-03",
    experienceType: "negative",
    amountMinor: "250000",
    narrative: NARRATIVE,
    publicText: PUBLIC,
    ...fields,
  });
  if (!saved.ok) throw new Error(`draft failed: ${saved.error}`);
  return saved;
}
async function submitted(author: string) {
  const d = await draft(author);
  expect(
    await submitReport(pool, {
      userId: author,
      reportId: d.reportId,
      expectedVersion: d.version,
    }),
  ).toEqual({ ok: true });
  return d.reportId;
}
async function published(author: string, moderator: string) {
  const reportId = await submitted(author);
  await claimReport(pool, { moderatorId: moderator, reportId });
  expect(
    await decideReport(pool, {
      moderatorId: moderator,
      reportId,
      decision: "PUBLISHED",
      reason: "Follows the publication rules; identifiers removed.",
    }),
  ).toEqual({ ok: true });
  return reportId;
}
const view = (userId: string, reportId: string) =>
  getReport(pool, { userId, reportId });

test("a draft is private, may be incomplete, and is submitted only as the author last saw it", async () => {
  const author = await newUser();
  const moderator = await newUser("moderator");
  const stranger = await newUser();

  // C9.1: an incomplete report is allowed as a private draft.
  const d = await draft(author, { narrative: "", publicText: "" });
  expect(await view(stranger, d.reportId)).toBeNull();
  expect(await view(moderator, d.reportId)).toBeNull();
  expect(await view(author, d.reportId)).toMatchObject({
    role: "author",
    state: "DRAFT",
  });
  // ...but cannot be submitted.
  const submit = (userId: string, expectedVersion: number) =>
    submitReport(pool, { userId, reportId: d.reportId, expectedVersion });
  expect(await submit(author, d.version)).toEqual({
    ok: false,
    error: "VALIDATION_FAILED",
  });

  const edited = await saveDraft(pool, {
    userId: author,
    reportId: d.reportId,
    subject: "ignored on update",
    category: "software_license",
    eventDate: null,
    experienceType: "negative",
    amountMinor: null,
    narrative: NARRATIVE,
    publicText: PUBLIC,
  });
  if (!edited.ok) throw new Error("edit failed");
  expect(edited.version).toBe(d.version + 1);
  expect(await submit(stranger, edited.version)).toEqual({
    ok: false,
    error: "NOT_AUTHORIZED",
  });
  // D.10: approval is of the final text. A stale preview cannot be submitted.
  expect(await submit(author, d.version)).toEqual({
    ok: false,
    error: "VERSION_CONFLICT",
  });
  expect(await submit(author, edited.version)).toEqual({ ok: true });
  // Once submitted it cannot be edited or submitted again.
  expect(await submit(author, edited.version)).toEqual({
    ok: false,
    error: "ILLEGAL_TRANSITION",
  });
  // Submitted is not published.
  expect(await view(stranger, d.reportId)).toBeNull();
});

test("C9.2: text meant for the public may not carry phone numbers, emails or payment identifiers", async () => {
  const author = await newUser();
  for (const publicText of [
    "I sent money to 01712345678 and got nothing.",
    "Sent to +880 1712-345678, no delivery.",
    "His email is someone@example.com.",
    "Card 4111 1111 1111 1111 was charged.",
  ]) {
    expect(
      await saveDraft(pool, {
        userId: author,
        subject: shop(),
        category: "software_license",
        eventDate: null,
        experienceType: "negative",
        amountMinor: null,
        narrative: NARRATIVE,
        publicText,
      }),
      publicText,
    ).toEqual({ ok: false, error: "SECRET_SUSPECTED" });
  }
  // The private original may keep them; an amount and a date are fine.
  expect((await draft(author)).ok).toBe(true);
});

test("nothing is public until a moderator, who is not the author, publishes it with a reason", async () => {
  const author = await newUser("moderator");
  const moderator = await newUser("moderator");
  const other = await newUser("moderator");
  const stranger = await newUser();
  const reportId = await submitted(author);

  expect(await moderationQueue(pool, stranger)).toBeNull();
  expect(await claimReport(pool, { moderatorId: stranger, reportId })).toEqual({
    ok: false,
    error: "NOT_AUTHORIZED",
  });
  // A moderator does not handle their own report, and does not see it queued.
  expect(await claimReport(pool, { moderatorId: author, reportId })).toEqual({
    ok: false,
    error: "NOT_AUTHORIZED",
  });
  const own = await moderationQueue(pool, author);
  expect(own?.reports.some((r) => r.id === reportId)).toBe(false);
  const queue = await moderationQueue(pool, moderator);
  expect(queue?.reports.find((r) => r.id === reportId)).toMatchObject({
    state: "SUBMITTED",
    mine: false,
  });

  const decide = (moderatorId: string, reason: string) =>
    decideReport(pool, {
      moderatorId,
      reportId,
      decision: "PUBLISHED",
      reason,
    });
  // Not before it is claimed, not by someone else, not without a reason.
  expect(await decide(moderator, "Follows the publication rules.")).toEqual({
    ok: false,
    error: "NOT_AUTHORIZED",
  });
  expect(await claimReport(pool, { moderatorId: moderator, reportId })).toEqual(
    { ok: true },
  );
  expect(await claimReport(pool, { moderatorId: other, reportId })).toEqual({
    ok: false,
    error: "ILLEGAL_TRANSITION",
  });
  expect(await decide(other, "Follows the publication rules.")).toEqual({
    ok: false,
    error: "NOT_AUTHORIZED",
  });
  expect(await decide(moderator, "ok")).toEqual({
    ok: false,
    error: "VALIDATION_FAILED",
  });
  // The assigned moderator sees the private original; other moderators do not.
  expect((await view(moderator, reportId))?.narrative).toBe(NARRATIVE);
  expect((await view(other, reportId))?.narrative).toBeUndefined();
  expect(await view(stranger, reportId)).toBeNull();

  expect(await decide(moderator, "Follows the publication rules.")).toEqual({
    ok: true,
  });
  const seen = await view(stranger, reportId);
  expect(seen).toMatchObject({
    role: "public",
    state: "PUBLISHED",
    publicText: PUBLIC,
    experienceType: "negative",
  });
  // The public sees neither the original, the amount, nor who wrote it.
  const serialized = JSON.stringify(seen);
  expect(serialized).not.toContain("01712345678");
  expect(serialized).not.toContain(author);
  expect(seen?.narrative).toBeUndefined();
  expect(seen?.history).toEqual([]);
  // C9.4: a 72-hour response window from publication.
  const due = Date.parse(seen?.responseDueAt as string);
  const at = Date.parse(seen?.publishedAt as string);
  expect(due - at).toBe(72 * 3600 * 1000);
  // The author sees the decision and its reason.
  expect((await view(author, reportId))?.history.at(-1)).toMatchObject({
    kind: "PUBLISHED",
    reason: "Follows the publication rules.",
  });
});

test("a moderator can ask for more; the author edits and submits again", async () => {
  const author = await newUser();
  const moderator = await newUser("moderator");
  const reportId = await submitted(author);
  await claimReport(pool, { moderatorId: moderator, reportId });
  expect(
    await decideReport(pool, {
      moderatorId: moderator,
      reportId,
      decision: "NEEDS_INFORMATION",
      reason: "Please say which product was ordered.",
    }),
  ).toEqual({ ok: true });
  const mine = await view(author, reportId);
  expect(mine).toMatchObject({ state: "NEEDS_INFORMATION" });
  const edited = await saveDraft(pool, {
    userId: author,
    reportId,
    subject: "",
    category: "software_license",
    eventDate: null,
    experienceType: "negative",
    amountMinor: null,
    narrative: NARRATIVE,
    publicText: `${PUBLIC} It was a Windows key.`,
  });
  if (!edited.ok) throw new Error("edit failed");
  expect(
    await submitReport(pool, {
      userId: author,
      reportId,
      expectedVersion: edited.version,
    }),
  ).toEqual({ ok: true });
  expect((await view(author, reportId))?.state).toBe("SUBMITTED");
});

test("C9.4: a refusal can be appealed within seven days and goes to a different moderator", async () => {
  const author = await newUser();
  const first = await newUser("moderator");
  const second = await newUser("moderator");
  const refuse = async (moderatorId: string) => {
    const reportId = await submitted(author);
    await claimReport(pool, { moderatorId, reportId });
    await decideReport(pool, {
      moderatorId,
      reportId,
      decision: "NOT_PUBLISHED",
      reason: "Names a private individual without any detail.",
    });
    return reportId;
  };

  const reportId = await refuse(first);
  const appeal = (userId: string, id = reportId) =>
    appealReport(pool, {
      userId,
      reportId: id,
      reason: "The shop is a business page, not a private person.",
    });
  expect(await appeal(second)).toEqual({ ok: false, error: "NOT_AUTHORIZED" });
  expect(await appeal(author)).toEqual({ ok: true });
  expect((await view(author, reportId))?.state).toBe("SUBMITTED");
  expect(await claimReport(pool, { moderatorId: first, reportId })).toEqual({
    ok: false,
    error: "NOT_AUTHORIZED",
  });
  expect(await claimReport(pool, { moderatorId: second, reportId })).toEqual({
    ok: true,
  });

  const late = await refuse(first);
  await pool.query(
    "update community_report set decided_at = now() - interval '8 days' where id = $1",
    [late],
  );
  expect(await appeal(author, late)).toEqual({
    ok: false,
    error: "APPEAL_WINDOW_CLOSED",
  });
});

test("responses and updates are moderated, labelled by who wrote them, and never replace the report", async () => {
  const author = await newUser();
  const moderator = await newUser("moderator");
  const seller = await newUser();
  const reader = await newUser();
  const reportId = await published(author, moderator);

  const reply = await addFollowup(pool, {
    userId: seller,
    reportId,
    kind: "RESPONSE",
    body: "We refunded this order in full on 12 August.",
  });
  if (!reply.ok) throw new Error("reply failed");
  // Only the author of the report may post a correction or a resolution.
  expect(
    await addFollowup(pool, {
      userId: seller,
      reportId,
      kind: "RESOLUTION",
      body: "The buyer has been refunded.",
    }),
  ).toEqual({ ok: false, error: "NOT_AUTHORIZED" });
  expect(
    await addFollowup(pool, {
      userId: seller,
      reportId,
      kind: "RESPONSE",
      body: "Call me on 01712345678.",
    }),
  ).toEqual({ ok: false, error: "SECRET_SUSPECTED" });

  // Pending: the writer sees it, readers do not.
  expect((await view(reader, reportId))?.followups).toEqual([]);
  expect((await view(seller, reportId))?.followups).toMatchObject([
    { kind: "RESPONSE", status: "PENDING", mine: true },
  ]);
  const queue = await moderationQueue(pool, moderator);
  expect(queue?.followups.some((f) => f.id === reply.followupId)).toBe(true);
  // Not the writer, and not without a reason.
  expect(
    await decideFollowup(pool, {
      moderatorId: seller,
      followupId: reply.followupId,
      publish: true,
      reason: "Follows the publication rules.",
    }),
  ).toEqual({ ok: false, error: "NOT_AUTHORIZED" });
  expect(
    await decideFollowup(pool, {
      moderatorId: moderator,
      followupId: reply.followupId,
      publish: true,
      reason: "Follows the publication rules.",
    }),
  ).toEqual({ ok: true });

  const resolution = await addFollowup(pool, {
    userId: author,
    reportId,
    kind: "RESOLUTION",
    body: "I received the refund on 13 August.",
  });
  if (!resolution.ok) throw new Error("resolution failed");
  await decideFollowup(pool, {
    moderatorId: moderator,
    followupId: resolution.followupId,
    publish: true,
    reason: "Follows the publication rules.",
  });

  const seen = await view(reader, reportId);
  // A refund does not erase the historical complaint.
  expect(seen).toMatchObject({ state: "PUBLISHED", publicText: PUBLIC });
  expect(seen?.followups).toMatchObject([
    // Nobody checked that this person controls the shop's page.
    { kind: "RESPONSE", status: "PUBLISHED", byAuthor: false },
    { kind: "RESOLUTION", status: "PUBLISHED", byAuthor: true },
  ]);
  expect(JSON.stringify(seen)).not.toContain(seller);
});

test("withdrawal removes the text from public view and keeps the history", async () => {
  const author = await newUser();
  const moderator = await newUser("moderator");
  const reader = await newUser();
  const reportId = await published(author, moderator);
  const subject = (await view(reader, reportId))?.subject as string;
  expect(await listPublished(pool, subject)).toMatchObject([{ id: reportId }]);

  expect(await withdrawReport(pool, { userId: reader, reportId })).toEqual({
    ok: false,
    error: "NOT_AUTHORIZED",
  });
  expect(await withdrawReport(pool, { userId: author, reportId })).toEqual({
    ok: true,
  });
  // A stub remains, so a link that worked yesterday explains itself today.
  expect(await view(reader, reportId)).toMatchObject({
    state: "WITHDRAWN",
    publicText: null,
  });
  expect(await listPublished(pool, subject)).toEqual([]);
  expect(
    (await view(author, reportId))?.history.map((event) => event.kind),
  ).toEqual(["SUBMITTED", "CLAIMED", "PUBLISHED", "WITHDRAWN"]);

  // A report that was never public leaves no stub.
  const quiet = await submitted(author);
  await withdrawReport(pool, { userId: author, reportId: quiet });
  expect(await view(reader, quiet)).toBeNull();
});

test("submissions per author per day are bounded", async () => {
  const author = await newUser();
  const d = await draft(author);
  await pool.query(
    `insert into community_report_event (report_id, actor_id, kind)
     select $1, $2, 'SUBMITTED' from generate_series(1, $3)`,
    [d.reportId, author, SUBMISSION_DAILY_BUDGET],
  );
  expect(
    await submitReport(pool, {
      userId: author,
      reportId: d.reportId,
      expectedVersion: d.version,
    }),
  ).toEqual({ ok: false, error: "BUDGET_EXHAUSTED" });
});
