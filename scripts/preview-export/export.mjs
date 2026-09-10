/**
 * Export a set of app pages — as the staging admin, in several locales, at both
 * widths — into **a handful of images you can drop into a Slack thread**.
 *
 * The owner's words for what it is for: *"It works well if I need to see a lot
 * of versions of a page with a given account and it would be too many steps to
 * do it manually. It's not only for checking copy but also a UI layout. UI
 * Previews already does most of this for me. This is mostly adding the
 * convenience so I can export some UI as a single view to share it in a
 * review."* And for the shape of the output: *"it's more like I want a digitally
 * rendered static preview of web pages in a single output format that someone
 * can easily view in Slack."*
 *
 * So the tool is generic and the *list of pages is the input*: a *preset* names
 * the surfaces, and the tool signs in once, walks them, shoots each one, and
 * composes them into one image per group. `presets/topic-copy.mjs` is the first
 * one; a second review is a second preset, not a second script.
 *
 *   node scripts/preview-export/export.mjs --preset topic-copy
 *   node scripts/preview-export/export.mjs --preset topic-copy --locales en,fi --viewports mobile
 *   node scripts/preview-export/export.mjs --pages ./my-pages.mjs --only minecraft_java--about
 *   node scripts/preview-export/export.mjs --selftest       # no app, no login
 *
 * Everything lands in `scripts/output/preview-export/<preset>-<date>/`: the
 * composites as `<nn>-<group>.jpg`, an `index.html` that scrolls through them,
 * and every capture at full resolution as `<slug>--<locale>--<viewport>.png`, so
 * one page can be pasted on its own.
 *
 * ## What a preset looks like
 *
 * A module whose default export is
 *
 *   { title, description, groups: [ { label, entries: [entry, …] } ] }
 *
 * and an entry is
 *
 *   {
 *     slug,                      // unique; names the PNG
 *     label?,                    // how the composite labels this block
 *     route,                     // "/preview/…" or (locale) => "/preview/…";
 *                                //   the /{locale}/ prefix is added for you
 *     capture,                   // "viewport" | "fullPage" | { selector }
 *     waitFor?,                  // a selector to wait for before shooting
 *   }
 *
 * **A group is one image**, so grouping is how a preset decides what a reader
 * receives as a unit — and the tool refuses more than ten groups, because ten
 * files is what one Slack message takes.
 *
 * ## Sign-in, and the one guard
 *
 * `/preview/*` and every dashboard are gated, so the run needs an admin account
 * on staging (which is what local dev points at). It reads
 * **`STAGING_ADMIN_EMAIL`** and **`STAGING_ADMIN_PASSWORD`** from `.env.local`
 * (the shell wins if it exports them), drives the real login form once, and
 * reuses that session for every shot. Neither value is ever printed.
 *
 * Because it types that password into whatever `--base` names, `--base` is
 * checked against a loopback allowlist before the browser starts, and there is
 * no override flag.
 *
 * ## The sibling
 *
 * `scripts/page-capture/` (on `feat/brand-palette-design-pass`) photographs the
 * whole app per role against a seeded staging fleet. Different job — whole
 * pages, one language, a directory of PNGs — but the same machinery underneath,
 * so this tool copies its **viewports verbatim**, its **loopback guard**, and
 * its **locale-cookie pinning**. When that branch lands, the sign-in and the
 * guard belong in its `lib.mjs` and this file should import them rather than
 * keep a second copy.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";
import { outputDir } from "../lib/output.mjs";

const TOOL_DIR = import.meta.dirname;
const REPO_ROOT = path.resolve(TOOL_DIR, "..", "..");

// A preset may import the app's TypeScript registries directly (Node strips the
// types), which makes Node warn that the `.ts` file has no `"type": "module"`
// beside it. It loads as ESM anyway, and four lines of that above every run
// buries the summary. Filtered rather than silenced: anything else still prints.
process.removeAllListeners("warning");
process.on("warning", (warning) => {
  if (warning.code !== "MODULE_TYPELESS_PACKAGE_JSON") console.warn(warning);
});

// ---------------------------------------------------------------------------
// Environment and flags
// ---------------------------------------------------------------------------

/** Load .env.local without clobbering the shell — the shell always wins. */
function loadEnvLocal() {
  const p = path.join(REPO_ROOT, ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

const list = (value) =>
  (value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

const SELFTEST = process.argv.includes("--selftest");

/**
 * The hosts this tool may point a browser at — **loopback only, and there is no
 * override flag.**
 *
 * The run types a real admin password into the login form at whatever `--base`
 * names, so that one flag decides who receives a working staging credential. A
 * typo, a URL pasted out of a chat message or a copied command line is all it
 * would take to hand it to a stranger's server, and the person running it would
 * see nothing but an ordinary sign-in failure afterwards.
 *
 * Same list, same reasoning and the same absent flag as `assertCaptureOrigin`
 * in `scripts/page-capture/lib.mjs`. A deployed origin, if one is ever wanted,
 * is added here as a literal — never as a flag, an environment variable, or a
 * suffix pattern, since anyone can register a hostname that ends the right way.
 */
const ALLOWED_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

function assertLoopback(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    fail(
      `--base is not a URL: ${raw}\n  Expected something like http://localhost:3005`,
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    fail(`--base must be http or https, not "${parsed.protocol}" (${raw}).`);
  }
  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    fail(
      `--base points at "${parsed.hostname}", which is not a local dev server\n` +
        `  (allowed: ${ALLOWED_HOSTS.join(", ")}, on any port).\n` +
        `  This run signs in with a real staging admin password, so it only ever\n` +
        `  types it into a server on this machine. There is no override flag.`,
    );
  }
  return parsed.origin;
}

const BASE = assertLoopback(arg("base", "http://localhost:3005"));

/** `tlh` is the Klingon easter egg — a test locale, never a review locale. */
const LOCALES = list(arg("locales", "en,fi,sv,fr"));
const ONLY = list(arg("only"));

/**
 * The two widths, **copied from `scripts/page-capture/pages.mjs` exactly.** Two
 * tools photographing the same app at two different "mobile" widths produce
 * pictures nobody can lay side by side, and which of 360 and 390 is the truer
 * phone is not a question worth having two answers to.
 */
const ALL_VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, deviceScaleFactor: 1 },
  {
    name: "mobile",
    width: 360,
    height: 800,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
];

const wanted = list(arg("viewports"));
const VIEWPORTS =
  wanted.length > 0
    ? ALL_VIEWPORTS.filter((v) => wanted.includes(v.name))
    : ALL_VIEWPORTS;
if (VIEWPORTS.length === 0) {
  fail(
    `--viewports names none of the known widths ` +
      `(${ALL_VIEWPORTS.map((v) => v.name).join(", ")}).`,
  );
}

// ---------------------------------------------------------------------------
// The preset
// ---------------------------------------------------------------------------

const PRESET_NAME = arg("preset", SELFTEST ? "selftest" : "topic-copy");

async function loadPreset() {
  // `--pages` is the escape hatch for a one-off list nobody wants to commit;
  // `--preset` is the committed, named form. Both land on the same shape.
  const pagesFlag = arg("pages");
  const file = pagesFlag
    ? path.resolve(process.cwd(), pagesFlag)
    : path.join(TOOL_DIR, "presets", `${PRESET_NAME}.mjs`);
  if (!existsSync(file)) {
    fail(
      `No preset at ${file}.\n` +
        `  Pass --preset <name> for a module under scripts/preview-export/presets/,\n` +
        `  or --pages <path> for one of your own.`,
    );
  }
  const module = await import(pathToFileURL(file).href);
  const preset = module.default;
  if (!preset?.groups) {
    fail(`${file} has no default export with a \`groups\` array.`);
  }
  return preset;
}

/** Every shot the run will attempt, in the order the sheet prints them. */
function planShots(preset) {
  const shots = [];
  for (const group of preset.groups) {
    for (const entry of group.entries) {
      if (ONLY.length > 0 && !ONLY.includes(entry.slug)) continue;
      for (const locale of LOCALES) {
        const route =
          typeof entry.route === "function" ? entry.route(locale) : entry.route;
        for (const viewport of VIEWPORTS) {
          shots.push({
            group: group.label,
            slug: entry.slug,
            label: entry.label ?? entry.slug,
            notes: entry.notes ?? null,
            capture: entry.capture ?? "viewport",
            waitFor: entry.waitFor ?? null,
            locale,
            viewport: viewport.name,
            url: `${BASE}/${locale}${route}`,
            file: `${entry.slug}--${locale}--${viewport.name}.png`,
          });
        }
      }
    }
  }
  return shots;
}

// ---------------------------------------------------------------------------
// Sign-in
// ---------------------------------------------------------------------------

/**
 * Asserted before anything is launched or planned, because the whole run is
 * worthless without it — every page it wants is behind the gate.
 */
function credentials() {
  const email = process.env.STAGING_ADMIN_EMAIL;
  const password = process.env.STAGING_ADMIN_PASSWORD;
  if (!email || !password) {
    fail(
      "STAGING_ADMIN_EMAIL and STAGING_ADMIN_PASSWORD must be set in " +
        ".env.local (or the environment). They are an admin account on " +
        "staging; the pages this tool exports are gated and it cannot see a " +
        "single one without them.",
    );
  }
  return { email, password };
}

async function signIn(context) {
  const { email, password } = credentials();

  const page = await context.newPage();
  await page.goto(`${BASE}/en/login`, { waitUntil: "domcontentloaded" });
  /**
   * **Wait for React to own the form before touching it.**
   *
   * This is the one race that actually bites: the dev server compiles a route
   * on first request (and again whenever something it depends on is edited
   * mid-run — a translator saving `messages/fi.json` is enough), and the
   * document is served and interactive-looking well before hydration attaches
   * the submit handler. A click that lands in that window does a plain native
   * form submit back to `/login`: no request to the auth endpoint, no alert, no
   * navigation, and — because the reload empties the fields — nothing a retry
   * can pick up either. The run then waits out its whole timeout and blames the
   * password, which is the one explanation that is certainly wrong.
   *
   * React marks every DOM node it owns with a `__react*` expando, so that is
   * the honest signal that hydration has reached this form. Sixty seconds
   * because a cold Next dev compile of this route genuinely takes half of one.
   */
  await page
    .waitForFunction(
      () => {
        const field = document.querySelector("#identifier");
        return !!field && Object.keys(field).some((k) => k.startsWith("__react"));
      },
      { timeout: 60_000 },
    )
    .catch(() => {
      fail(
        `The login form at ${BASE} never hydrated within 60s.\n` +
          "  Is the dev server up, and did it finish compiling?",
      );
    });

  await page.fill("#identifier", email);
  await page.fill("#password", password);

  // Filtered to alerts that actually say something: the page carries an empty
  // live region at all times, and an unfiltered `.first()` matches that one —
  // already visible, so the wait below would resolve instantly and report a
  // failure as a blank line.
  const alert = page.locator('[role="alert"]').filter({ hasText: /\S/ }).first();

  await page.click('button[type="submit"]');

  // Success is a full-page navigation off /login; failure paints the form's own
  // alert. Race them rather than waiting on one and timing out on the other, so
  // a wrong password is reported in seconds and in words.
  await Promise.race([
    page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 30_000 }),
    alert.waitFor({ state: "visible", timeout: 30_000 }),
  ]).catch(() => {});

  // Read the form's own words now, while the login document is still loaded —
  // the probe below navigates away and takes them with it.
  const message = (await alert.count())
    ? await alert.innerText().catch(() => "")
    : "";

  // **Wait for the session cookie, not for the navigation.** The proxy gates on
  // the Supabase session cookie, and the sign-in writes that cookie and then
  // navigates — two asynchronous things, in that order but not atomically. A
  // probe fired between them is bounced to /login and looks exactly like a
  // wrong password, which is a confusing thing to be told when the password was
  // right. Waiting on the cookie itself is the condition that actually matters;
  // a fixed sleep would be a guess, and a retry loop around the probe would be
  // hiding the race rather than naming it.
  const deadline = Date.now() + 15_000;
  let session = false;
  while (Date.now() < deadline) {
    const jar = await context.cookies();
    if (jar.some((c) => /^sb-.*auth-token/.test(c.name))) {
      session = true;
      break;
    }
    await page.waitForTimeout(250);
  }

  // The proof is not the cookie either — it is whether a gated page answers. An
  // account without the admin role holds a perfectly good session and is still
  // bounced by the proxy.
  await page.goto(`${BASE}/en/preview/products/consumer-club`, {
    waitUntil: "domcontentloaded",
  });
  if (page.url().includes("/login")) {
    await page.close();
    fail(
      "Sign-in failed — a gated page still redirects to the login page.\n" +
        (message ? `  The login form said: ${message.trim()}\n` : "") +
        `  A Supabase session cookie was ${
          session ? "written, so the account signed in but is not an admin" : "never written"
        }.\n` +
        "  Check STAGING_ADMIN_EMAIL / STAGING_ADMIN_PASSWORD, and that the " +
        "account has the admin role.",
    );
  }
  await page.close();
}

