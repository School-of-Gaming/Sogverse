import { test, expect } from "@playwright/test";

// E2E coverage for the v2 admin product details pages where the Groups panel
// lives. The existing E2E suite (admin-products.spec.ts) only checks the
// unauthenticated redirect for the v1 list/add routes — there is no auth
// fixture set up to drive meaningful drag-and-drop interactions.
//
// We mirror that pattern here for the details routes so the Groups panel
// route is wired into the proxy correctly. Unit tests cover the per-action
// service methods, integration tests cover the apply route, and DB tests
// cover the apply_group_changes RPC.
//
// Adding richer Groups-panel coverage (sign in as admin, exercise DnD and
// per-action auto-save, verify the apply request) would need an auth fixture
// and seeded product data — out of scope for this PR.

test.describe("Admin Products v2 — Groups panel routes", () => {
  for (const route of [
    "/admin/consumer-clubs/some-id",
    "/admin/municipality-clubs/some-id",
    "/admin/camps/some-id",
    "/admin/events/some-id",
  ]) {
    test(`unauthenticated request to ${route} redirects to login`, async ({
      page,
    }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login\?redirect=/);
    });
  }
});
