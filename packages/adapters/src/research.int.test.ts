import { randomUUID } from "node:crypto";
import { migrate } from "@lp/db/migrate";
import { testPool } from "@lp/db/testing";
import { CANDIDATE_BUDGET, QUERY_BUDGET } from "@lp/domain";
import { afterAll, beforeAll, expect, test } from "vitest";
import {
  fixtureRetriever,
  fixtureSearchProvider,
  getCollection,
  listCollections,
  RESEARCH_DAILY_BUDGET,
  type Retriever,
  runResearch,
  type SearchProvider,
  setCardMatch,
} from "./research";

const pool = await testPool();
beforeAll(async () => {
  await migrate(pool);
});
afterAll(() => pool.end());

async function newUser(): Promise<string> {
  const { rows } = await pool.query(
    "insert into app_user (name, email) values ('Researcher', $1) returning id",
    [`u-${randomUUID()}@example.test`],
  );
  return rows[0].id;
}

async function research(
  userId: string,
  subjectInput: string,
  search: SearchProvider = fixtureSearchProvider(),
  retrieve: Retriever = fixtureRetriever(),
) {
  const result = await runResearch(pool, {
    userId,
    subjectInput,
    search,
    retrieve,
  });
  if (!result.ok) throw new Error(`research failed: ${result.error}`);
  const view = await getCollection(pool, {
    userId,
    collectionId: result.collectionId,
  });
  if (!view) throw new Error("no access to own collection");
  return view;
}

const nothingReadable: Retriever = {
  async fetch() {
    return {
      access: "UNAVAILABLE",
      body: null,
      publishedAt: null,
      author: null,
    };
  },
};

test("C7.8: the seeded cases are found, sorted by what their author reports, and cited", async () => {
  const user = await newUser();
  const view = await research(user, "  Tech Bazar BD ");

  expect(view.subject).toBe("Tech Bazar BD");
  expect(view.status).toBe("DONE");
  expect(view.coverage.queries).toHaveLength(QUERY_BUDGET);
  expect(view.coverage.providers).toEqual(["fixture"]);

  const card = (fragment: string) => {
    const found = view.cards.filter((c) => c.url.endsWith(fragment));
    expect(found, fragment).toHaveLength(1);
    return found[0] as (typeof view.cards)[number];
  };

  expect(card("posts/1001")).toMatchObject({
    contentType: "customer_experience",
    reportType: "positive",
    accessStatus: "FULL_TEXT",
    subjectMatch: "exact",
    provider: "fixture",
    publishedAt: "2026-08-02T10:00:00.000Z",
  });
  expect(card("never_delivered").reportType).toBe("negative");
  expect(card("posts/1005").reportType).toBe("negative");
  expect(card("posts/1004").reportType).toBe("mixed");
  expect(card("/update").reportType).toBe("resolution");
  expect(card("posts/3003")).toMatchObject({
    contentType: "seller_response",
    reportType: "response",
  });
  expect(card("posts/3009").contentType).toBe("advertisement");
  expect(card("ecommerce-directory").contentType).toBe("news");

  // Every summary is the source's own words, with its link.
  const complaint = card("never_delivered");
  expect(complaint.summary).toContain("never received anything");
  expect(complaint.url).toBe(
    "https://reddit.com/r/bangladesh/comments/abc123/tech_bazar_bd_never_delivered",
  );
});

test("the same page reached by different links is one card; a reposted text is one group", async () => {
  const view = await research(await newUser(), "Tech Bazar BD");
  // The fixture search returns Facebook links both plain and as mobile links
  // with tracking parameters.
  const urls = view.cards.map((card) => card.url);
  expect(new Set(urls).size).toBe(urls.length);
  expect(urls.some((u) => u.includes("fbclid") || u.includes("//m."))).toBe(
    false,
  );

  const original = view.cards.find((c) => c.url.includes("posts/1001"));
  const repost = view.cards.find((c) => c.url.includes("posts/2002"));
  expect(original?.duplicateGroup).toBeTruthy();
  expect(repost?.duplicateGroup).toBe(original?.duplicateGroup);
  // C7.5: a repost is not a second experience.
  expect(view.counts).toEqual({
    positive: 1,
    negative: 2,
    mixed: 1,
    neutral: 0,
    resolution: 1,
  });
});

test("C7.2: a similar name is possibly related, outside the counts, until the user says otherwise", async () => {
  const user = await newUser();
  const view = await research(user, "Tech Bazar BD");
  const other = view.cards.find((c) => c.url.includes("ctgbuyers"));
  expect(other?.subjectMatch).toBe("ambiguous");
  expect(view.counts.positive).toBe(1);

  // The user can correct the match; counts follow because they are computed
  // from the cards, never stored.
  const stranger = await newUser();
  const cardId = other?.id as string;
  expect(
    await setCardMatch(pool, { userId: stranger, cardId, match: "exact" }),
  ).toBe(false);
  expect(
    await setCardMatch(pool, { userId: user, cardId, match: "exact" }),
  ).toBe(true);
  const corrected = await getCollection(pool, {
    userId: user,
    collectionId: view.id,
  });
  expect(corrected?.counts.positive).toBe(2);
});

test("C7.7: a page that could not be read is a link with a snippet, never a report", async () => {
  const view = await research(await newUser(), "Tech Bazar BD");
  const walled = view.cards.find((c) => c.url.includes("privatebuyers"));
  expect(walled).toMatchObject({
    accessStatus: "SNIPPET_ONLY",
    contentType: null,
    reportType: null,
    summary: null,
    publishedAt: null,
    duplicateGroup: null,
  });
  expect(walled?.snippet).toContain("Tech Bazar BD theke key");
  const gone = view.cards.find((c) => c.url.includes("oldforum"));
  expect(gone).toMatchObject({ accessStatus: "UNAVAILABLE", reportType: null });
  expect(view.coverage.notRetrieved).toBe(2);
});