// ---------------------------------------------------------------------------
// Taking the shots
// ---------------------------------------------------------------------------

async function shoot(page, shot) {
  // Belt and braces on the language. The `/{locale}/` prefix is the authority,
  // but next-intl reads the `locale` cookie ahead of `Accept-Language`, and the
  // sign-in seeds that cookie from the admin's own profile — so one redirect
  // through a bare path mid-run could otherwise flip a shot into the wrong
  // language and label it with the right one. The sibling page-capture tool
  // pins the cookie for the same reason.
  await page
    .context()
    .addCookies([{ name: "locale", value: shot.locale, url: BASE }]);
  await page.goto(shot.url, { waitUntil: "domcontentloaded" });
  // Network idle plus fonts: a shot taken mid-webfont-swap measures and reads
  // differently from the page the reviewer is being asked about.
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});

  if (shot.waitFor) {
    await page
      .locator(shot.waitFor)
      .first()
      .waitFor({ state: "visible", timeout: 10_000 })
      .catch(() => {});
  }

  const dest = path.join(OUT, shot.file);

  if (shot.capture === "viewport" || shot.capture === "fullPage") {
    await page.screenshot({
      path: dest,
      fullPage: shot.capture === "fullPage",
    });
    // Measured off the file rather than off the viewport: a full-page shot is
    // as tall as the document, which is the number the sheet has to lay out
    // with, and only the PNG knows it.
    const meta = await sharp(dest).metadata();
    const scale =
      VIEWPORTS.find((v) => v.name === shot.viewport)?.deviceScaleFactor ?? 1;
    return {
      ...shot,
      state: "ok",
      width: Math.round(meta.width / scale),
      height: Math.round(meta.height / scale),
    };
  }

  const target = page.locator(shot.capture.selector).first();
  try {
    await target.waitFor({ state: "visible", timeout: 8_000 });
  } catch {
    // Not a failure: a surface that renders nothing for this entry is a real
    // answer — a topic with no About card, a panel a state does not draw — and
    // the sheet says so rather than the run stopping.
    return { ...shot, state: "no-card" };
  }

  await hideStickyChrome(target);
  const box = await target.boundingBox();
  await target.screenshot({ path: dest });
  await restoreStickyChrome(page);

  return {
    ...shot,
    state: "ok",
    width: Math.round(box?.width ?? 0),
    height: Math.round(box?.height ?? 0),
  };
}

