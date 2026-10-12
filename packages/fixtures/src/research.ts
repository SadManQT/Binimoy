// Synthetic public pages for research in RESEARCH_MODE=fixture. Every shop,
// person and post here is invented. Nothing in this file says how a page
// should be classified: the pipeline has to work that out from the text, the
// way it would for a real page (spec B13: no ground truth leaks).

export type FixturePage = {
  url: string;
  title: string;
  snippet: string;
  // What a fetch of the page returns. Null when the page cannot be read.
  body: string | null;
  access: "FULL_TEXT" | "PARTIAL_TEXT" | "LOGIN_WALL" | "UNAVAILABLE";
  publishedAt: string | null;
  // Who the page shows as its author, when it shows that at all.
  author: "customer" | "seller" | "publisher" | null;
};

export const FIXTURE_PAGES: FixturePage[] = [
  {
    url: "https://www.facebook.com/groups/bdtechbuyers/posts/1001",
    title: "Windows key from Tech Bazar BD",
    snippet:
      "Ordered a Windows key from Tech Bazar BD. Received the license in an hour...",
    body: "Ordered a Windows key from Tech Bazar BD. Received the license in an hour, works fine. Recommended.",
    access: "FULL_TEXT",
    publishedAt: "2026-08-02T10:00:00Z",
    author: "customer",
  },
  {
    // The same post shared into another group.
    url: "https://www.facebook.com/groups/dhakadeals/posts/2002",
    title: "Shared: Windows key from Tech Bazar BD",
    snippet:
      "Ordered a Windows key from Tech Bazar BD. Received the license...",
    body: "Ordered a Windows key from Tech Bazar BD!! Received the license in an hour, works fine. Recommended 👍",
    access: "FULL_TEXT",
    publishedAt: "2026-08-03T09:00:00Z",
    author: "customer",
  },
  {
    url: "https://www.reddit.com/r/bangladesh/comments/abc123/tech_bazar_bd_never_delivered",
    title: "Tech Bazar BD never delivered",
    snippet: "Paid 2500 taka to Tech Bazar BD, never received anything...",
    body: "Paid 2500 taka to Tech Bazar BD, never received anything. Not received even after a week.",
    access: "FULL_TEXT",
    publishedAt: "2026-08-10T15:30:00Z",
    author: "customer",
  },
  {
    url: "https://www.facebook.com/techbazarbd/posts/3003",
    title: "Tech Bazar BD replies",
    snippet: "Tech Bazar BD here. We have refunded this order in full.",
    body: "Tech Bazar BD here. We have refunded this order in full.",
    access: "FULL_TEXT",
    publishedAt: "2026-08-12T08:00:00Z",
    author: "seller",
  },
  {
    url: "https://www.reddit.com/r/bangladesh/comments/abc123/tech_bazar_bd_never_delivered/update",
    title: "Update: Tech Bazar BD",
    snippet: "Update on Tech Bazar BD: they refunded me yesterday...",
    body: "Update on Tech Bazar BD: they refunded me yesterday, issue resolved.",
    access: "FULL_TEXT",
    publishedAt: "2026-08-13T11:00:00Z",
    author: "customer",
  },
  {
    url: "https://www.facebook.com/groups/bdtechbuyers/posts/1004",
    title: "Was worried about Tech Bazar BD",
    snippet: "I thought Tech Bazar BD was a scam, but...",
    body: "I thought Tech Bazar BD was a scam, but I received the item the next day.",
    access: "FULL_TEXT",
    publishedAt: "2026-07-21T19:00:00Z",
    author: "customer",
  },
  {
    url: "https://www.facebook.com/groups/bdtechbuyers/posts/1005",
    title: "Tech Bazar BD অভিজ্ঞতা",
    snippet: "Tech Bazar BD কে টাকা দিয়েছি কিন্তু...",
    body: "Tech Bazar BD কে টাকা দিয়েছি কিন্তু পণ্য পাইনি",
    access: "FULL_TEXT",
    publishedAt: "2026-09-01T06:00:00Z",
    author: "customer",
  },
  {
    url: "https://www.facebook.com/techbazarbd/posts/3009",
    title: "Tech Bazar BD flash sale",
    snippet: "Flash sale at Tech Bazar BD! 50% off...",
    body: "Flash sale at Tech Bazar BD! 50% off all licenses, order now.",
    access: "FULL_TEXT",
    publishedAt: "2026-09-05T06:00:00Z",
    author: "seller",
  },
  {
    url: "https://news.example.bd/business/ecommerce-directory",
    title: "New e-commerce directory lists 200 shops",
    snippet: "Tech Bazar BD was among the shops listed in the new directory.",
    body: "Tech Bazar BD was among the shops listed in the new e-commerce directory published this week.",
    access: "FULL_TEXT",
    publishedAt: "2026-06-15T04:00:00Z",
    author: "publisher",
  },
  {
    // A different shop with a similar name.
    url: "https://www.facebook.com/groups/ctgbuyers/posts/5005",
    title: "Tech Bazar Chittagong",
    snippet:
      "Tech Bazar Chittagong is a different shop, got my laptop from them.",
    body: "Tech Bazar Chittagong is a different shop, got my laptop from them. Works well.",
    access: "FULL_TEXT",
    publishedAt: "2026-05-01T04:00:00Z",
    author: "customer",
  },
  {
    // A private-group post: the search engine indexed a snippet, but the page
    // itself shows a login wall.
    url: "https://www.facebook.com/groups/privatebuyers/posts/7007",
    title: "Tech Bazar BD theke key",
    snippet: "Tech Bazar BD theke key kinechi, kintu...",
    body: null,
    access: "LOGIN_WALL",
    publishedAt: null,
    author: null,
  },
  {
    url: "https://oldforum.example.bd/thread/tech-bazar-bd-review",
    title: "Tech Bazar BD review thread",
    snippet: "Has anyone bought from Tech Bazar BD?",
    body: null,
    access: "UNAVAILABLE",
    publishedAt: null,
    author: null,
  },
];
