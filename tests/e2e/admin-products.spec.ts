import { test, expect } from "@playwright/test";

test.describe("Admin Products Pages", () => {
  test.describe("Products List (unauthenticated)", () => {
    test("should redirect to login with return URL", async ({ page }) => {
      await page.goto("/admin/products");

      await expect(page).toHaveURL(/\/login\?redirect=/);
    });
  });

  test.describe("Add Product (unauthenticated)", () => {
    test("should redirect to login with return URL", async ({ page }) => {
      await page.goto("/admin/products/add");

      await expect(page).toHaveURL(/\/login\?redirect=/);
    });
  });
});

test.describe("Public Products Page", () => {
  test("should display the products heading", async ({ page }) => {
    await page.goto("/products");

    await expect(
      page.getByRole("heading", { name: "Our Products" })
    ).toBeVisible();
  });
});
