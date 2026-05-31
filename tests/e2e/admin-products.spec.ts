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
