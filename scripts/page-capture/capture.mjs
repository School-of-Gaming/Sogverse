/**
 * Photograph every surface in `pages.mjs`, signed in as whoever owns it.
 *
 *   node scripts/page-capture/capture.mjs [--base-url http://localhost:3002]
 *                                         [--state seed-state.json] [--out <dir>]
 *                                         [--only slug,slug] [--viewport desktop]
 *                                         [--headed]
 *
 * Drives Playwright's bundled Chromium against a running dev server, logging in
 * through the real UI for each role — no cookie forgery, no seeded storage
 * state. What comes out is a directory of PNGs plus a `manifest.json` naming
 * every one of them.
 *
 * The tool ends there, deliberately. Comparing two runs, building a before/after
 * page, deciding what to show a reviewer — none of that lives here, because it
 * differs per feature and a screenshot directory plus a manifest is the part
 * that does not.
 *
 * ## One browser, one context per role
 *
 * Signing in is the expensive step and there are only five viewers, so each gets
 * one context, logged in once, reused for every page it owns and every viewport
 * of each. A context's viewport is fixed at creation, so the run is a loop over
 * viewports on the outside and roles within — five sign-ins per viewport rather
 * than one per page.
 *
 * ## The parent is the awkward one
 *
 * A customer with no unlock cookie is bounced to `/parent/unlock` from every
 * non-exempt path — public pages included — so the parent context has to clear
 * the PIN pad before it can go anywhere. The pad has no input elements at all:
 * four digits typed at the window, and the fourth submits. And the gamer is not
 * logged into directly (a gamer's address is synthetic and has no password) —
 * the parent signs in and switches down through `/select-profile`, which is
 * exactly how a family does it.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { argOf, hasFlag, log, REPO_ROOT } from "./lib.mjs";
import { PAGES, VIEWPORTS } from "./pages.mjs";

const BASE_URL = (argOf("base-url", "http://localhost:3002") ?? "").replace(/\/$/, "");
const STATE_PATH = path.resolve(
  argOf("state", path.join(REPO_ROOT, "scripts/page-capture/seed-state.json")),
);
const ONLY = (argOf("only", "") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const VIEWPORT_FILTER = (argOf("viewport", "") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const HEADED = hasFlag("headed");

/**
 * Default output is a timestamped directory in the OS temp area, never inside
 * the repo: these are throwaway artifacts of a review, and a directory of PNGs
 * that lands in `git status` is one an absent-minded `git add -A` commits.
 */
const OUT = path.resolve(
  argOf(
    "out",
    path.join(
      process.env.TEMP ?? process.env.TMPDIR ?? "/tmp",
      "page-capture",
      new Date().toISOString().replace(/[:.]/g, "-"),
    ),
  ),
);

/**
 * Kill the Next dev-tools badge and every animation before the first paint.
 *
 * The badge is a floating overlay that lands in the corner of every full-page
 * shot, and it is the single most common way a capture ends up not being a
 * picture of the product. `nextjs-portal` is the custom element the dev overlay
 * mounts into.
 */
const CHROME_SUPPRESSION = `
  nextjs-portal { display: none !important; }
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    scroll-behavior: auto !important;
  }
  /* Carets blink, and a blinking caret is a diff between two identical runs. */
  * { caret-color: transparent !important; }
`;

function loadState() {
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf8"));
  } catch (err) {
    console.error(
      `\n  No seed state at ${STATE_PATH}\n` +
        `  Run:  node scripts/page-capture/seed.mjs\n  (${err.message})\n`,
    );
    process.exit(1);
  }
}

const state = loadState();

const selected = PAGES.filter((p) => ONLY.length === 0 || ONLY.includes(p.slug));
if (ONLY.length > 0) {
  const unknown = ONLY.filter((s) => !PAGES.some((p) => p.slug === s));
  if (unknown.length > 0) {
    console.error(`\n  Unknown slug(s): ${unknown.join(", ")}`);
    console.error(`  Known: ${PAGES.map((p) => p.slug).join(", ")}\n`);
    process.exit(1);
  }
}

const viewportNames = Object.keys(VIEWPORTS).filter(
  (n) => VIEWPORT_FILTER.length === 0 || VIEWPORT_FILTER.includes(n),
);

const manifest = {
  runId: state.runId,
  capturedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  outDir: OUT,
  seedState: STATE_PATH,
  shots: [],
  warnings: [],
};

function warn(message) {
  log.warn(message);
  manifest.warnings.push(message);
}

// ---------------------------------------------------------------------------
// Sign-in flows, one per viewer
// ---------------------------------------------------------------------------

