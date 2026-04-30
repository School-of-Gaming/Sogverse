import { test, expect } from "@playwright/test";

const BROWSE_PAGES = [
  { path: "/clubs", heading: /our clubs/i },
  { path: "/camps", heading: /our camps/i },
  { path: "/events", heading: /our events/i },
] as const;

test.describe("Public browse pages", () => {
  for (const { path, heading } of BROWSE_PAGES) {
    test(`${path} is accessible without signing in`, async ({ page }) => {
      await page.goto(path);

      await expect(page).toHaveURL(path);
      await expect(
        page.getByRole("heading", { level: 1, name: heading })
      ).toBeVisible();
    });
  }
});
