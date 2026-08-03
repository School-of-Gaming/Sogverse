import { defineConfig } from "@playwright/test";

// Playwright drives one thing here: a smoke check that a production build boots
// and serves the security headers and per-request CSP the proxy is supposed to
// set. The specs use the `request` fixture only — no page, no browser — so there
// is no device matrix, no engine matrix, and no browser binaries to install.
//
// PORT lets a local run avoid a dev server already holding the default; CI takes
// the default.
const port = Number(process.env.PORT ?? 3000);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests/smoke",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // No retries, in CI or out. Every assertion is a deterministic check on an HTTP
  // response header, so a failure is a regression rather than flake, and retrying
  // it would only turn a real signal into an intermittent one.
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL,
  },
  projects: [{ name: "smoke" }],
  // Serving the real production build is the point: it is what makes this a check
  // on the shipped artifact rather than on dev-mode middleware.
  webServer: {
    command: `npm run start -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
