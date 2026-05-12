import { test, expect } from "@playwright/test";
import { activate } from "./helpers";

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

    await expect(
      page.getByRole("link", { name: "Shop", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Help", exact: true })
    ).toBeVisible();
  });

  test("should navigate to register page", async ({ page }) => {
    await page.goto("/");

    await activate(page.getByRole("link", { name: /get started/i }));

    await expect(page).toHaveURL("/register");
  });

  test("should navigate to shop page", async ({ page }) => {
    await page.goto("/");

    await activate(page.getByRole("link", { name: "Shop", exact: true }));

    await expect(page).toHaveURL("/shop");
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
