import { expect, test } from "@playwright/test";
import { click, signUp } from "./helpers";

test("an open deal page shows the other side's action without a reload", async ({
  browser,
}) => {
  const { page: seller } = await signUp(browser, "Seller");
  const { page: buyer } = await signUp(browser, "Buyer");

  await seller.goto("/deals/new?template=game_topup");
  await seller.locator('input[name="title"]').fill("Live deal");
  await seller.locator('input[name="amountTaka"]').fill("1500");
  for (const key of ["game", "server", "region", "player_id", "quantity"]) {
    await seller.locator(`input[name="product.${key}"]`).fill("x1");
  }
  await click(seller, "ড্রাফট ডিল তৈরি করুন");
  await seller.waitForURL(/\/deals\/[0-9a-f-]{36}$/);
  await click(seller, "ইনভাইট লিংক তৈরি করুন");
  await seller.waitForURL(/invite=/);
  const token = new URL(seller.url()).searchParams.get("invite");
  await expect(seller.getByTestId("live")).toBeVisible();

  // The buyer joins in another browser. The seller's page is left alone.
  await buyer.goto(`/invite/${token}`);
  await click(buyer, "যোগ দিন");
  await expect(seller.locator(".deal-who")).toContainText("Buyer", {
    timeout: 20_000,
  });
  await expect(seller.getByTestId("next-step")).toContainText("সম্মতির জন্য");

  // The seller sends the terms; the buyer's open page offers to agree.
  await expect(buyer.getByTestId("next-step")).toContainText("সম্মতির জন্য");
  await click(seller, "সম্মতির জন্য পাঠান");
  await expect(
    buyer.getByRole("button", { name: "আমি ঠিক এই শর্তে সম্মত" }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(buyer.locator(".stage")).toHaveAttribute("data-turn", "you");

  // What the buyer is typing survives an update caused by the seller.
  await click(buyer, "সম্মতি দিচ্ছি");
  await buyer.locator('input[name="body"]').fill("typing…");
  await click(seller, "আমি ঠিক এই শর্তে সম্মত");
  await expect(buyer.locator(".deal-main")).toContainText(
    "সম্মতি দিয়েছেন: সেলার",
    { timeout: 20_000 },
  );
  await expect(buyer.locator('input[name="body"]')).toHaveValue("typing…");

  const shots = process.env.SHOTS;
  if (shots) {
    await buyer.setViewportSize({ width: 1280, height: 900 });
    await buyer.waitForTimeout(2500);
    await buyer.screenshot({
      path: `${shots}/deal-desktop.png`,
      fullPage: true,
    });
    await buyer.setViewportSize({ width: 390, height: 800 });
    await buyer.reload();
    await buyer.evaluate(() => scrollTo(0, 0));
    await expect(buyer.locator(".stage-3d")).toHaveAttribute(
      "data-ready",
      "true",
    );
    await buyer.waitForTimeout(1500);
    await buyer.screenshot({ path: `${shots}/deal-phone.png` });
  }
});
