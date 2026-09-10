/**
 * Export a set of app pages — as the staging admin, in several locales, at both
 * widths — into **one PDF you can drop into a review**.
 *
 * The owner's words for what it is for: *"It works well if I need to see a lot
 * of versions of a page with a given account and it would be too many steps to
 * do it manually. It's not only for checking copy but also a UI layout. UI
 * Previews already does most of this for me. This is mostly adding the
 * convenience so I can export some UI as a single view to share it in a
 * review."*
 *
 * So the tool is generic and the *list of pages is the input*: a *preset* names
 * the surfaces, and the tool signs in once, walks them, shoots each one, and
 * binds the lot into a contact sheet. `presets/topic-copy.mjs` is the first
 * one; a second review is a second preset, not a second script.
 *
 *   node scripts/preview-export/export.mjs --preset topic-copy
 *   node scripts/preview-export/export.mjs --preset topic-copy --locales en,fi --viewports mobile
 *   node scripts/preview-export/export.mjs --pages ./my-pages.mjs --only minecraft_java--about
 *   node scripts/preview-export/export.mjs --selftest       # no app, no login
 *
 * Everything lands in `scripts/output/preview-export/<preset>-<date>/`: the PDF,
 * the contact sheet it was printed from, and every screenshot at full
 * resolution as `<slug>--<locale>--<viewport>.png`, so one picture can be
 * pasted on its own without being cut out of the PDF.
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
 *     label?, notes?,            // how the sheet titles and annotates it
 *     route,                     // "/preview/…" or (locale) => "/preview/…";
 *                                //   the /{locale}/ prefix is added for you
 *     capture,                   // "viewport" | "fullPage" | { selector }
 *     waitFor?,                  // a selector to wait for before shooting
 *     text?,                     // (locale) => lines printed as selectable
 *                                //   text under the images
 *   }
 *
 * `text` is the generic form of "print the words as well as the picture": a
 * screenshot cannot be copied out of, and a reviewer fixing a Finnish sentence
 * wants to paste it into Slack. A copy review fills it from the message
 * catalog; a layout review leaves it out.
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
        // `text` is resolved once per locale rather than per viewport: both
        // widths render the same words, and the sheet prints them once.
        let text = [];
        try {
          text = entry.text?.(locale) ?? [];
        } catch (error) {
          text = [`(this preset's text() threw: ${String(error).slice(0, 120)})`];
        }
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
            text,
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
    const size = page.viewportSize();
    return { ...shot, state: "ok", width: size?.width ?? 0 };
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
  const box = await target.boundingBox();
  await target.screenshot({ path: dest });
  return { ...shot, state: "ok", width: Math.round(box?.width ?? 0) };
}

// ---------------------------------------------------------------------------
// The copies of the shots that go *into* the PDF
// ---------------------------------------------------------------------------

/**
 * The PNGs are captured at the sibling tool's scale factors so a single one can
 * be pasted at full quality. That is right for the files on disk and wrong for
 * a PDF carrying a hundred and fifty of them — at that scale the file is far
 * past what anyone wants to hand a chat client. So the sheet gets JPEGs at
 * roughly the width the A4 column can actually show.
 *
 * **The ladder is what keeps the file small, not the first rung.** How big the
 * PDF comes out depends on the preset and how long the pages are that day, so
 * one fixed quality is a guess that goes stale. The run prints, measures, and
 * re-encodes a rung down if it is over budget — at most twice, and only the
 * sheet's copies: the PNGs beside the PDF are never touched.
 */
const SHEET_ASSETS = "sheet-assets";
const SHEET_WIDTHS = { desktop: 900, mobile: 360 };
const PDF_BUDGET_BYTES = 18e6;
const QUALITY_LADDER = [
  { scale: 1, quality: 80 },
  { scale: 0.75, quality: 70 },
  { scale: 0.55, quality: 60 },
];

