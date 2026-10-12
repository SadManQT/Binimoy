import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { click, signUp } from "./helpers";

test("a complaint about a shop reaches the directory, the shop's page and the alerts only after moderation, as an allegation", async ({
  browser,
}) => {
  const { page: author } = await signUp(browser, "Author");
  const { page: moderator, email } = await signUp(browser, "Moderator");
  execFileSync("pnpm", ["staff", "grant", email, "moderator", "e2e test"], {
    stdio: "pipe",
  });
  // Shop pages are public: this visitor never signs in.
  const visitor = await (await browser.newContext()).newPage();
  const shop = `E2E Key Shop ${Date.now()}`;
  const find = `/shops?q=${encodeURIComponent(shop)}`;

  // Written from a shop search that found nothing: the name carries over.
  await visitor.goto(find);
  await expect(visitor.getByTestId("no-shops")).toContainText(
    "ভালো বা খারাপ, কোনোটাই না",
  );
  await author.goto(`/community?subject=${encodeURIComponent(shop)}`);
  await expect(author.locator('input[name="subject"]')).toHaveValue(shop);
  await author.locator('select[name="shopCategory"]').selectOption("software");
  await click(author, "ড্রাফট শুরু করুন");
  await author.waitForURL("**/community/*-*");
  const reportUrl = author.url();
  await author
    .locator('select[name="experienceType"]')
    .selectOption("negative");
  await author.locator('select[name="rating"]').selectOption("1");
  await author.locator('select[name="issue"]').selectOption("not_delivered");
  await author
    .locator('textarea[name="narrative"]')
    .fill("Paid on the 3rd, order ref in my notes, nothing arrived.");
  await author
    .locator('textarea[name="publicText"]')
    .fill("I paid and the key never arrived.");
  await click(author, "ড্রাফট সংরক্ষণ করুন");
  await author.locator('input[name="approved"]').check();
  await click(author, "মডারেটরের কাছে জমা দিন");

  // Submitted is not listed anywhere public.
  await visitor.goto(find);
  await expect(visitor.getByTestId("no-shops")).toBeVisible();

  await moderator.goto("/moderation");
  await click(moderator, `দায়িত্ব নিন: ${shop}`);
  await moderator.locator('select[name="decision"]').selectOption("PUBLISHED");
  await moderator
    .locator('input[name="reason"]')
    .fill("Follows the publication rules.");
  await click(moderator, "সিদ্ধান্ত দিন");

  // The directory finds it by part of the name, under its category.
  await visitor.goto(`/shops?q=${encodeURIComponent(shop.slice(4))}`);
  const row = visitor.getByTestId("shops").locator("li", { hasText: shop });
  await expect(row).toContainText("সফটওয়্যার ও লাইসেন্স");
  await expect(row).toContainText("১টি রিপোর্ট");
  await row.getByRole("link", { name: shop }).click();

  // The shop's page: counts and the reviewer's own rating, never a verdict.
  // One review is not enough for a trust signal, and the page says so.
  await expect(visitor.getByTestId("trust-panel")).toContainText("ডেটা কম");
  await expect(visitor.getByTestId("trust-panel")).toContainText(
    "কেউ তদন্ত করেনি",
  );
  const evidence = visitor.getByTestId("shop-evidence");
  await expect(evidence).toContainText("স্ক্যাম রিপোর্ট");
  await expect(visitor.getByTestId("not-a-verdict")).toContainText(
    "ভেরিফাই করেনি",
  );
  const review = visitor.getByTestId("reviews").locator("li").first();
  await expect(review).toContainText("টাকা নিয়ে প্রোডাক্ট দেয়নি");
  await expect(review).toContainText("ভেরিফাই করা হয়নি");
  await expect(review).toContainText("১ / ৫");
  await expect(review).toContainText("I paid and the key never arrived.");
  // The private original stays private.
  await expect(visitor.locator("main")).not.toContainText("order ref");
  const shopUrl = visitor.url();

  // Alerts: listed as the author's allegation, with the shop one tap away.
  await visitor.goto("/alerts?category=software");
  await expect(visitor.getByTestId("allegation-note")).toContainText(
    "লেখকের নিজের দাবি",
  );
  const alert = visitor.getByTestId("alerts").locator("li", { hasText: shop });
  await expect(alert).toContainText("এখনো রিপ্লাই নেই");
  // And on the front page.
  await visitor.goto("/");
  await expect(visitor.getByTestId("home-alerts")).toContainText(shop);

  // One person, one live report per shop.
  await author.goto(`/community?subject=${encodeURIComponent(shop)}`);
  await click(author, "ড্রাফট শুরু করুন");
  await author.waitForURL("**/community/*-*");
  await author.locator('textarea[name="narrative"]').fill("Same story again.");
  await author
    .locator('textarea[name="publicText"]')
    .fill("Same story, a second time.");
  await click(author, "ড্রাফট সংরক্ষণ করুন");
  await author.locator('input[name="approved"]').check();
  await click(author, "মডারেটরের কাছে জমা দিন");
  await expect(author.locator('main [role="alert"]')).toContainText(
    "ইতিমধ্যে জমা বা পাবলিশড",
  );

  // A moderator's general warning leads the alerts page until retracted.
  // Letters only: a long run of digits would be refused as an identifier.
  const title = `E2E advance payment warning ${Math.random().toString(36).replace(/[0-9]/g, "").slice(2, 8)}`;
  await moderator.goto("/moderation");
  await moderator.locator('input[name="title"]').fill(title);
  await moderator
    .locator('textarea[name="body"]')
    .fill(
      "Several reports describe pages asking for full payment before showing the product.",
    );
  await click(moderator, "ওয়ার্নিং প্রকাশ করুন");
  await visitor.goto("/alerts");
  await expect(visitor.getByTestId("safety-notes")).toContainText(title);
  await moderator.goto("/moderation");
  await click(moderator, `তুলে নিন: ${title}`);
  await visitor.goto("/alerts");
  await expect(visitor.locator("main")).not.toContainText(title);

  // Withdrawn by its author: the shop has no public page any more.
  await author.goto(reportUrl);
  await click(author, "লেখাটি তুলে নিন");
  expect((await visitor.goto(shopUrl))?.status()).toBe(404);
});
