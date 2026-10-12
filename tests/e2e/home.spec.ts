import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("the front page leads with shop search, and the 3D scene never stands in its way", async ({
  browser,
}) => {
  const page = await (
    await browser.newContext({ viewport: { width: 1280, height: 800 } })
  ).newPage();
  await page.goto("/");
  // INV-15: every page says in words that this is a test build.
  await expect(page.getByTestId("testbar")).toContainText("কোনো আসল টাকা");

  // The still image is there for everyone, before and without any script.
  const scene = page.getByTestId("vault-scene").first();
  const poster = scene.locator("img");
  await expect(poster).toHaveAttribute("alt", /সিন্দুক/);
  expect(
    await poster.evaluate((img: HTMLImageElement) => img.naturalWidth),
  ).toBeGreaterThan(0);
  // Where WebGL exists the live scene takes over; where it does not, the
  // image simply stays.
  const webgl = await page.evaluate(
    () => !!document.createElement("canvas").getContext("webgl2"),
  );
  if (webgl) {
    await expect(scene).toHaveAttribute("data-ready", "true", {
      timeout: 30_000,
    });
  }

  // The first Tab reaches the skip link; the search is the primary action.
  await page.keyboard.press("Tab");
  await expect(page.locator(".skip")).toBeFocused();
  await page.locator('.hero input[name="q"]').fill("Nobody Wrote About This");
  await page.getByRole("button", { name: "দোকান খুঁজুন" }).first().click();
  await page.waitForURL("**/shops?q=*");
  await expect(page.locator('input[name="q"]')).toHaveValue(
    "Nobody Wrote About This",
  );
  await expect(page.getByTestId("no-shops")).toBeVisible();
});

test("V7-34: at 360 pixels nothing overflows and the search is on the first screen; reduced motion is honoured", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 360, height: 640 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  for (const path of ["/", "/shops", "/alerts", "/login"]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
  await page.goto("/");
  const box = await page.locator('.hero input[name="q"]').boundingBox();
  expect((box?.y ?? 9999) + (box?.height ?? 0)).toBeLessThanOrEqual(640);
  // With reduced motion nothing on the page is mid-animation.
  const moving = await page.evaluate(
    () =>
      document
        .getAnimations()
        .filter((animation) => animation.playState === "running").length,
  );
  expect(moving).toBe(0);
});

test("automated accessibility checks find no serious problem on the public pages", async ({
  page,
}) => {
  for (const path of ["/", "/shops", "/alerts", "/login"]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    const serious = results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map(
        (v) =>
          `${v.id}: ${v.nodes
            .map((n) => n.target.join(" "))
            .slice(0, 3)
            .join(" | ")}`,
      );
    expect(serious, path).toEqual([]);
  }
});