async function downscale(shot, base, { scale, quality }) {
  const dir = path.join(base, SHEET_ASSETS);
  mkdirSync(dir, { recursive: true });
  const name = shot.file.replace(/\.png$/, ".jpg");
  await sharp(path.join(base, shot.file))
    // JPEG has no alpha; a page screenshot is opaque anyway, and flattening to
    // white keeps a transparent edge from printing as black.
    .flatten({ background: "#ffffff" })
    .resize({
      width: Math.round(SHEET_WIDTHS[shot.viewport] * scale),
      withoutEnlargement: true,
    })
    .jpeg({ quality, mozjpeg: true })
    .toFile(path.join(dir, name));
  return `${SHEET_ASSETS}/${name}`;
}

async function encodeSheetAssets(shots, rung, base) {
  for (const shot of shots) {
    if (shot.state !== "ok") continue;
    shot.sheetFile = await downscale(shot, base, rung);
  }
}

// ---------------------------------------------------------------------------
// The contact sheet
// ---------------------------------------------------------------------------

const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );

const SHEET_CSS = `
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #fff; color: #111;
         font: 11px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
  h1 { font-size: 26px; margin: 0 0 6px; }
  h2 { font-size: 17px; margin: 0 0 2px; border-bottom: 1px solid #ddd;
       padding-bottom: 4px; break-after: avoid; }
  h3 { font-size: 12px; margin: 14px 0 2px; color: #444;
       text-transform: uppercase; letter-spacing: .06em; break-after: avoid; }
  .cover { padding: 40mm 0 0; }
  .cover dl { display: grid; grid-template-columns: 34mm 1fr; gap: 4px 10px;
              margin: 24px 0 0; }
  .cover dt { color: #666; }
  .cover dd { margin: 0; }
  .group { margin: 0 0 18px; break-before: page; }
  .notes { color: #777; margin: 0 0 6px; }
  .block { margin: 0 0 8mm; }
  .row { display: flex; gap: 6mm; align-items: flex-start; }
  .cell { min-width: 0; }
  .cap { color: #666; margin: 0 0 3px; }
  .text { margin: 3mm 0 0; padding: 2mm 3mm; background: #fafafa;
          border-left: 2px solid #e0e0e0; font-size: 8.5px; color: #555; }
  .text p { margin: 0 0 2px; }
  .text .k { color: #999; font-family: ui-monospace, Consolas, monospace;
             font-size: 7.5px; margin-right: 6px; }
  /* True relative scale: each cell's flex-grow is the shot's own CSS width, so
     a 360-wide mobile capture sits beside a desktop one at the ratio it really
     has. */
  img { display: block; width: 100%; max-width: 100%; height: auto;
        border: 1px solid #e3e3e3; }
  .note { color: #888; font-style: italic; margin: 0; }
  .bad { color: #b00; margin: 0; }
`;

function cellHtml(shot) {
  const cap = `${esc(shot.locale)} · ${shot.viewport}${
    shot.state === "ok" ? ` · ${shot.width}px` : ""
  }`;
  if (shot.state === "ok") {
    return `<div class="cell" style="flex:${shot.width || 1} 1 0">
      <p class="cap">${cap}</p>
      <img src="${esc(shot.sheetFile ?? shot.file)}" alt="${esc(cap)}">
    </div>`;
  }
  const body =
    shot.state === "no-card"
      ? `<p class="note">Nothing rendered here &mdash; this surface draws no such element for this entry.</p>`
      : `<p class="bad">Failed: ${esc(shot.error ?? "unknown")}</p>`;
  return `<div class="cell" style="flex:1 1 0"><p class="cap">${cap}</p>${body}</div>`;
}

/**
 * The preset's own words for this entry and locale, as text a reviewer can
 * select and paste. Visually secondary — small and muted, under the images —
 * because the pictures are what is being judged and this is what gets quoted
 * back. A line may be a bare string or a `{ label, text }` pair; the label
 * prints as a small key beside the sentence.
 */
function textHtml(shots) {
  const lines = shots.find((s) => s.text?.length)?.text;
  if (!lines?.length) return "";
  return `<div class="text">${lines
    .map((line) =>
      typeof line === "string"
        ? `<p>${esc(line)}</p>`
        : `<p><span class="k">${esc(line.label)}</span>${esc(line.text)}</p>`,
    )
    .join("")}</div>`;
}

function entryHtml(shots) {
  let html = "";
  for (const locale of LOCALES) {
    const row = shots.filter((s) => s.locale === locale);
    if (row.length === 0) continue;
    html += `<div class="block"><div class="row">${row
      .map(cellHtml)
      .join("")}</div>${textHtml(row)}</div>`;
  }
  return html;
}

