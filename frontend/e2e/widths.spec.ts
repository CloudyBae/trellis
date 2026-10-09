import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const KEY_CONTROLS = [".runswitch", ".views", ".theme-toggle"];

async function expectInsideViewport(page: Page, selector: string): Promise<void> {
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  if (viewport === null) {
    return;
  }
  const locator = page.locator(selector).first();
  await expect(locator).toBeVisible();
  await expect
    .poll(async () => {
      const box = await locator.boundingBox();
      if (box === null) {
        return "no box";
      }
      const outside = [
        box.x < 0 ? "left" : "",
        box.y < 0 ? "top" : "",
        box.x + box.width > viewport.width ? "right" : "",
        box.y + box.height > viewport.height ? "bottom" : "",
      ].filter(Boolean);
      return outside.length === 0 ? "inside" : `outside ${outside.join(" ")}`;
    }, { message: `${selector} fits the viewport` })
    .toBe("inside");
}

async function expectPageFits(page: Page): Promise<void> {
  for (const selector of KEY_CONTROLS) {
    await expect(page.locator(selector).first()).toBeVisible();
  }
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), {
      message: "page has no horizontal scroll",
    })
    .toBeLessThanOrEqual(0);
  for (const selector of KEY_CONTROLS) {
    await expectInsideViewport(page, selector);
  }
}

async function expectMenuFits(page: Page): Promise<void> {
  await page.locator(".runswitch").click();
  const menu = page.locator("#sessMenu");
  await expect(menu).toBeVisible();
  await expectInsideViewport(page, "#sessMenu");
  await page.keyboard.press("Escape");
}

for (const width of [320, 360, 768, 1024, 1440]) {
  test(`page fits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/?demo");
    await expectPageFits(page);
  });
}

test("run menu fits at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/?demo");
  await expectMenuFits(page);
});

test("page fits at 640px, about 200 percent zoom of 1280px", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 400 });
  await page.goto("/?demo");
  await expectPageFits(page);
});

test("page fits after resizing 1440 to 360 to 1440", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto("/?demo");
  await expectPageFits(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await expectPageFits(page);
  await page.setViewportSize({ width: 1440, height: 800 });
  await expectPageFits(page);
});

test.describe("touch at 1024px", () => {
  test.use({ viewport: { width: 1024, height: 800 }, hasTouch: true });

  test("pkg 11: touch targets are at least 44px", async ({ page }) => {
    await page.goto("/?demo");
    const coarse = await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches);
    expect(coarse, "context reports a coarse pointer").toBe(true);
    for (const selector of [".mark", ".runswitch", ".theme-toggle"]) {
      const box = await page.locator(selector).first().boundingBox();
      expect(box, `${selector} is visible`).not.toBeNull();
      expect(box?.width, `${selector} width`).toBeGreaterThanOrEqual(44);
      expect(box?.height, `${selector} height`).toBeGreaterThanOrEqual(44);
    }
  });
});