test("no results is stated with where and when the search ran", async () => {
  const view = await research(await newUser(), "Nonexistent Shop 4471");
  expect(view.status).toBe("DONE");
  expect(view.cards).toEqual([]);
  expect(view.coverage.queries).toHaveLength(QUERY_BUDGET);
  expect(view.coverage.providers).toEqual(["fixture"]);
  expect(Date.parse(view.coverage.searchedAt)).not.toBeNaN();
});

test("a failing search provider gives partial coverage, or a failed search, never invented results", async () => {
  const real = fixtureSearchProvider();
  let call = 0;
  const flaky: SearchProvider = {
    name: "fixture",
    async search(query) {
      call += 1;
      if (call % 2 === 0) throw new Error("429 from provider");
      return real.search(query);
    },
  };
  const partial = await research(await newUser(), "Tech Bazar BD", flaky);
  expect(partial.status).toBe("PARTIAL");
  expect(partial.coverage.queries.filter((q) => !q.ok)).toHaveLength(
    QUERY_BUDGET / 2,
  );
  expect(partial.cards.length).toBeGreaterThan(0);
  // The provider's error text is not stored or shown.
  expect(JSON.stringify(partial)).not.toContain("429");

  const down: SearchProvider = {
    name: "scripted",
    async search() {
      throw new Error("down");
    },
  };
  const failed = await research(await newUser(), "Tech Bazar BD", down);
  expect(failed.status).toBe("FAILED");
  expect(failed.cards).toEqual([]);
});

test("C34.2: at most thirty candidates are kept, and the cut is reported", async () => {
  const many: SearchProvider = {
    name: "scripted",
    async search(query) {
      return {
        results: Array.from({ length: 50 }, (_, i) => ({
          url: `https://example.test/post/${i}`,
          title: `Big Shop post ${i}`,
          snippet: `${query} ${i}`,
        })),
      };
    },
  };
  const view = await research(
    await newUser(),
    "Big Shop",
    many,
    nothingReadable,
  );
  expect(view.cards).toHaveLength(CANDIDATE_BUDGET);
  expect(view.status).toBe("PARTIAL");
  expect(view.coverage.truncated).toBe(true);
});

test("D.9: only plain public web links are kept, and a login page is not the post", async () => {
  const hostile: SearchProvider = {
    name: "scripted",
    async search() {
      return {
        results: [
          "javascript:alert(1)",
          "file:///etc/passwd",
          "https://user:pass@example.test/odd",
          "https://example.test/odd-shop",
        ].map((url) => ({ url, title: "Odd Shop", snippet: "Odd Shop" })),
      };
    },
  };
  const fetched: string[] = [];
  const wall: Retriever = {
    async fetch(url) {
      fetched.push(url);
      // A 200 response whose body is a login form.
      return {
        access: "LOGIN_WALL",
        body: "Log in to continue. Odd Shop is a scam.",
        publishedAt: "2026-01-01T00:00:00Z",
        author: "customer",
      };
    },
  };
  const view = await research(await newUser(), "Odd Shop", hostile, wall);
  expect(fetched).toEqual(["https://example.test/odd-shop"]);
  expect(view.cards).toHaveLength(1);
  expect(view.cards[0]).toMatchObject({
    accessStatus: "SNIPPET_ONLY",
    reportType: null,
    summary: null,
    publishedAt: null,
  });
  expect(JSON.stringify(view)).not.toContain("Log in to continue");
});

test("a collection is private to the user who ran it, and carries no score or verdict", async () => {
  const owner = await newUser();
  const view = await research(owner, "Tech Bazar BD");
  const stranger = await newUser();
  expect(
    await getCollection(pool, { userId: stranger, collectionId: view.id }),
  ).toBeNull();
  expect(await listCollections(pool, stranger)).toEqual([]);
  expect(await listCollections(pool, owner)).toMatchObject([
    { id: view.id, subject: "Tech Bazar BD", status: "DONE" },
  ]);

  const keys = JSON.stringify(view).match(/"[A-Za-z]+":/g) ?? [];
  expect(keys.join(" ")).not.toMatch(/score|verdict|rating|trust|safe|risk/i);
});

test("input is validated and research per user per day is bounded (B15)", async () => {
  const user = await newUser();
  const run = (subjectInput: string) =>
    runResearch(pool, {
      userId: user,
      subjectInput,
      search: fixtureSearchProvider(),
      retrieve: fixtureRetriever(),
    });
  expect(await run(" a ")).toEqual({ ok: false, error: "VALIDATION_FAILED" });
  expect(await run("x".repeat(121))).toEqual({
    ok: false,
    error: "VALIDATION_FAILED",
  });
  const { rows } = await pool.query(
    "insert into subject (display_name, normalized_key) values ($1, $1) returning id",
    [`budget-${randomUUID()}`],
  );
  await pool.query(
    `insert into research_collection (user_id, subject_id, status)
     select $1, $2, 'DONE' from generate_series(1, $3)`,
    [user, rows[0].id, RESEARCH_DAILY_BUDGET],
  );
  expect(await run("Tech Bazar BD")).toEqual({
    ok: false,
    error: "BUDGET_EXHAUSTED",
  });
});