function buildSheet(shots, meta) {
  const body = [];

  body.push(`<div class="cover">
    <h1>${esc(meta.title)}</h1>
    <p>${esc(meta.description ?? "")}</p>
    <p>The words under each row are printed as selectable text where the preset
       supplies them &mdash; select and paste one to quote it back.</p>
    <dl>
      <dt>Preset</dt><dd>${esc(meta.preset)}</dd>
      <dt>Date</dt><dd>${esc(meta.date)}</dd>
      <dt>Base URL</dt><dd>${esc(meta.base)}</dd>
      <dt>Branch</dt><dd>${esc(meta.branch)} (${esc(meta.sha)})</dd>
      <dt>Locales</dt><dd>${esc(LOCALES.join(", "))}</dd>
      <dt>Widths</dt><dd>${esc(
        VIEWPORTS.map((v) => `${v.name} ${v.width}px`).join(", "),
      )}</dd>
      <dt>Screenshots</dt><dd>${esc(String(meta.ok))} captured, ${esc(
        String(meta.noCard),
      )} with nothing to shoot, ${esc(String(meta.failed))} failed</dd>
    </dl>
  </div>`);

  for (const group of [...new Set(shots.map((s) => s.group))]) {
    const mine = shots.filter((s) => s.group === group);
    let html = `<section class="group"><h2>${esc(group)}</h2>`;
    for (const slug of [...new Set(mine.map((s) => s.slug))]) {
      const entry = mine.filter((s) => s.slug === slug);
      html += `<h3>${esc(entry[0].label)}</h3>`;
      if (entry[0].notes) html += `<p class="notes">${esc(entry[0].notes)}</p>`;
      html += entryHtml(entry);
    }
    body.push(`${html}</section>`);
  }

  return `<!doctype html><html><head><meta charset="utf-8">
    <title>${esc(meta.title)}</title><style>${SHEET_CSS}</style></head>
    <body>${body.join("\n")}</body></html>`;
}

