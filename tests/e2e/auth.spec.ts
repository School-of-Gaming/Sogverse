import { test, expect } from "@playwright/test";

test.describe("Authentication Pages", () => {
  test.describe("Login Page", () => {
    test("should display login form", async ({ page }) => {
      await page.goto("/login");

      await expect(
        page.getByRole("heading", { name: /welcome back/i })
      ).toBeVisible();

      await expect(page.getByLabel(/email/i)).toBeVisible();
      await expect(page.getByLabel(/password/i)).toBeVisible();
      await expect(
        page.getByRole("button", { name: /sign in/i })
      ).toBeVisible();
    });

    test("should have link to register", async ({ page }) => {
      await page.goto("/login");

      await expect(page.getByRole("link", { name: /sign up/i })).toBeVisible();
    });

    test("should have link to forgot password", async ({ page }) => {
      await page.goto("/login");

      await expect(
        page.getByRole("link", { name: /forgot password/i })
      ).toBeVisible();
    });

    test("should have link to gamer login", async ({ page }) => {
      await page.goto("/login");

      await expect(
        page.getByRole("link", { name: /gamer login/i })
      ).toBeVisible();
    });
  });

  test.describe("Gamer Login Page", () => {
    test("should display gamer login form", async ({ page }) => {
      await page.goto("/gamer-login");

      await expect(
        page.getByRole("heading", { name: /gamer login/i })
      ).toBeVisible();

      await expect(page.getByLabel(/username/i)).toBeVisible();
      await expect(page.getByLabel(/password/i)).toBeVisible();
      await expect(
        page.getByRole("button", { name: /start playing/i })
      ).toBeVisible();
    });

    test("should have link to parent login", async ({ page }) => {
      await page.goto("/gamer-login");

      await expect(
        page.getByRole("link", { name: /parent.*login/i })
      ).toBeVisible();
    });
  });

  test.describe("Register Page", () => {
    test("should display registration form", async ({ page }) => {
      await page.goto("/register");

      await expect(
        page.getByRole("heading", { name: /create an account/i })
      ).toBeVisible();

      await expect(page.getByLabel(/display name/i)).toBeVisible();
      await expect(page.getByLabel(/email/i)).toBeVisible();
      await expect(page.getByLabel(/^password$/i)).toBeVisible();
      await expect(page.getByLabel(/confirm password/i)).toBeVisible();
      await expect(
        page.getByRole("button", { name: /create account/i })
      ).toBeVisible();
    });

    test("should have link to login", async ({ page }) => {
      await page.goto("/register");

      await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
    });
  });

  test.describe("Forgot Password Page", () => {
    test("should display forgot password form", async ({ page }) => {
      await page.goto("/forgot-password");

      await expect(
        page.getByRole("heading", { name: /forgot password/i })
      ).toBeVisible();

      await expect(page.getByLabel(/email/i)).toBeVisible();
      await expect(
        page.getByRole("button", { name: /send reset link/i })
      ).toBeVisible();
    });

    test("should have link back to login", async ({ page }) => {
      await page.goto("/forgot-password");

      await expect(
        page.getByRole("link", { name: /back to login/i })
      ).toBeVisible();
    });
  });
});
