import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, test } from "vitest";
import {
  addFollowup,
  claimReport,
  decideFollowup,
  decideReport,
  saveDraft,
  submitReport,
  withdrawReport,
} from "./community";
import { migrate } from "./migrate";
import {
  createSafetyAlert,
  getShop,
  listAlerts,
  listShops,
  retractSafetyAlert,
  SHOP_CATEGORIES,
  shopCategoryCounts,
} from "./shops";
import { testPool } from "./testing";
import { newUser } from "./testkit";

const pool = await testPool();
beforeAll(async () => {
  await migrate(pool);
});
afterAll(() => pool.end());

const REASON = "Follows the publication rules.";
// Each test gets its own shop names so lists do not mix.
const shopName = (label: string) => `${label} ${randomUUID().slice(0, 8)}`;

type Fields = {
  experienceType?: string;
  rating?: number | null;
  issue?: string | null;
  shopCategory?: string;
  publicText?: string;
};
async function draft(author: string, subject: string, fields: Fields = {}) {
  return saveDraft(pool, {
    userId: author,
    subject,
    category: "Windows key",
    eventDate: "2026-08-03",
    experienceType: "positive",
    amountMinor: null,
    narrative: "Private original with all the details.",
    publicText: "The key arrived within an hour and activated.",
    ...fields,
  });
}
// Drafted, approved by its author, claimed and published by a moderator.
async function publish(
  author: string,
  moderator: string,
  subject: string,
  fields: Fields = {},
) {
  const saved = await draft(author, subject, fields);
  if (!saved.ok) throw new Error(`draft: ${saved.error}`);
  const submitted = await submitReport(pool, {
    userId: author,
    reportId: saved.reportId,
    expectedVersion: saved.version,
  });
  if (!submitted.ok) throw new Error(`submit: ${submitted.error}`);
  await claimReport(pool, { moderatorId: moderator, reportId: saved.reportId });
  const decided = await decideReport(pool, {
    moderatorId: moderator,
    reportId: saved.reportId,
    decision: "PUBLISHED",
    reason: REASON,
  });
  if (!decided.ok) throw new Error(`publish: ${decided.error}`);
  return saved.reportId;
}
const find = async (name: string) =>
  (await listShops(pool, { q: name })).find((s) => s.name === name);

test("the directory lists a shop only once it has a published experience", async () => {
  const author = await newUser(pool);
  const moderator = await newUser(pool, "moderator");
  const name = shopName("Quiet Shop");

  // A private draft, and a report waiting for a moderator, list nothing.
  const saved = await draft(author, name, { shopCategory: "software" });
  if (!saved.ok) throw new Error("draft failed");
  expect(await find(name)).toBeUndefined();
  await submitReport(pool, {
    userId: author,
    reportId: saved.reportId,
    expectedVersion: saved.version,
  });
  expect(await find(name)).toBeUndefined();

  await claimReport(pool, { moderatorId: moderator, reportId: saved.reportId });
  await decideReport(pool, {
    moderatorId: moderator,
    reportId: saved.reportId,
    decision: "PUBLISHED",
    reason: REASON,
  });
  const listed = await find(name);
  expect(listed).toMatchObject({
    name,
    category: "software",
    published: 1,
    complaints: 0,
  });

  // Withdrawn: the shop leaves the directory again.
  await withdrawReport(pool, { userId: author, reportId: saved.reportId });
  expect(await find(name)).toBeUndefined();
  expect(await getShop(pool, listed?.id as string)).toBeNull();
});

test("a private seller lookup never creates a public shop listing (D.9)", async () => {
  const name = shopName("Looked Up Only");
  await pool.query(
    "insert into subject (display_name, normalized_key) values ($1, $2)",
    [name, name.toLowerCase()],
  );
  expect(await find(name)).toBeUndefined();
});