/**
 * Stop the page's pinned chrome painting over a tall element capture.
 *
 * An element taller than the viewport is shot by scrolling and stitching, and
 * the site header is `position: sticky top-0` — so it stays put while the
 * card moves under it and lands **in the middle of the picture**, once per
 * screenful. The first real run put the whole header across the third step of
 * the Fortnite guide.
 *
 * **Which elements those are is computed, not guessed.** A selector list
 * (`header`, `.sticky`, `[data-sticky]`) is a guess that goes stale the moment
 * something else is pinned, and there is no stable handle on the header to key
 * off — `SiteHeaderShell` renders a plain `<header>` with utility classes. So
 * this asks the browser which elements are actually `sticky` or `fixed` right
 * now, and hides those. Exact, and it keeps working when a new pinned thing
 * appears.
 *
 * It hides with `visibility` and nothing else. `display: none` or
 * `position: static` would reflow the document — a sticky element reserves its
 * slot in flow — and the card would be measured and shot at a different size
 * than the page really renders it. `visibility: hidden` changes what is
 * painted and nothing about the layout, which is exactly the difference wanted.
 *
 * Ancestors of the target are skipped: hiding one would hide the card itself.
 */
const STICKY_MARK = "data-preview-export-hidden";

async function hideStickyChrome(target) {
  await target.evaluate((el, mark) => {
    for (const node of el.ownerDocument.querySelectorAll("body *")) {
      if (node === el || el.contains(node) || node.contains(el)) continue;
      const position = getComputedStyle(node).position;
      if (position !== "sticky" && position !== "fixed") continue;
      node.setAttribute(mark, node.style.visibility);
      node.style.setProperty("visibility", "hidden", "important");
    }
  }, STICKY_MARK);
}

