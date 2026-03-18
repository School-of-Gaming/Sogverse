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

    // On mobile viewports, open the hamburger menu first
    const menuButton = page.getByLabel("Toggle menu");
    if (await menuButton.isVisible()) {
      await menuButton.click();
    }

    await expect(page.getByRole("link", { name: "Home" }).first()).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Clubs", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "About", exact: true })
    ).toBeVisible();
  });

  test("should navigate to register page", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: /get started/i }).first().click();

    await expect(page).toHaveURL("/register");
  });

  test("should navigate to clubs page", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: /view clubs/i }).click();

    await expect(page).toHaveURL("/clubs");
  });

  test("should display features section", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByText(/safe online community/i)
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