test("a shop profile shows what was published: counts, the reviewers' own ratings, replies and resolutions", async () => {
  const moderator = await newUser(pool, "moderator");
  const name = shopName("Busy Shop");
  const [a, b, c, d] = await Promise.all([
    newUser(pool),
    newUser(pool),
    newUser(pool),
    newUser(pool),
  ]);
  await publish(a, moderator, name, { rating: 5, shopCategory: "game_topup" });
  await publish(b, moderator, name, { rating: 4 });
  const complaint = await publish(c, moderator, name, {
    experienceType: "negative",
    rating: 1,
    issue: "not_delivered",
    publicText: "I paid and nothing arrived after a week.",
  });
  const answered = await publish(d, moderator, name, {
    experienceType: "negative",
    rating: 2,
    issue: "no_refund",
    publicText: "The key was invalid and the refund took long.",
  });
  // A submitted-but-unpublished rating must not move the numbers.
  const waiting = await newUser(pool);
  const pending = await draft(waiting, name, { rating: 1 });
  if (!pending.ok) throw new Error("draft failed");
  await submitReport(pool, {
    userId: waiting,
    reportId: pending.reportId,
    expectedVersion: pending.version,
  });

  // The shop replies to one complaint; that author later reports a resolution.
  const seller = await newUser(pool);
  for (const followup of [
    {
      userId: seller,
      kind: "RESPONSE",
      body: "We refunded this order in full.",
    },
    { userId: d, kind: "RESOLUTION", body: "I received the refund yesterday." },
  ]) {
    const added = await addFollowup(pool, { ...followup, reportId: answered });
    if (!added.ok) throw new Error(`followup: ${added.error}`);
    await decideFollowup(pool, {
      moderatorId: moderator,
      followupId: added.followupId,
      publish: true,
      reason: REASON,
    });
  }

  const listed = await find(name);
  const shop = await getShop(pool, listed?.id as string);
  if (!shop) throw new Error("no shop");
  expect(shop).toMatchObject({
    name,
    // The first reporter's choice; later reports do not change it.
    category: "game_topup",
    published: 4,
    counts: { positive: 2, negative: 2, mixed: 0, neutral: 0 },
    complaints: 2,
    complaintsAnswered: 1,
    complaintsResolved: 1,
    ratingCount: 4,
    ratingAverage: 3,
  });
  expect(shop.reviews).toHaveLength(4);
  const first = shop.reviews.find((r) => r.id === complaint);
  expect(first).toMatchObject({
    experienceType: "negative",
    rating: 1,
    issue: "not_delivered",
    text: "I paid and nothing arrived after a week.",
    followups: [],
  });
  expect(
    shop.reviews.find((r) => r.id === answered)?.followups.map((f) => f.kind),
  ).toEqual(["RESPONSE", "RESOLUTION"]);

  // Public scope only: no private original, no author, and no word of
  // judgment from the platform anywhere in the data (C7.1, D.10).
  const serialized = JSON.stringify(shop);
  expect(serialized).not.toContain("Private original");
  for (const userId of [a, b, c, d, seller]) {
    expect(serialized).not.toContain(userId);
  }
  const keys = serialized.match(/"[A-Za-z]+":/g) ?? [];
  expect(keys.join(" ")).not.toMatch(/trust|score|verdict|safe|scam|risk/i);
});

test("shops can be found by part of a name and by category, and are never ranked by rating", async () => {
  const author = await newUser(pool);
  const other = await newUser(pool);
  const moderator = await newUser(pool, "moderator");
  const tag = randomUUID().slice(0, 8);
  const cards = `Gift Corner ${tag}`;
  const games = `Gamer Stop ${tag}`;
  await publish(author, moderator, cards, {
    shopCategory: "gift_cards",
    rating: 2,
  });
  await publish(author, moderator, games, {
    shopCategory: "game_accounts",
    rating: 5,
  });
  await publish(other, moderator, games, { rating: 5 });

  expect((await listShops(pool, { q: tag })).map((s) => s.name).sort()).toEqual(
    [games, cards].sort(),
  );
  // Case and surrounding spaces do not matter; a wildcard is just a character.
  expect(await listShops(pool, { q: `  GIFT corner ${tag} ` })).toHaveLength(1);
  expect(await listShops(pool, { q: `%${tag}` })).toEqual([]);
  expect(
    (await listShops(pool, { q: tag, category: "gift_cards" })).map(
      (s) => s.name,
    ),
  ).toEqual([cards]);
  expect(await listShops(pool, { q: tag, category: "nonsense" })).toEqual([]);
  // "Most experiences" is an order by how much was written, not by how good.
  expect(
    (await listShops(pool, { q: tag, sort: "most" })).map((s) => s.name),
  ).toEqual([games, cards]);
  expect(Object.keys(SHOP_CATEGORIES)).toContain("gift_cards");
  const counts = await shopCategoryCounts(pool);
  expect(counts.gift_cards).toBeGreaterThanOrEqual(1);
  expect(counts.game_accounts).toBeGreaterThanOrEqual(1);
});