/**
 * Put it back. Every shot is preceded by a fresh navigation, which would drop
 * these changes anyway — but a page that is left as it was found cannot be the
 * reason a later shot looks wrong, and that is worth four lines.
 */
async function restoreStickyChrome(page) {
  await page.evaluate((mark) => {
    for (const node of document.querySelectorAll(`[${mark}]`)) {
      node.style.visibility = node.getAttribute(mark);
      node.removeAttribute(mark);
    }
  }, STICKY_MARK);
}

// ---------------------------------------------------------------------------
// The composites — the thing this tool actually produces
// ---------------------------------------------------------------------------

/**
 * One image per group, and that image *is* the deliverable.
 *
 * The owner's words, after a PDF version: *"PDF makes it seem like I want a
 * series of paper pages. Think of it this way, it's more like I want a digitally
 * rendered static preview of web pages in a single output format that someone
 * can easily view in Slack."* So a group is composed into one tall JPEG — for
 * each of its entries, the four phone captures side by side as full
 * scroll-height strips (the usual way a mobile layout is showcased on a static
 * page), the desktop pages beneath them two-up — on the app's own background
 * colour, so the picture reads as the product rather than as a scan of it.
 *
 * **Ten files, each under ten megabytes.** That is not a rule of thumb: the
 * workspace is on Slack's free plan, which takes ten files per message, so a run
 * that produces eleven composites is a review that has to be posted twice and
 * read out of order. It is enforced below rather than advised, because the
 * moment it is only advice is the moment a preset quietly grows a group.
 */
const MOBILE_DISPLAY_WIDTH = 500;
const COMPOSITE_PAD = 16;
const COMPOSITE_GUTTER = 12;
const PER_ROW = { mobile: 4, desktop: 2 };
const ENTRY_LABEL_HEIGHT = 40;
const HEADING_HEIGHT = 64;
const LABEL_HEIGHT = 26;

/** Four phones across settles the width; two desktops then fill the same span. */
const CONTENT_WIDTH =
  PER_ROW.mobile * MOBILE_DISPLAY_WIDTH +
  (PER_ROW.mobile - 1) * COMPOSITE_GUTTER;
const COMPOSITE_WIDTH = CONTENT_WIDTH + 2 * COMPOSITE_PAD;
const COMPOSITE_WIDTHS = {
  mobile: MOBILE_DISPLAY_WIDTH,
  desktop: Math.floor(
    (CONTENT_WIDTH - (PER_ROW.desktop - 1) * COMPOSITE_GUTTER) / PER_ROW.desktop,
  ),
};

