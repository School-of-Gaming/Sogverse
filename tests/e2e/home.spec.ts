import { test, expect } from "@playwright/test";

test.describe("Home Page", () => {
  test("should display the hero section", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { level: 1, name: /screen time/i })
    ).toBeVisible();

    await expect(
      page.getByText(/promote healthy gaming/i)
    ).toBeVisible();
  });

  test("should have navigation links", async ({ page }) => {
    await page.goto("/");

    // Home, Clubs, and About are visible inline on both desktop and mobile,
    // so no need to open the hamburger menu. Use .first() because mobile
    // renders them both inline and inside the hamburger menu.
    await expect(page.getByRole("link", { name: "Home" }).first()).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Clubs", exact: true }).first()
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "About", exact: true }).first()
    ).toBeVisible();
  });

  test("should navigate to register page", async ({ page }) => {
    await page.goto("/");

    // JS click: overflow-hidden on <html> shifts the scroll container to <main>,
    // which changes CSS stacking so Playwright's coordinate-based click hits the
    // wrong element. JS dispatch targets the DOM node directly.
    // See docs/layout-scroll-architecture.md § "Playwright and overflow-hidden".
    await page.getByRole("link", { name: /get started/i }).first().dispatchEvent("click");

    await expect(page).toHaveURL("/register");
  });

  test("should navigate to clubs page", async ({ page }) => {
    await page.goto("/");

    // JS click: see comment in "should navigate to register page" above
    await page.getByRole("link", { name: /view clubs/i }).dispatchEvent("click");

    await expect(page).toHaveURL("/clubs");
  });

  test("should display features section", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: /minecraft clubs with gedus/i })
    ).toBeVisible();

    await expect(
      page.getByRole("heading", { name: /make gaming a great hobby/i })
    ).toBeVisible();
  });

  test("should display how it works section", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: /how it works/i })
    ).toBeVisible();

    await expect(page.getByText(/create your account/i)).toBeVisible();
    await expect(page.getByText(/pick a club/i)).toBeVisible();
    await expect(page.getByText(/join the adventure/i)).toBeVisible();
  });
});