test("a rating is 1 to 5, an alleged issue belongs to a complaint, and one person has one live report per shop", async () => {
  const author = await newUser(pool);
  const moderator = await newUser(pool, "moderator");
  const name = shopName("Rules Shop");
  const invalid = { ok: false, error: "VALIDATION_FAILED" };
  expect(await draft(author, name, { rating: 0 })).toEqual(invalid);
  expect(await draft(author, name, { rating: 6 })).toEqual(invalid);
  expect(await draft(author, name, { rating: 2.5 })).toEqual(invalid);
  expect(await draft(author, name, { shopCategory: "casino" })).toEqual(
    invalid,
  );
  // "They never delivered" cannot be attached to a favourable review.
  expect(await draft(author, name, { issue: "not_delivered" })).toEqual(
    invalid,
  );
  expect(
    await draft(author, name, { experienceType: "negative", issue: "made_up" }),
  ).toEqual(invalid);

  await publish(author, moderator, name, { rating: 5 });
  const second = await draft(author, name, { rating: 5 });
  if (!second.ok) throw new Error("draft failed");
  // A second glowing review of the same shop by the same person is refused.
  expect(
    await submitReport(pool, {
      userId: author,
      reportId: second.reportId,
      expectedVersion: second.version,
    }),
  ).toEqual({ ok: false, error: "DUPLICATE_REPORT" });
  expect((await find(name))?.published).toBe(1);
});

test("alerts show published complaints as allegations, and moderators' own warnings, until withdrawn or retracted", async () => {
  const author = await newUser(pool);
  const moderator = await newUser(pool, "moderator");
  const name = shopName("Alert Shop");
  const praise = await publish(await newUser(pool), moderator, name, {
    rating: 5,
  });
  const complaint = await publish(author, moderator, name, {
    experienceType: "negative",
    issue: "blocked_after_payment",
    publicText: "After I paid, the page blocked me.",
  });

  const mine = async () =>
    (await listAlerts(pool, { limit: 200 })).reports.filter(
      (r) => r.shopName === name,
    );
  expect(await mine()).toMatchObject([
    {
      id: complaint,
      issue: "blocked_after_payment",
      text: "After I paid, the page blocked me.",
      answered: false,
    },
  ]);
  // A favourable review is not an alert.
  expect((await mine()).some((r) => r.id === praise)).toBe(false);
  await withdrawReport(pool, { userId: author, reportId: complaint });
  expect(await mine()).toEqual([]);

  // General warnings come from moderators only, signed and retractable.
  const title = `Advance payment pattern ${randomUUID().slice(0, 6)}`;
  const body =
    "Several reports describe pages asking for full payment to a personal number before showing the product.";
  expect(
    await createSafetyAlert(pool, { userId: author, title, body }),
  ).toEqual({ ok: false, error: "NOT_AUTHORIZED" });
  expect(
    await createSafetyAlert(pool, { userId: moderator, title: "x", body }),
  ).toEqual({ ok: false, error: "VALIDATION_FAILED" });
  expect(
    await createSafetyAlert(pool, {
      userId: moderator,
      title,
      body: "Call 01712345678 for help if a page asks you for payment in advance.",
    }),
  ).toEqual({ ok: false, error: "SECRET_SUSPECTED" });
  const created = await createSafetyAlert(pool, {
    userId: moderator,
    title,
    body,
  });
  if (!created.ok) throw new Error("alert failed");
  const notes = async () =>
    (await listAlerts(pool, { limit: 200 })).notes.filter(
      (n) => n.title === title,
    );
  expect(await notes()).toMatchObject([{ id: created.alertId, body }]);
  expect(JSON.stringify(await notes())).not.toContain(moderator);
  expect(
    await retractSafetyAlert(pool, {
      userId: author,
      alertId: created.alertId,
    }),
  ).toEqual({ ok: false, error: "NOT_AUTHORIZED" });
  expect(
    await retractSafetyAlert(pool, {
      userId: moderator,
      alertId: created.alertId,
    }),
  ).toEqual({ ok: true });
  expect(await notes()).toEqual([]);
});