const SLACK_FILES_PER_MESSAGE = 10;
const MAX_COMPOSITE_BYTES = 10e6;
/** Tried in order until one lands under the cap; the last is the last chance. */
const QUALITY_LADDER = [85, 75, 65];
/** JPEG cannot address a dimension past this, whatever the file size says. */
const JPEG_MAX_DIMENSION = 65_535;

/**
 * The app's own colours, read from the UI package's token sheet rather than
 * copied here — a composite on a white ground looks like a document about the
 * product, and one on `--color-background` looks like the product. Falls back
 * to the current values if the sheet ever moves, because a screenshot run is
 * not a thing that should fail over a colour.
 */
function themeColors() {
  const fallback = {
    background: "#121212",
    foreground: "#EDEDED",
    muted: "#A6A6A6",
  };
  try {
    const css = readFileSync(
      path.join(REPO_ROOT, "packages", "sog-ui", "src", "tokens", "theme.css"),
      "utf8",
    );
    const read = (name, or) =>
      new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{3,8})`).exec(css)?.[1] ?? or;
    return {
      background: read("background", fallback.background),
      foreground: read("foreground", fallback.foreground),
      muted: read("muted-foreground", fallback.muted),
    };
  } catch {
    return fallback;
  }
}

const COLORS = themeColors();

const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );

/**
 * Lay out one group: where every picture goes, what every label says, and how
 * tall the result is.
 *
 * Pure arithmetic over sizes already known from the PNGs, so the canvas can be
 * created at its final size before a single pixel is resized — and so a group
 * that would exceed what a JPEG can address is caught by measuring rather than
 * after twenty seconds of encoding.
 */
/**
 * Phones first, desktops beneath — whatever order the viewport list happens to
 * be in. The phone width is where a translated line wraps into three and where
 * a card runs off the fold, so it is what the reader should meet at the top of
 * the picture; the desktop view is the check that it also holds up wide.
 */
function rowOrder() {
  const names = VIEWPORTS.map((v) => v.name);
  const preferred = ["mobile", "desktop"].filter((n) => names.includes(n));
  return [...preferred, ...names.filter((n) => !preferred.includes(n))];
}

function planComposite(shots, title) {
  const placements = [];
  const captions = [];
  let y = COMPOSITE_PAD + HEADING_HEIGHT;

  for (const slug of [...new Set(shots.map((s) => s.slug))]) {
    const entry = shots.filter((s) => s.slug === slug);
    captions.push({ text: entry[0].label, top: y + 22, kind: "entry" });
    y += ENTRY_LABEL_HEIGHT;

    for (const viewport of rowOrder()) {
      const row = LOCALES.flatMap((locale) =>
        entry.filter((s) => s.locale === locale && s.viewport === viewport),
      ).filter((s) => s.state === "ok");
      if (row.length === 0) continue;

      const width = COMPOSITE_WIDTHS[viewport];
      for (let i = 0; i < row.length; i += PER_ROW[viewport]) {
        const chunk = row.slice(i, i + PER_ROW[viewport]);
        let x = COMPOSITE_PAD;
        let tallest = 0;
        for (const shot of chunk) {
          // Top-aligned, and each strip keeps its own aspect: a page twice as
          // long as its neighbour should look twice as long.
          const height = Math.round((shot.height * width) / shot.width);
          captions.push({
            text: `${shot.locale} · ${shot.viewport}`,
            left: x,
            top: y + 17,
            kind: "shot",
          });
          placements.push({ shot, left: x, top: y + LABEL_HEIGHT, width, height });
          tallest = Math.max(tallest, height);
          x += width + COMPOSITE_GUTTER;
        }
        y += LABEL_HEIGHT + tallest + COMPOSITE_GUTTER;
      }
    }
  }

  return {
    title,
    placements,
    captions,
    height: y + COMPOSITE_PAD - COMPOSITE_GUTTER,
  };
}

/** The heading and every label, as one SVG laid over the whole canvas. */
function labelLayer(plan, subtitle) {
  const text = plan.captions
    .map(
      (c) =>
        `<text x="${c.left ?? COMPOSITE_PAD}" y="${c.top}" class="${
          c.kind === "entry" ? "e" : "l"
        }">${esc(c.text)}</text>`,
    )
    .join("");
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${COMPOSITE_WIDTH}" height="${plan.height}">
      <style>
        .h { fill: ${COLORS.foreground}; font: 600 32px sans-serif; }
        .s { fill: ${COLORS.muted}; font: 400 20px sans-serif; }
        .e { fill: ${COLORS.foreground}; font: 600 22px sans-serif; }
        .l { fill: ${COLORS.muted}; font: 400 17px sans-serif; }
      </style>
      <text x="${COMPOSITE_PAD}" y="${COMPOSITE_PAD + 30}" class="h">${esc(
        plan.title,
      )}</text>
      <text x="${COMPOSITE_PAD}" y="${COMPOSITE_PAD + 56}" class="s">${esc(
        subtitle,
      )}</text>
      ${text}
    </svg>`,
  );
}

/**
 * Encode one planned composite, dropping quality a step at a time until it fits
 * what Slack will take.
 *
 * Failing is the right end of the ladder. A composite over the cap is a file the
 * workspace refuses, so writing it anyway would hand the owner a folder that
 * looks complete and cannot be posted — the failure has to happen here, naming
 * the group, while there is still something to do about it.
 */
async function renderComposite(plan, subtitle, dir, file) {
  if (plan.height > JPEG_MAX_DIMENSION) {
    fail(
      `"${plan.title}" composes to ${plan.height}px tall, past what a JPEG can ` +
        `address (${JPEG_MAX_DIMENSION}px).\n` +
        `  Split the group in the preset, or run fewer locales.`,
    );
  }

  const layers = [];
  for (const p of plan.placements) {
    layers.push({
      input: await sharp(path.join(dir, p.shot.file))
        .resize({ width: p.width })
        .toBuffer(),
      left: p.left,
      top: p.top,
    });
  }
  layers.push({ input: labelLayer(plan, subtitle), left: 0, top: 0 });

  const canvas = sharp({
    create: {
      width: COMPOSITE_WIDTH,
      height: plan.height,
      channels: 3,
      background: COLORS.background,
    },
  }).composite(layers);

  const target = path.join(dir, file);
  let size = 0;
  for (const quality of QUALITY_LADDER) {
    await canvas.clone().jpeg({ quality, mozjpeg: true }).toFile(target);
    size = statSync(target).size;
    if (size <= MAX_COMPOSITE_BYTES) {
      return { file, width: COMPOSITE_WIDTH, height: plan.height, size, quality };
    }
  }

  fail(
    `"${plan.title}" is ${(size / 1e6).toFixed(1)} MB even at quality ` +
      `${QUALITY_LADDER.at(-1)}, past the ${MAX_COMPOSITE_BYTES / 1e6} MB a ` +
      `Slack upload takes.\n` +
      `  Split the group in the preset, or run fewer locales.`,
  );
}

/**
 * A group label as a file name. Accents are folded rather than dropped —
 * without the decomposition step "Pokémon GO" becomes `pok-mon-go`, which is
 * the kind of thing nobody notices until it is in a file list in front of the
 * team.
 */
const slugify = (s) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * Every group, composed, in preset order. Returns what was written.
 *
 * **Grouping is the preset's decision, not this function's.** An entry names
 * the group it belongs to, and one group is one composite — which is how the
 * topic review ends up as eight files (one per topic, its About views and its
 * guides stacked inside) rather than nineteen.
 */
async function buildComposites(shots, dir) {
  const groups = [...new Set(shots.map((s) => s.group))];
  if (groups.length > SLACK_FILES_PER_MESSAGE) {
    fail(
      `This preset declares ${groups.length} groups, and a Slack message takes ` +
        `${SLACK_FILES_PER_MESSAGE} files.\n` +
        `  Merge groups in the preset so one message carries the whole review.`,
    );
  }

  const written = [];
  for (const [index, group] of groups.entries()) {
    const mine = shots.filter((s) => s.group === group);
    const notes = mine.filter((s) => s.state !== "ok");
    const subtitle =
      notes.length > 0
        ? `${LOCALES.join("  ·  ")}    (${notes.length} of ${
            mine.length
          } captures had nothing to shoot or failed)`
        : LOCALES.join("  ·  ");
    const file = `${String(index + 1).padStart(2, "0")}-${slugify(group)}.jpg`;
    written.push(
      await renderComposite(planComposite(mine, group), subtitle, dir, file),
    );
  }
  return written;
}

/**
 * A plain scrolling column of every composite, for reading the run back
 * locally. Deliberately not a design: the composites are the artefact and this
 * is the window they are looked at through.
 */
function writeIndex(dir, composites, meta) {
  const rows = composites
    .map(
      (c) =>
        `<figure><figcaption>${esc(c.file)} · ${c.width}×${c.height} · ${(
          c.size / 1e6
        ).toFixed(1)} MB</figcaption><img src="${esc(c.file)}" alt="${esc(
          c.file,
        )}"></figure>`,
    )
    .join("\n");
  const html = `<!doctype html><html><head><meta charset="utf-8">
    <title>${esc(meta.title)}</title>
    <style>
      body { margin: 0; padding: 24px; background: ${COLORS.background};
             color: ${COLORS.foreground};
             font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; }
      h1 { font-size: 20px; margin: 0 0 4px; }
      p.meta { color: ${COLORS.muted}; margin: 0 0 24px; }
      figure { margin: 0 0 32px; }
      figcaption { color: ${COLORS.muted}; font-size: 12px; margin: 0 0 6px; }
      img { display: block; width: 100%; height: auto; }
    </style></head>
    <body>
      <h1>${esc(meta.title)}</h1>
      <p class="meta">${esc(meta.date)} · ${esc(meta.base)} · ${esc(
        meta.branch,
      )} (${esc(meta.sha)}) · preset ${esc(meta.preset)} · ${esc(
        LOCALES.join(", "),
      )} · ${esc(String(meta.ok))} captured, ${esc(
        String(meta.noCard),
      )} with nothing to shoot, ${esc(String(meta.failed))} failed</p>
      ${rows}
    </body></html>`;
  const file = path.join(dir, "index.html");
  writeFileSync(file, html, "utf8");
  return file;
}