const { parent, gedu, admin, gamers } = state.accounts;

async function signInThroughTheUI(page, email) {
  // `networkidle`, not `domcontentloaded`: the form's submit handler is React's,
  // so a click landing before hydration falls through to a native form submit
  // and the browser simply reloads /login. That failure looks exactly like bad
  // credentials from the outside, which is what makes it worth naming here.
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(state.password);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 }),
    page.getByRole("button", { name: "Sign In" }).click(),
  ]);
}

/**
 * Clear the parent PIN gate.
 *
 * `/parent` is where the gate reliably fires, so this navigates there rather
 * than waiting to be bounced from wherever the first captured page happened to
 * be. The pad listens on `window` for digit keys and commits on the fourth, so
 * typing is the whole interaction — there is no submit button to press.
 */
async function unlockParentPin(page) {
  await page.goto(`${BASE_URL}/parent`, { waitUntil: "networkidle", timeout: 60_000 });
  if (!page.url().includes("/parent/unlock")) return;

  await page.waitForSelector('[role="status"]', { timeout: 15_000 });
  await page.keyboard.type(state.pin, { delay: 60 });
  await page.waitForURL((u) => !u.pathname.includes("/unlock"), { timeout: 30_000 });
}

const VIEWERS = {
  public: async () => {},

  parent: async (page) => {
    await signInThroughTheUI(page, parent.email);
    await unlockParentPin(page);
  },

  // A gamer has no password by design — the account is entered by switching
  // down from the parent, which is what this does. The tile's accessible name
  // is the identicon's label plus the first name, so a substring match on the
  // name is the locator.
  gamer: async (page) => {
    await signInThroughTheUI(page, parent.email);
    await page.goto(`${BASE_URL}/select-profile`, { waitUntil: "networkidle", timeout: 60_000 });
    await Promise.all([
      page.waitForURL(`${BASE_URL}/gamer`, { timeout: 30_000 }),
      page.getByRole("button", { name: gamers[0].firstName }).click(),
    ]);
  },

  gedu: async (page) => signInThroughTheUI(page, gedu.email),
  admin: async (page) => signInThroughTheUI(page, admin.email),
};

// ---------------------------------------------------------------------------

