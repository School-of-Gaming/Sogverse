import { test, expect } from "@playwright/test";

test.describe("Authentication Pages", () => {
  test.describe("Login Page", () => {
    test("should display role selection grid", async ({ page }) => {
      await page.goto("/login");

      await expect(
        page.getByRole("heading", { name: /welcome to the sogverse/i })
      ).toBeVisible();

      await expect(page.getByRole("button", { name: /^parent/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /^gamer/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /^gedu/i })).toBeVisible();
    });

    test("should show email form after selecting Parent", async ({ page }) => {
      await page.goto("/login");
      await page.getByRole("button", { name: /^parent/i }).click();

      await expect(page.getByLabel(/email/i)).toBeVisible();
      await expect(page.getByLabel(/password/i)).toBeVisible();
      await expect(
        page.locator("form").getByRole("button", { name: /sign in/i })
      ).toBeVisible();
    });

    test("should have link to register", async ({ page }) => {
      await page.goto("/login");

      await expect(page.getByRole("link", { name: /sign up/i }).first()).toBeVisible();
    });

    test("should have link to forgot password after selecting Parent", async ({ page }) => {
      await page.goto("/login");
      await page.getByRole("button", { name: /^parent/i }).click();

      await expect(
        page.getByRole("link", { name: /forgot password/i })
      ).toBeVisible();
    });

    test("should show role selection grid with gamer option", async ({ page }) => {
      await page.goto("/login");

      await expect(
        page.getByRole("button", { name: /^gamer/i })
      ).toBeVisible();
    });
  });

  test.describe("Gamer Login (via role selection)", () => {
    test("should display gamer login form after selecting Gamer", async ({ page }) => {
      await page.goto("/login");

      await page.getByRole("button", { name: /^gamer/i }).click();

      await expect(
        page.getByRole("heading", { name: /gamer login/i })
      ).toBeVisible();

      await expect(page.getByLabel(/username/i)).toBeVisible();
      await expect(page.getByLabel(/password/i)).toBeVisible();
      await expect(
        page.locator("form").getByRole("button", { name: /start playing/i })
      ).toBeVisible();
    });

    test("should navigate back to role selection", async ({ page }) => {
      await page.goto("/login");

      await page.getByRole("button", { name: /^gamer/i }).click();
      await expect(page.getByRole("heading", { name: /gamer login/i })).toBeVisible();

      await page.getByRole("button", { name: /back/i }).click();
      await expect(page.getByText(/choose how you'd like to sign in/i)).toBeVisible();
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

      await expect(
        page.getByText(/already have an account/i).getByRole("link", { name: /sign in/i })
      ).toBeVisible();
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