async function printSheet(browser, html, dir, pdfPath) {
  const sheetPath = path.join(dir, "contact-sheet.html");
  writeFileSync(sheetPath, html, "utf8");
  const page = await browser.newPage();
  // A file:// navigation, not setContent: the sheet references the images
  // beside it by relative name, and setContent gives the document an
  // about:blank base that resolves none of them.
  await page.goto(pathToFileURL(sheetPath).href, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.pdf({ path: pdfPath, format: "A4", printBackground: true });
  await page.close();
  return sheetPath;
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
 * Renders two placeholder pages, runs them through the same downscale, sheet
 * and PDF path a real run uses, and prints where it landed. It needs no
 * credentials and no dev server, which makes it the only way to prove the
 * layout and the print without an admin account — so it stays in the tool
 * rather than being a thing that was run once.
 */
async function selftest(browser, dir) {
  mkdirSync(dir, { recursive: true });

  const text = [
    { label: "line", text: "A preset's text() supplies lines like this one." },
    "A bare string works too, for a preset with nothing to key them by.",
  ];

  const shots = [];
  for (const viewport of VIEWPORTS) {
    const file = `selftest--${LOCALES[0]}--${viewport.name}.png`;
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.deviceScaleFactor,
      isMobile: viewport.isMobile ?? false,
      hasTouch: viewport.hasTouch ?? false,
    });
    await page.setContent(
      `<div id="c" style="width:${Math.round(viewport.width * 0.55)}px;
         padding:24px;border:1px solid #ccc;border-radius:8px;
         font:14px system-ui;background:#fff">
         <h2 style="font-size:13px;color:#666;margin:0 0 12px">Placeholder</h2>
         <p style="margin:0">${viewport.name} · ${viewport.width}px viewport</p>
       </div>`,
    );
    const box = await page.locator("#c").boundingBox();
    await page.locator("#c").screenshot({ path: path.join(dir, file) });
    await page.close();
    const shot = {
      group: "Self-test",
      slug: "selftest",
      label: "Placeholder entry",
      notes: "Rendered locally; no app and no sign-in were involved.",
      locale: LOCALES[0],
      viewport: viewport.name,
      file,
      text,
      state: "ok",
      width: Math.round(box?.width ?? 1),
    };
    shot.sheetFile = await downscale(shot, dir, QUALITY_LADDER[0]);
    shots.push(shot);
  }
  // One of each non-ok state too, so the sheet's other two branches are drawn.
  const stub = {
    group: "Self-test",
    slug: "selftest-empty",
    label: "The two states that are not a picture",
    locale: LOCALES[0],
    text: [],
  };
  shots.push(
    { ...stub, viewport: "desktop", state: "no-card" },
    {
      ...stub,
      viewport: "mobile",
      state: "failed",
      error: "a deliberate self-test failure",
    },
  );

  const { branch, sha } = gitMeta();
  const pdfPath = path.join(dir, "selftest.pdf");
  const sheetPath = await printSheet(
    browser,
    buildSheet(shots, {
      title: "Preview export — self-test",
      description: "The sheet, the downscale and the PDF, over placeholders.",
      preset: "selftest",
      date: new Date().toISOString().slice(0, 10),
      base: "(self-test — no app was loaded)",
      branch,
      sha,
      ok: VIEWPORTS.length,
      noCard: 1,
      failed: 1,
    }),
    dir,
    pdfPath,
  );

  console.log(
    `[selftest] ${shots.length} shots, ${text.length} text lines → ${sheetPath}`,
  );
  console.log(
    `[selftest] PDF → ${pdfPath} (${(statSync(pdfPath).size / 1e6).toFixed(2)} MB)`,
  );
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

loadEnvLocal();

const DATE = new Date().toISOString().slice(0, 10);
const OUT =
  arg("out") ??
  path.join(
    outputDir(import.meta.url, "preview-export"),
    SELFTEST ? "selftest" : `${PRESET_NAME}-${DATE}`,
  );
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
 *   viewport, and at a phone width it covers most of the page — the first real
 *   run of this tool produced a mobile guide whose lower two thirds were the
 *   cookie dialog. Answering it by clicking would be a click per context and a
 *   race against hydration on every one; a stored answer means the banner never
 *   mounts. It stores a *refusal*, which is both the smaller consent to fake
 *   and the one that loads no third-party script into the shot.
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
    // Per shot, so one bad page costs one cell in the sheet rather than the
    // whole run — the point of the PDF is the pages that did render.
    results.push({
      ...shot,
      state: "failed",
      error: String(error).slice(0, 200),
    });
    console.error(`  ✗ ${shot.file} — ${String(error).split("\n")[0]}`);
  }
}

for (const context of Object.values(contexts)) await context.close();

const ok = results.filter((r) => r.state === "ok").length;
const noCard = results.filter((r) => r.state === "no-card").length;
const failed = results.filter((r) => r.state === "failed").length;

const { branch, sha } = gitMeta();
const pdfPath = path.join(OUT, `${PRESET_NAME}-${DATE}.pdf`);
const meta = {
  title: preset.title,
  description: preset.description,
  preset: PRESET_NAME,
  date: DATE,
  base: BASE,
  branch,
  sha,
  ok,
  noCard,
  failed,
};

let sheetPath = "";
for (const [i, rung] of QUALITY_LADDER.entries()) {
  await encodeSheetAssets(results, rung, OUT);
  sheetPath = await printSheet(browser, buildSheet(results, meta), OUT, pdfPath);
  const size = statSync(pdfPath).size;
  if (size <= PDF_BUDGET_BYTES || i === QUALITY_LADDER.length - 1) break;
  console.error(
    `[preview-export] PDF is ${(size / 1e6).toFixed(1)} MB — re-encoding the ` +
      `sheet's images smaller and printing again.`,
  );
}
await browser.close();

const megabytes = (statSync(pdfPath).size / 1e6).toFixed(1);

console.log(`\nPDF:   ${pdfPath}`);
console.log(`Sheet: ${sheetPath}`);
console.log(`PNGs:  ${OUT}`);
console.log(
  `${ok} captured · ${noCard} with nothing to shoot · ${failed} failed · PDF ${megabytes} MB`,
);
process.exit(failed > 0 ? 1 : 0);
