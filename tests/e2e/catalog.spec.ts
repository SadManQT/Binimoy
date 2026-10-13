import { expect, test } from "@playwright/test";
import { click, fundedDeal, signUp } from "./helpers";

test("a top-up is proven by the provider's record for the agreed player ID, not by the seller saying sent", async ({
  browser,
}) => {
  const { page: seller } = await signUp(browser, "Seller");
  const { page: buyer } = await signUp(browser, "Buyer");

  // All eleven categories are offered.
  await seller.goto("/deals/new");
  await expect(seller.locator("main ul li")).toHaveCount(11);

  const dealUrl = await fundedDeal(seller, buyer, "game_topup", {
    game: "Sky Racers",
    server: "Asia-1",
    region: "BD",
    player_id: "PLAYER-7781",
    quantity: "500 gems",
  });

  // Nothing secret changes hands here, so the vault is not involved.
  await seller.goto(dealUrl);
  await click(seller, "ডেলিভারি জমা দিন");
  const fulfilled = seller.getByTestId("inspection-fulfilled_to_destination");
  // The provider has no record yet: that is "not verified", not a pass.
  await expect(
    seller.getByTestId("inspection-supplier_authorized"),
  ).toContainText("ভেরিফাই করা যায়নি");
  await expect(seller.getByTestId("objective-window")).toHaveCount(0);

  await click(seller, "টেস্ট উত্তর ঠিক করুন: supplier_authorized");

  // Fulfilled, but to someone else's player ID.
  await seller
    .getByTestId("provider-lab")
    .locator('input[name="boundTo"]')
    .fill("PLAYER-0000");
  await click(seller, "টেস্ট উত্তর ঠিক করুন: fulfilled_to_destination");
  await expect(fulfilled).toHaveText("ব্যর্থ");
  await expect(seller.locator("main")).toContainText("PLAYER-0000");

  // The buyer cannot accept an incomplete checklist.
  await buyer.goto(dealUrl);
  await click(buyer, "এই ডেলিভারি গ্রহণ করুন");
  await expect(buyer.locator('main [role="alert"]')).toContainText(
    "সব আবশ্যক অংশ",
  );

  // Now the record matches the agreed ID.
  await seller.goto(dealUrl);
  await seller
    .getByTestId("provider-lab")
    .locator('input[name="boundTo"]')
    .fill("PLAYER-7781");
  await click(seller, "টেস্ট উত্তর ঠিক করুন: fulfilled_to_destination");
  await click(seller, "টেস্ট উত্তর ঠিক করুন: quantity_matches");
  await expect(seller.getByTestId("inspection-quantity_matches")).toHaveText(
    "পাস",
  );
  await expect(
    seller.getByTestId("inspection-quantity_matches").locator("xpath=.."),
  ).toContainText("টেস্ট প্রোভাইডার");

  // Every mandatory item is independently proven and the buyer has a notice
  // waiting. Until the buyer has been shown it, no period is running.
  await expect(seller.getByTestId("objective-pending")).toContainText(
    "এখনো সেটি দেখেননি",
  );
  await buyer.goto("/deals");
  await expect(buyer.getByTestId("notices-link")).toContainText("নতুন");

  // The buyer opens the deal: now they are told, with a stated time to
  // object. Nothing is paid yet.
  await buyer.goto(dealUrl);
  await expect(buyer.getByTestId("objective-window")).toContainText("আপত্তি");
  await expect(buyer.getByTestId("settlement")).toHaveCount(0);

  // The buyer need not wait for the window: accepting pays now.
  await click(buyer, "এই ডেলিভারি গ্রহণ করুন");
  await expect(async () => {
    await buyer.goto(dealUrl);
    await expect(buyer.getByTestId("operation-payout")).toHaveText("সম্পন্ন", {
      timeout: 2000,
    });
  }).toPass({ timeout: 120_000 });

  // The receipt reconstructs it: versions, proof sources and the money.
  await buyer.getByRole("link", { name: "রসিদ ও পূর্ণ রেকর্ড" }).click();
  const receipt = buyer.getByTestId("receipt");
  await expect(receipt).toContainText("টেস্ট রেকর্ড");
  await expect(receipt).toContainText("CAT-03");
  await expect(receipt.getByTestId("receipt-seller-paid")).toHaveText(
    "৳1,500.00",
  );
  await expect(receipt.getByTestId("receipt-pending")).toHaveCount(0);
  // Nobody outside the deal can open it.
  const { page: stranger } = await signUp(browser, "Stranger");
  expect((await stranger.goto(buyer.url()))?.status()).toBe(404);

  // The notices list says what happened and offers no way to accept anything.
  await seller.goto("/notifications");
  await expect(
    seller.getByTestId("notices").locator('[data-kind="TRANSFER_COMPLETED"]'),
  ).toHaveCount(1, { timeout: 60_000 });
  await expect(seller.locator("main button")).toHaveCount(0);

  // The same deal and receipt in English, with the same facts.
  await buyer.goto(`/api/lang?to=en&next=${new URL(dealUrl).pathname}`);
  await expect(buyer.getByTestId("next-step")).toContainText(
    "Settlement is complete",
  );
  await expect(buyer.getByTestId("operation-payout")).toHaveText("Completed");
  await expect(buyer.locator("main")).not.toContainText(/[ঀ-৿]/);
  await buyer.getByRole("link", { name: "Receipt and full record" }).click();
  await expect(buyer.getByTestId("receipt")).toContainText("Test record");
});