function gitMeta() {
  const git = (...args) => {
    try {
      return execFileSync("git", args, {
        cwd: REPO_ROOT,
        encoding: "utf8",
      }).trim();
    } catch {
      return "unknown";
    }
  };
  return {
    branch: git("rev-parse", "--abbrev-ref", "HEAD"),
    sha: git("rev-parse", "--short", "HEAD"),
  };
}

// ---------------------------------------------------------------------------
// Self-test: everything downstream of the browser gate, with no app and no login
// ---------------------------------------------------------------------------

/**
 * Everything downstream of the browser gate, exercised on placeholder pages.
 *
 * It needs no credentials and no dev server, which makes it the only way to
 * prove the composing, the labels and the size cap without an admin account —
 * so it stays in the tool rather than being a thing that was run once.
 */
async function selftest(browser, dir) {
  mkdirSync(dir, { recursive: true });

  // Full-page captures of a stand-in document, so the composite is built from
  // the shape of input a real run gives it: a tall strip at the phone width and
  // a wide one at the desktop width.
  const shots = [];
  for (const viewport of VIEWPORTS) {
    for (const locale of LOCALES) {
      const file = `selftest--${locale}--${viewport.name}.png`;
      const page = await browser.newPage({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.deviceScaleFactor,
        isMobile: viewport.isMobile ?? false,
        hasTouch: viewport.hasTouch ?? false,
      });
      await page.setContent(
        `<body style="margin:0;background:${COLORS.background};
           color:${COLORS.foreground};font:16px system-ui">
           <div style="padding:24px">
             <h1 style="margin:0 0 12px">Placeholder page</h1>
             <p style="margin:0 0 24px;color:${COLORS.muted}">${locale} · ${
               viewport.name
             } · ${viewport.width}px viewport</p>
             ${Array.from(
               { length: 10 },
               (_, i) =>
                 `<p style="margin:0 0 16px">Paragraph ${
                   i + 1
                 }. Enough copy to make the document longer than the viewport,
                  which is what a capture of a real page looks like.</p>`,
             ).join("")}
           </div>
         </body>`,
      );
      await page.screenshot({ path: path.join(dir, file), fullPage: true });
      const meta = await sharp(path.join(dir, file)).metadata();
      await page.close();
      shots.push({
        group: "Self-test",
        slug: "selftest--placeholder",
        label: "Placeholder entry",
        locale,
        viewport: viewport.name,
        file,
        state: "ok",
        width: Math.round(meta.width / viewport.deviceScaleFactor),
        height: Math.round(meta.height / viewport.deviceScaleFactor),
      });
    }
  }
  // A capture that found nothing, so the subtitle's other branch is drawn too.
  shots.push({
    group: "Self-test",
    slug: "selftest--placeholder",
    label: "Placeholder entry",
    locale: LOCALES[0],
    viewport: "desktop",
    file: "",
    state: "no-card",
  });

  const { branch, sha } = gitMeta();
  const composites = await buildComposites(shots, dir);
  const indexPath = writeIndex(dir, composites, {
    title: "Preview export — self-test",
    preset: "selftest",
    date: new Date().toISOString().slice(0, 10),
    base: "(self-test — no app was loaded)",
    branch,
    sha,
    ok: shots.filter((s) => s.state === "ok").length,
    noCard: 1,
    failed: 0,
  });

  for (const c of composites) {
    console.log(
      `[selftest] ${c.file}  ${c.width}×${c.height}  q${c.quality}  ${(
        c.size / 1e6
      ).toFixed(2)} MB`,
    );
  }
  console.log(`[selftest] index → ${indexPath}`);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

loadEnvLocal();

const DATE = new Date().toISOString().slice(0, 10);

/**
 * A run never writes into another run's folder. The dated name is the one a
 * reader wants; a second run on the same day takes `-2`, `-3` and so on rather
 * than overwriting pictures somebody may already be reviewing.
 */
function freshOutputDir() {
  const root = outputDir(import.meta.url, "preview-export");
  if (SELFTEST) return path.join(root, "selftest");
  const base = path.join(root, `${PRESET_NAME}-${DATE}`);
  if (!existsSync(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!existsSync(candidate)) return candidate;
  }
}

const OUT = arg("out") ?? freshOutputDir();
mkdirSync(OUT, { recursive: true });

if (SELFTEST) {
  const browser = await chromium.launch();
  await selftest(browser, OUT);
  await browser.close();
  process.exit(0);
}

// Before the browser, before the preset: a run with no credentials cannot see a
// single page, and finding that out after a launch is noise in front of the one
// line that matters.
credentials();

const preset = await loadPreset();
const planned = planShots(preset);
if (planned.length === 0) {
  fail(
    `Nothing to shoot. ${
      ONLY.length > 0
        ? `--only ${ONLY.join(",")} matched no slug in this preset.`
        : "The preset declares no entries."
    }`,
  );
}

console.error(
  `[preview-export] ${preset.title} · ${BASE} · ${LOCALES.join(",")} · ` +
    `${planned.length} shots → ${OUT}`,
);

const browser = await chromium.launch();

const contextOptions = (viewport, storageState) => ({
  viewport: { width: viewport.width, height: viewport.height },
  deviceScaleFactor: viewport.deviceScaleFactor,
  isMobile: viewport.isMobile ?? false,
  hasTouch: viewport.hasTouch ?? false,
  ...(storageState ? { storageState } : {}),
});

/**
 * Prepare a context so what it photographs is the product and nothing else.
 *
 * - **The consent banner.** It is a fixed overlay pinned to the bottom of the
 *   viewport, and at a phone width it covers most of the page. Answering it by
 *   clicking would be a click per context and a race against hydration on every
 *   one; a stored answer means the banner never mounts. It stores a *refusal*,
 *   which is both the smaller consent to fake and the one that loads no
 *   third-party script into the shot.
 * - **The dev overlay, animations and carets** — the same suppression, and the
 *   same reasons, as `scripts/page-capture/capture.mjs`: the Next badge lands in
 *   the corner of a full-page shot, and anything that moves is a difference
 *   between two otherwise identical runs.
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
  * { caret-color: transparent !important; }
`;

async function prepareContext(context) {
  await context.addCookies([
    {
      name: "sog_consent",
      value: encodeURIComponent(
        JSON.stringify({
          v: 1,
          at: new Date().toISOString(),
          analytics: false,
          marketing: false,
        }),
      ),
      url: BASE,
    },
  ]);
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
}

// One context per viewport, all carrying the one sign-in: signing in per
// viewport would be several sessions for no reason, and the login form is not
// what this tool is exercising.
const first = await browser.newContext(contextOptions(VIEWPORTS[0]));
await prepareContext(first);
await signIn(first);
const state = await first.storageState();

const contexts = { [VIEWPORTS[0].name]: first };
for (const viewport of VIEWPORTS.slice(1)) {
  const context = await browser.newContext(contextOptions(viewport, state));
  await prepareContext(context);
  contexts[viewport.name] = context;
}

const pages = {};
for (const [name, context] of Object.entries(contexts)) {
  pages[name] = await context.newPage();
}

const results = [];
for (const shot of planned) {
  try {
    const result = await shoot(pages[shot.viewport], shot);
    results.push(result);
    console.error(
      `  ${result.state === "ok" ? "✓" : "·"} ${shot.file}` +
        (result.state === "ok" ? "" : ` (${result.state})`),
    );
  } catch (error) {
    // Per shot, so one bad page costs one picture rather than the whole run —
    // the point of the composites is the pages that did render.
    results.push({
      ...shot,
      state: "failed",
      error: String(error).slice(0, 200),
    });
    console.error(`  ✗ ${shot.file} — ${String(error).split("\n")[0]}`);
  }
}

for (const context of Object.values(contexts)) await context.close();
await browser.close();

const ok = results.filter((r) => r.state === "ok").length;
const noCard = results.filter((r) => r.state === "no-card").length;
const failed = results.filter((r) => r.state === "failed").length;

const { branch, sha } = gitMeta();
const composites = await buildComposites(results, OUT);
const indexPath = writeIndex(OUT, composites, {
  title: preset.title,
  preset: PRESET_NAME,
  date: DATE,
  base: BASE,
  branch,
  sha,
  ok,
  noCard,
  failed,
});

console.log(`\n${OUT}`);
for (const c of composites) {
  console.log(
    `  ${c.file.padEnd(34)} ${String(c.width).padStart(5)}×${String(
      c.height,
    ).padEnd(6)} q${c.quality}  ${(c.size / 1e6).toFixed(2)} MB`,
  );
}
console.log(`  index.html — the whole run in a scrolling column`);
console.log(
  `\n${composites.length} composite${composites.length === 1 ? "" : "s"} · ` +
    `${(composites.reduce((n, c) => n + c.size, 0) / 1e6).toFixed(1)} MB total · ` +
    `${ok} captured · ${noCard} with nothing to shoot · ${failed} failed`,
);
// Said before the owner opens Slack rather than after the upload is refused.
if (composites.length > SLACK_FILES_PER_MESSAGE) {
  console.log(
    `Slack takes ${SLACK_FILES_PER_MESSAGE} files per message, so this needs ` +
      `${Math.ceil(composites.length / SLACK_FILES_PER_MESSAGE)} messages.`,
  );
}
process.exit(failed > 0 ? 1 : 0);
