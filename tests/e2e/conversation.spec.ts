import { expect, test } from "@playwright/test";
import { click, fundedDeal, signUp } from "./helpers";

test("the deal room needs consent, keeps edit history and refuses a pasted password", async ({
  browser,
}) => {
  const { page: seller } = await signUp(browser, "Seller");
  const { page: buyer } = await signUp(browser, "Buyer");
  const dealUrl = await fundedDeal(seller, buyer);

  // The room says plainly that it is not private, before anyone writes.
  await buyer.goto(dealUrl);
  const room = buyer.getByTestId("conversation");
  await expect(room.getByTestId("monitoring-label")).toContainText(
    "এই কথোপকথন গোপন নয়",
  );
  await expect(room.locator('input[name="body"]')).toHaveCount(0);
  await expect(room.getByTestId("ai-may-read")).toContainText("না");

  await click(buyer, "কনসেন্ট দিচ্ছি");
  await buyer
    .getByTestId("conversation")
    .locator('input[name="body"]')
    .fill("কি টি কখন পাব?");
  await click(buyer, "পাঠান");
  await expect(buyer.getByTestId("message-body")).toHaveText("কি টি কখন পাব?");
  // One party's consent is not both.
  await expect(buyer.getByTestId("ai-may-read")).toContainText("না");

  // The seller can read without consenting, but cannot write.
  await seller.goto(dealUrl);
  await expect(seller.getByTestId("message-body")).toHaveText("কি টি কখন পাব?");
  await expect(
    seller.getByTestId("conversation").locator('input[name="body"]'),
  ).toHaveCount(0);
  await click(seller, "কনসেন্ট দিচ্ছি");
  await expect(seller.getByTestId("ai-may-read")).toContainText("হ্যাঁ");

  // A password typed into the room is refused and does not appear.
  await seller
    .getByTestId("conversation")
    .locator('form:has(button:text-is("পাঠান")) input[name="body"]')
    .fill("password: Hunter2xyz");
  await click(seller, "পাঠান");
  await expect(seller.locator('main [role="alert"]')).toContainText(
    "সংরক্ষণ করা হয়নি",
  );
  await seller.goto(dealUrl);
  await expect(seller.getByTestId("message")).toHaveCount(1);
  expect(await seller.content()).not.toContain("Hunter2xyz");

  // An edit keeps the earlier wording available.
  await buyer.goto(dealUrl);
  await buyer.getByText("এই বার্তা নিয়ে কিছু করুন").click();
  const edit = buyer.locator('form:has(button:text-is("সম্পাদনা সংরক্ষণ"))');
  await edit.locator('input[name="body"]').fill("কি টি আজ পাব তো?");
  await click(buyer, "সম্পাদনা সংরক্ষণ");
  await expect(buyer.getByTestId("message-body")).toHaveText("কি টি আজ পাব তো?");
  await seller.goto(dealUrl);
  await seller.getByText("আগের সংস্করণ (1)").click();
  await expect(seller.getByTestId("message")).toContainText("কি টি কখন পাব?");

  // --- AI summary (fixture model): a suggestion, clearly marked ---
  await buyer.goto(dealUrl);
  await click(buyer, "এআই-এর সারসংক্ষেপ চান");
  await expect(async () => {
    await buyer.goto(dealUrl);
    await expect(buyer.getByTestId("assessment-next-step")).toBeVisible({
      timeout: 2000,
    });
  }).toPass({ timeout: 120_000 });
  const summary = buyer.getByTestId("assessment");
  await expect(summary).toContainText("প্রস্তাব, সিদ্ধান্ত নয়");
  await expect(summary).toContainText("টেস্ট মডেল");
  await expect(buyer.getByTestId("assessment-stale")).toHaveCount(0);

  // A new message makes that summary out of date, and the page says so.
  await seller.goto(dealUrl);
  await seller
    .getByTestId("conversation")
    .locator('form:has(button:text-is("পাঠান")) input[name="body"]')
    .fill("আজ বিকেলে পাঠাব");
  await click(seller, "পাঠান");
  await buyer.goto(dealUrl);
  await expect(buyer.getByTestId("assessment-stale")).toBeVisible();
});
