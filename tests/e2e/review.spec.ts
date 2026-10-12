import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { click, fundedDeal, signUp } from "./helpers";

test("a dispute is reviewed, decided with reasons, accepted by both parties and paid as decided", async ({
  browser,
}) => {
  const { page: seller } = await signUp(browser, "Seller");
  const { page: buyer } = await signUp(browser, "Buyer");
  const { page: reviewer, email } = await signUp(browser, "Reviewer");
  const dealUrl = await fundedDeal(seller, buyer);

  // Staff roles are granted by an operator, not from inside the app (D.2).
  await reviewer.goto("/review");
  await expect(reviewer.getByText("404")).toBeVisible();
  execFileSync("pnpm", ["staff", "grant", email, "reviewer", "e2e test"], {
    stdio: "pipe",
  });

  // The buyer opens a dispute and asks for a human.
  await buyer.goto(dealUrl);
  await buyer.getByText("সমস্যা জানান (ডিসপিউট খুলুন)").click();
  await buyer.locator('select[name="claim"]').selectOption("CANNOT_ACCESS");
  await buyer.locator('input[name="detail"]').fill("invalid credentials");
  await click(buyer, "ডিসপিউট খুলুন");
  await expect(buyer.getByTestId("dispute-state")).toContainText("খোলা");
  await click(buyer, "হিউম্যান রিভিউ চাই");
  // Queued is shown as queued, not as assigned.
  await expect(buyer.getByTestId("dispute-state")).toContainText(
    "এখনো কাউকে দেওয়া হয়নি",
  );

  // A party cannot see the queue or the case.
  await seller.goto("/review");
  await expect(seller.getByText("404")).toBeVisible();

  // The reviewer takes the case and decides.
  await reviewer.goto("/review");
  await click(reviewer, "দায়িত্ব নিন");
  await reviewer.waitForURL(/\/review\/[0-9a-f-]{36}$/);
  await expect(reviewer.getByText("invalid credentials")).toBeVisible();
  const caseUrl = reviewer.url();
  await seller.goto(new URL(caseUrl).pathname);
  await expect(seller.getByText("404")).toBeVisible();

  await reviewer.locator('input[name="toSellerTaka"]').fill("500");
  await reviewer.locator('input[name="rule"]').fill("Accepted refund rule");
  await reviewer.locator('input[name="facts"]').fill("Partial value received");
  await reviewer
    .locator('input[name="reasoning"]')
    .fill("Split by usable value");
  await click(reviewer, "সিদ্ধান্ত রেকর্ড করুন");
  // Once decided, the reviewer's access to the case ends only when the
  // appeal rule is satisfied; until then they can still read it.
  await reviewer.waitForURL("**/review");

  // Both parties see the reasons. No money has moved during the appeal window.
  await buyer.goto(dealUrl);
  await expect(buyer.getByTestId("decision")).toContainText(
    "Split by usable value",
  );
  await expect(buyer.getByTestId("decision")).toContainText("৳500.00");
  await expect(buyer.getByTestId("settlement")).toHaveCount(0);

  await click(buyer, "সিদ্ধান্ত মেনে নিচ্ছি");
  await expect(buyer.getByTestId("dispute-state")).toContainText(
    "আপিলের সময় চলছে",
  );
  await seller.goto(dealUrl);
  await click(seller, "সিদ্ধান্ত মেনে নিচ্ছি");
  await expect(seller.getByTestId("dispute-state")).toHaveText("মীমাংসিত");

  // The worker pays both sides as decided.
  await expect(async () => {
    await seller.goto(dealUrl);
    await expect(seller.getByTestId("operation-payout")).toHaveText("সম্পন্ন", {
      timeout: 2000,
    });
    await expect(seller.getByTestId("operation-refund")).toHaveText("সম্পন্ন", {
      timeout: 2000,
    });
  }).toPass({ timeout: 120_000 });
  const settlement = seller.getByTestId("settlement");
  await expect(settlement).toContainText("৳500.00");
  await expect(settlement).toContainText("৳1,000.00");
});
