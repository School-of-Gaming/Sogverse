import { test, expect } from "@playwright/test";

test.describe("Home Page", () => {
  test("should display the hero section", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: /learn through play/i })
    ).toBeVisible();

    await expect(
      page.getByText(/educational gaming platform/i)
    ).toBeVisible();
  });

  test("should have navigation links", async ({ page }) => {
    await page.goto("/");

    // On mobile viewports, open the hamburger menu first
    const menuButton = page.getByLabel("Toggle menu");
    if (await menuButton.isVisible()) {
      await menuButton.click();
    }

    await expect(page.getByRole("link", { name: "Home" }).first()).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Products", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "About", exact: true })
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

  test("should navigate to products page", async ({ page }) => {
    await page.goto("/");

    // JS click: see comment in "should navigate to register page" above
    await page.getByRole("link", { name: /view products/i }).dispatchEvent("click");

    await expect(page).toHaveURL("/products");
  });

  test("should display features section", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByText(/safe gaming environment/i)
    ).toBeVisible();

    await expect(
      page.getByRole("heading", { name: /educational content/i })
    ).toBeVisible();
  });

  test("should display how it works section", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: /how it works/i })
    ).toBeVisible();

    await expect(page.getByText(/create your account/i)).toBeVisible();
    await expect(page.getByText(/add your gamers/i)).toBeVisible();
    await expect(page.getByText(/start learning/i)).toBeVisible();
  });
});
