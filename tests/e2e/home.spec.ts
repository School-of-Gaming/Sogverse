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

    await expect(page.getByRole("link", { name: /home/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /products/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /about/i })).toBeVisible();
  });

  test("should navigate to register page", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: /get started/i }).first().click();

    await expect(page).toHaveURL("/register");
  });

  test("should navigate to products page", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: /view products/i }).click();

    await expect(page).toHaveURL("/products");
  });

  test("should display features section", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByText(/safe gaming environment/i)
    ).toBeVisible();

    await expect(
      page.getByText(/educational content/i)
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
