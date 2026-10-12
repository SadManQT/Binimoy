import { type Browser, expect, type Page } from "@playwright/test";

export const PASSWORD = "e2e test passphrase";

// A fresh browser context per person: separate cookies, storage and devices.
export async function signUp(
  browser: Browser,
  name: string,
): Promise<{ page: Page; email: string }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const email = `e2e-${name.toLowerCase()}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  await page.goto("/login");
  const form = page.locator('section[aria-labelledby="pw"]');
  await form.locator('input[name="name"]').fill(name);
  await form.locator('input[name="email"]').fill(email);
  await form.locator('input[name="password"]').fill(PASSWORD);
  // The auth server allows three sign-ups per ten seconds from one address,
  // and back-to-back tests exceed that. Wait out the window and try again.
  for (let attempt = 1; ; attempt += 1) {
    await form.getByRole("button", { name: "নতুন অ্যাকাউন্ট" }).click();
    try {
      await page.waitForURL("**/account", { timeout: 20_000 });
      break;
    } catch (error) {
      if (attempt === 3) throw error;
      await page.waitForTimeout(11_000);
    }
  }
  return { page, email };
}

// Submits a form and waits until the server has answered, so the next step
// (often in the other browser) sees the committed state. "networkidle" cannot
// be used: the vault keeps a long poll open to the homeserver.
export async function act(page: Page, button: ReturnType<Page["getByRole"]>) {
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST"),
    button.click(),
  ]);
  await page.waitForLoadState("domcontentloaded");
}
export const click = (page: Page, name: string) =>
  act(page, page.getByRole("button", { name }));

const LICENSE = {
  product: "EditorPro",
  edition: "Pro",
  region: "BD",
  duration: "12 months",
  device_limit: "2",
  activation_destination: "buyer@example.test",
};

// Drives the real pages to a funded deal of 1,500.00 BDT: a software license
// unless another category and its fields are given.
export async function fundedDeal(
  seller: Page,
  buyer: Page,
  template = "software_license",
  product: Record<string, string> = LICENSE,
): Promise<string> {
  await seller.goto(`/deals/new?template=${template}`);
  await seller.locator('input[name="title"]').fill("E2E deal");
  await seller.locator('input[name="amountTaka"]').fill("1500");
  for (const [key, value] of Object.entries(product)) {
    await seller.locator(`input[name="product.${key}"]`).fill(value);
  }
  await click(seller, "ড্রাফট ডিল তৈরি করুন");
  await seller.waitForURL(/\/deals\/[0-9a-f-]{36}$/);
  const dealUrl = seller.url();

  await click(seller, "ইনভাইট লিংক তৈরি করুন");
  await seller.waitForURL(/invite=/);
  const token = new URL(seller.url()).searchParams.get("invite");
  await buyer.goto(`/invite/${token}`);
  await click(buyer, "যোগ দিন");
  await buyer.waitForURL(dealUrl);

  await seller.goto(dealUrl);
  await click(seller, "সম্মতির জন্য পাঠান");
  await buyer.goto(dealUrl);
  await click(buyer, "আমি ঠিক এই শর্তে সম্মত");
  await seller.goto(dealUrl);
  await click(seller, "আমি ঠিক এই শর্তে সম্মত");

  await buyer.goto(dealUrl);
  await click(buyer, "টাকা জমার ইনভয়েস তৈরি করুন");
  await click(buyer, "টেস্ট পেমেন্ট শুরু করুন");
  await click(buyer, "সঠিক পরিমাণ পাওয়া গেছে");
  await expect(
    buyer.getByText("টাকা জমা নিশ্চিত, নিরাপদ হিসাবে আটকে রাখা"),
  ).toBeVisible();
  return dealUrl;
}
