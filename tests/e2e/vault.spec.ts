import { expect, test } from "@playwright/test";
import { act, click, fundedDeal, signUp } from "./helpers";

// The vault needs the local Matrix homeserver (`pnpm matrix:local`). Without
// it this is reported as skipped, never as passed.
test.skip(
  !process.env.MATRIX_HOMESERVER_URL,
  "no Matrix homeserver configured",
);

const SECRET = `LICENSE-KEY-${Date.now()}-XYZZY`;

test("a seller's secret reaches the buyer encrypted end to end", async ({
  browser,
}) => {
  const { page: seller } = await signUp(browser, "Seller");
  const { page: buyer } = await signUp(browser, "Buyer");
  const dealUrl = await fundedDeal(seller, buyer);

  // Vault: the buyer has no room yet and no way to type a secret.
  const buyerVault = buyer.getByTestId("vault-panel");
  await expect(buyerVault).toHaveAttribute("data-phase", "no_room");
  await expect(buyerVault.locator('input[type="password"]')).toHaveCount(0);

  // The seller creates the room; the server verifies who is in it.
  await seller.goto(dealUrl);
  const sellerVault = seller.getByTestId("vault-panel");
  await expect(sellerVault).toHaveAttribute("data-phase", "no_room");
  await sellerVault
    .getByRole("button", { name: "এই ডিলের ভল্ট তৈরি করুন" })
    .click();
  // Until the buyer's device has joined, the seller cannot send.
  await expect(sellerVault).toHaveAttribute("data-phase", "waiting_for_other");
  await expect(sellerVault.locator('input[type="password"]')).toHaveCount(0);

  await buyer.goto(dealUrl);
  await expect(buyer.getByTestId("vault-panel")).toHaveAttribute(
    "data-phase",
    "ready",
  );
  await expect(sellerVault).toHaveAttribute("data-phase", "ready");

  // Send, and read on the other side.
  await sellerVault.getByTestId("vault-input-key_delivered").fill(SECRET);
  await sellerVault.getByRole("button", { name: "ভল্টে পাঠান" }).click();
  await expect(sellerVault.getByText("পাঠানো হয়েছে।")).toBeVisible();

  const received = buyer.getByTestId("vault-received");
  await expect(received).toHaveCount(1);
  // Hidden until the buyer asks to see it.
  await expect(buyer.getByTestId("vault-value")).toHaveCount(0);
  await received.getByRole("button", { name: "দেখান" }).click();
  await expect(buyer.getByTestId("vault-value")).toHaveText(SECRET);

  // What the homeserver stored is ciphertext: ask it directly, as the buyer.
  const stored = await buyer.evaluate(async () => {
    const key = Object.keys(localStorage).find((k) =>
      k.startsWith("binimoy.vault."),
    );
    const { accessToken } = JSON.parse(localStorage.getItem(key ?? "") ?? "{}");
    const session = await (await fetch("/api/vault/session")).json();
    const sync = await fetch(
      `${session.homeserverUrl}/_matrix/client/v3/sync?timeout=0`,
      { headers: { authorization: `Bearer ${accessToken}` } },
    );
    return JSON.stringify(await sync.json());
  });
  expect(stored).toContain("m.room.encrypted");
  expect(stored).not.toContain(SECRET);
  expect(stored).not.toContain("binimoy.delivery.item");

  // And the application's own pages never carry it for the seller either.
  await seller.reload();
  expect(await seller.content()).not.toContain(SECRET);

  // --- Delivery, inspection, acceptance and payout ---

  // The seller declares the two mandatory statements and submits.
  const submit = seller.getByTestId("submit-delivery");
  await expect(seller.getByTestId("vault-sent-key_delivered")).toBeVisible();
  const declarations = submit.locator('input[name="declared"]');
  await declarations.nth(0).check();
  await declarations.nth(1).check();
  await act(seller, submit.getByRole("button", { name: "ডেলিভারি জমা দিন" }));
  await expect(seller.getByTestId("inspection-key_delivered")).toHaveText("পাস");
  // Submitting moved no money.
  await expect(seller.getByTestId("settlement")).toHaveCount(0);

  // The buyer cannot accept until their own checks pass.
  await buyer.goto(dealUrl);
  await click(buyer, "এই ডেলিভারি গ্রহণ করুন");
  await expect(buyer.locator('main [role="alert"]')).toContainText(
    "সব আবশ্যক অংশ",
  );
  await expect(buyer.getByTestId("settlement")).toHaveCount(0);

  await buyer.goto(dealUrl);
  await act(buyer, buyer.getByRole("button", { name: /অ্যাক্টিভেশন সফল: পাস/ }));
  await act(buyer, buyer.getByRole("button", { name: /সীমা নিশ্চিত: পাস/ }));
  await expect(buyer.getByTestId("inspection-activation_works")).toHaveText(
    "পাস",
  );

  await click(buyer, "এই ডেলিভারি গ্রহণ করুন");
  await expect(buyer.getByTestId("settlement")).toBeVisible();

  // The worker dispatches the payout; the page reports what the ledger says.
  await expect(async () => {
    await seller.goto(dealUrl);
    await expect(seller.getByTestId("operation-payout")).toHaveText("সম্পন্ন", {
      timeout: 2000,
    });
  }).toPass({ timeout: 120_000 });
  await expect(seller.getByText("৳1,500.00").first()).toBeVisible();
});