async function main() {
  mkdirSync(OUT, { recursive: true });

  console.log(`\nPage capture`);
  console.log(`  base URL : ${BASE_URL}`);
  console.log(`  state    : ${STATE_PATH} (run ${state.runId})`);
  console.log(`  out      : ${OUT}`);
  console.log(`  pages    : ${selected.length} × ${viewportNames.length} viewport(s)\n`);

  await assertServerIsUp();

  const browser = await chromium.launch({
    headless: !HEADED,
    // Always on, not only for the voice pass: they are inert on a page that
    // never asks for a device, and a room that silently fails to join because
    // a permission prompt was waiting is a much worse failure than a flag that
    // did nothing.
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });

  try {
    for (const viewportName of viewportNames) {
      const pagesHere = selected.filter(
        (p) => (p.viewports ?? viewportNames).includes(viewportName),
      );
      if (pagesHere.length === 0) continue;

      const roles = [...new Set(pagesHere.map((p) => p.as))];
      for (const role of roles) {
        await captureRole({ browser, role, viewportName, pages: pagesHere.filter((p) => p.as === role) });
      }
    }
  } finally {
    await browser.close();
  }

  writeFileSync(path.join(OUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`\n${manifest.shots.length} shot(s) → ${OUT}`);
  if (manifest.warnings.length > 0) {
    console.log(`${manifest.warnings.length} warning(s):`);
    for (const w of manifest.warnings) console.log(`  ! ${w}`);
  }
  console.log("");
}

async function captureRole({ browser, role, viewportName, pages }) {
  log.step(`${role} @ ${viewportName} — ${pages.length} page(s)`);

  const context = await browser.newContext({
    viewport: {
      width: VIEWPORTS[viewportName].width,
      height: VIEWPORTS[viewportName].height,
    },
    deviceScaleFactor: VIEWPORTS[viewportName].deviceScaleFactor,
    isMobile: VIEWPORTS[viewportName].isMobile ?? false,
    hasTouch: VIEWPORTS[viewportName].hasTouch ?? false,
    // Pin the locale. Copy length differs enough between locales to change a
    // layout, so a shot whose language depends on the machine's Accept-Language
    // is not comparable with anything.
    locale: "en-US",
    timezoneId: state.timezone,
    permissions: ["microphone", "camera"],
    reducedMotion: "reduce",
  });
  await context.addInitScript(
    ([css]) => {
      const apply = () => {
        const style = document.createElement("style");
        style.textContent = css;
        document.head?.appendChild(style);
      };
      if (document.head) apply();
      else document.addEventListener("DOMContentLoaded", apply, { once: true });
    },
    [CHROME_SUPPRESSION],
  );
  // next-intl reads the locale cookie ahead of Accept-Language, so set both.
  await context.addCookies([
    { name: "locale", value: "en", url: BASE_URL },
  ]);

  const page = await context.newPage();

  try {
    await VIEWERS[role](page);
  } catch (err) {
    warn(`${role} @ ${viewportName}: sign-in failed (${err.message}) — skipping ${pages.length} page(s)`);
    await context.close();
    return;
  }

  for (const spec of pages) {
    await captureOne({ page, spec, viewportName });
  }

  await context.close();
}

async function captureOne({ page, spec, viewportName }) {
  const route = typeof spec.route === "function" ? spec.route(state) : spec.route;
  const file = `${spec.slug}.${viewportName}.png`;
  const filePath = path.join(OUT, file);

  const record = {
    slug: spec.slug,
    route,
    role: spec.as,
    viewport: viewportName,
    size: VIEWPORTS[viewportName],
    fullPage: spec.fullPage !== false,
    file,
    path: filePath,
    notes: spec.notes ?? null,
  };

  try {
    await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle", timeout: 45_000 });

    if (spec.voice) {
      await settleVoiceRoom(page);
    }
    if (spec.waitFor) {
      await page.waitForSelector(spec.waitFor, { timeout: 20_000 });
    }

    // Land on a settled page rather than a settled network: fonts decide
    // layout, and a shot taken before they swap photographs a different
    // design from the one under review.
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);

    const landed = new URL(page.url()).pathname;
    if (landed !== route.split("?")[0]) {
      record.landedOn = landed;
      warn(`${spec.slug}: asked for ${route}, landed on ${landed}`);
    }

    await page.screenshot({
      path: filePath,
      fullPage: spec.fullPage !== false,
      animations: "disabled",
    });

    record.ok = true;
    manifest.shots.push(record);
    log.ok(`${file}${record.landedOn ? `  (redirected → ${record.landedOn})` : ""}`);
  } catch (err) {
    record.ok = false;
    record.error = err.message;
    manifest.shots.push(record);
    // A failed page is a warning, never the end of the run: a capture pass that
    // aborts on page nine has cost more than it saved.
    warn(`${spec.slug} @ ${viewportName}: ${err.message}`);
  }
}

/**
 * Wait for the room to actually be in the call.
 *
 * The page auto-joins on mount — it fetches a token, then connects — so there
 * is nothing to click. What there is, is a spinner that has to go away, and
 * three ways this can fail that are not bugs in the page: the Daily keys may be
 * missing from the environment, the session window may have closed while the
 * capture was running, and Daily is a third party that can simply be slow. All
 * three are reported and shot anyway — a picture of the failure state is more
 * useful than no picture and a stack trace.
 */
async function settleVoiceRoom(page) {
  // The Leave control only exists once the room is rendered, which makes it the
  // honest "we are in the call" marker — the page has no test id, and reaching
  // for one it does not have would be a selector that silently never matches.
  const leaveButton = page.getByRole("button", { name: "Leave" }).first();
  try {
    await leaveButton.waitFor({ state: "visible", timeout: 45_000 });
  } catch {
    const text = (await page.textContent("body").catch(() => "")) ?? "";
    if (/failed to join|not available|ended/i.test(text)) {
      warn(
        "voice room: the page is showing a failure state rather than a joined room — " +
          "check DAILY_API_KEY / NEXT_PUBLIC_DAILY_DOMAIN, and that the seeded session " +
          "window has not closed since the seed ran.",
      );
    } else {
      warn("voice room: no Leave control appeared; shooting whatever is on screen.");
    }
  }
  // Video tiles and the participant rail settle a beat after the join event.
  await page.waitForTimeout(3_000);
}

async function assertServerIsUp() {
  try {
    const res = await fetch(BASE_URL, { redirect: "manual" });
    if (res.status >= 500) throw new Error(`responded ${res.status}`);
  } catch (err) {
    console.error(
      `\n  Nothing usable at ${BASE_URL} (${err.message}).\n` +
        `  Start one with:  node scripts/page-capture/serve.mjs --port 3002\n` +
        `  or point at a server you already have with --base-url.\n`,
    );
    process.exit(1);
  }
}

await main();
