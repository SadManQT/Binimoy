import { expect, test } from "@playwright/test";
import { act, signUp } from "./helpers";

test("a seller lookup shows attributed, labelled posts and no verdict", async ({
  browser,
}) => {
  const { page } = await signUp(browser, "Researcher");
  await page.goto("/research");
  await expect(page.getByTestId("fixture-label")).toContainText("পরীক্ষামূলক");
  await page.locator('input[name="subject"]').fill("Tech Bazar BD");
  await act(page, page.getByRole("button", { name: "খুঁজুন" }));
  await page.waitForURL("**/research/*-*");
  const url = page.url();

  await expect(page.getByTestId("fixture-label")).toContainText("নমুনা");
  await expect(page.getByTestId("coverage")).toContainText("অসম্পূর্ণ");
  await expect(page.getByTestId("counts")).toContainText(
    "ভালো অভিজ্ঞতা ১টি · অভিযোগ ২টি",
  );

  // A post that could not be read is shown as a link, not as a report.
  const walled = page.locator('[data-access="SNIPPET_ONLY"]');
  await expect(walled.getByTestId("card-access")).toContainText(
    "পুরো পোস্ট পড়া যায়নি",
  );
  await expect(walled.getByTestId("card-summary")).toHaveCount(0);

  // The similarly named shop sits apart until the user says it is the same.
  const possible = page.getByTestId("possible-cards");
  await expect(possible.getByTestId("report-card")).toHaveCount(1);
  await act(page, possible.getByRole("button", { name: "এটি এই নামেরই" }));
  await expect(page.getByTestId("possible-cards")).toHaveCount(0);
  await expect(page.getByTestId("counts")).toContainText("ভালো অভিজ্ঞতা ২টি");

  // Nobody else can open the collection.
  const { page: stranger } = await signUp(browser, "Stranger");
  const response = await stranger.goto(url);
  expect(response?.status()).toBe(404);

  // A name nobody wrote about says so, without implying it is clean.
  await page.goto("/research");
  await page.locator('input[name="subject"]').fill("Nonexistent Shop 4471");
  await act(page, page.getByRole("button", { name: "খুঁজুন" }));
  await expect(page.getByTestId("no-results")).toContainText(
    "এর মানে এই নয় যে কোনো পোস্ট নেই",
  );
});
