import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { click, signUp } from "./helpers";

test("an experience is private until its author approves it and a moderator publishes it", async ({
  browser,
}) => {
  const { page: author } = await signUp(browser, "Author");
  const { page: moderator, email } = await signUp(browser, "Moderator");
  const { page: reader } = await signUp(browser, "Reader");
  const shop = `E2E Shop ${Date.now()}`;

  // The moderator role comes from an operator, not from inside the app (D.2).
  await moderator.goto("/moderation");
  await expect(moderator.getByText("404")).toBeVisible();
  execFileSync("pnpm", ["staff", "grant", email, "moderator", "e2e test"], {
    stdio: "pipe",
  });

  await author.goto("/community");
  await author.locator('input[name="subject"]').fill(shop);
  await click(author, "ড্রাফট শুরু করুন");
  await author.waitForURL("**/community/*-*");
  const url = author.url();
  await expect(author.getByTestId("report-state")).toContainText("ড্রাফট");
  // An incomplete draft cannot be submitted yet.
  await expect(author.getByTestId("preview")).toContainText("ব্যক্তিগত ড্রাফট");

  // A phone number in the public text is refused.
  await author
    .locator('textarea[name="narrative"]')
    .fill("Paid 2500 taka to 01712345678, nothing arrived.");
  await author
    .locator('textarea[name="publicText"]')
    .fill("Paid to 01712345678, nothing arrived.");
  await click(author, "ড্রাফট সংরক্ষণ করুন");
  await expect(author.locator('main [role="alert"]')).toContainText("ফোন নম্বর");

  await author
    .locator('textarea[name="narrative"]')
    .fill("Paid 2500 taka to 01712345678, nothing arrived.");
  await author
    .locator('textarea[name="publicText"]')
    .fill("I paid 2500 taka and the license never arrived.");
  await click(author, "ড্রাফট সংরক্ষণ করুন");
  await expect(author.getByTestId("preview-text")).toHaveText(
    "I paid 2500 taka and the license never arrived.",
  );
  await author.locator('input[name="approved"]').check();
  await click(author, "মডারেটরের কাছে জমা দিন");
  await expect(author.getByTestId("report-state")).toContainText("অপেক্ষায়");

  // Submitted is not public.
  expect((await reader.goto(url))?.status()).toBe(404);

  await moderator.goto("/moderation");
  await click(moderator, `দায়িত্ব নিন: ${shop}`);
  await expect(moderator.getByTestId("private-original")).toContainText(
    "01712345678",
  );
  await moderator.locator('select[name="decision"]').selectOption("PUBLISHED");
  await moderator
    .locator('input[name="reason"]')
    .fill("Follows the publication rules.");
  await click(moderator, "সিদ্ধান্ত দিন");

  // The reader sees the approved text, labelled as unverified, and nothing private.
  await reader.goto(url);
  await expect(reader.getByTestId("public-text")).toHaveText(
    "I paid 2500 taka and the license never arrived.",
  );
  await expect(reader.getByTestId("unverified-label")).toContainText(
    "ভেরিফাই করেনি",
  );
  await expect(reader.getByTestId("private-original")).toHaveCount(0);
  await expect(reader.locator("main")).not.toContainText("01712345678");
  await expect(reader.getByTestId("followups")).toContainText(
    "উত্তর না থাকা মানে স্বীকার করা নয়",
  );

  // A reply waits for a moderator too.
  await reader
    .locator('input[name="body"]')
    .fill("We refunded this order in full.");
  await click(reader, "মডারেটরের কাছে পাঠান");
  await expect(reader.getByTestId("followup")).toContainText("অপেক্ষায়");
  await author.goto(url);
  await expect(author.getByTestId("followup")).toHaveCount(0);
  await moderator.goto("/moderation");
  const pending = moderator
    .getByTestId("followup-queue")
    .locator("li", { hasText: "We refunded this order in full." });
  await pending.locator('select[name="publish"]').selectOption("yes");
  await pending
    .locator('input[name="reason"]')
    .fill("Follows the publication rules.");
  await Promise.all([
    moderator.waitForResponse((r) => r.request().method() === "POST"),
    pending.getByRole("button", { name: "সিদ্ধান্ত দিন" }).click(),
  ]);
  await author.goto(url);
  await expect(author.getByTestId("followup")).toContainText("ভেরিফাই করা হয়নি");
  // The complaint is still there beside the reply.
  await expect(author.getByTestId("public-text")).toBeVisible();

  // The seller lookup lists it apart from web results.
  await reader.goto("/research");
  await reader.locator('input[name="subject"]').fill(shop);
  await click(reader, "খুঁজুন");
  await expect(
    reader.getByTestId("community-reports").locator("li"),
  ).toHaveCount(1);

  // Withdrawal leaves a stub that passes no judgment either way.
  await author.goto(url);
  await click(author, "লেখাটি তুলে নিন");
  await reader.goto(url);
  await expect(reader.getByTestId("withdrawn")).toContainText("মিথ্যা ছিল, তা নয়");
  await expect(reader.getByTestId("public-text")).toHaveCount(0);
});
