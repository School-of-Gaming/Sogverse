# scripts/preview-export

> "It works well if I need to see a lot of versions of a page with a given
> account and it would be too many steps to do it manually. It's not only for
> checking copy but also a UI layout. UI Previews already does most of this for
> me. This is mostly adding the convenience so I can export some UI as a single
> view to share it in a review."

Walk a list of pages across locales and widths — signed in as the staging admin,
or signed out as a first-time visitor — and compose them into **a handful of
images you can drop into a Slack thread**. The list of pages is the input — a
*preset* — so a second review is a second preset, not a second script.

**The composite is not the ideal format, and nobody should build on it as if it
were.** The owner's verdict on the first real output (2026-09-10): it contains
everything and is laid out as well as is reasonable, but a stack of full-page
captures four locales wide is likely too much for a person to review, and it is
accepted for now rather than chosen. What a reviewer actually needs from this
tool is still open; a later change that finds a better shape should replace the
composite, not add a mode beside it.

## Running it

```bash
node scripts/preview-export/export.mjs --preset topic-copy
node scripts/preview-export/export.mjs --preset topic-copy --locales en,fi --viewports mobile
node scripts/preview-export/export.mjs --preset public-pages --base https://sogverse.sog.gg
node scripts/preview-export/export.mjs --pages ./my-pages.mjs --only minecraft_java--about
node scripts/preview-export/export.mjs --selftest   # no app, no login
```

| Flag | |
|---|---|
| `--preset <name>` | A module under `presets/`. Default `topic-copy`. |
| `--pages <path>` | A module of the same shape, for a list nobody wants to commit. |
| `--base <url>` | Default `http://localhost:3005`. Loopback only when the preset signs in — see the guard. |
| `--out <dir>` | Default `scripts/output/preview-export/<preset>-<date>/`. |
| `--locales` | Default `en,fi,sv,fr`. (`tlh` is a test locale.) |
| `--viewports` | `desktop` (1440×900), `mobile` (360×800), or both (the default). |
| `--only <slug,…>` | Just these entries. |
| `--selftest` | Composes placeholder pages, so the whole pipeline runs with no app. |

Everything lands in one folder — dated, and suffixed `-2`, `-3` if that folder
already exists, so a rerun never overwrites pictures someone is reviewing:

- `<nn>-<group>.jpg` — **the deliverable.** One per group, in preset order.
- `index.html` — every composite in a scrolling column, for reading the run back.
  Its header says whether the run was signed in or out.
- `<slug>--<locale>--<viewport>.png` — every capture at full resolution, so one
  page can be pasted on its own.

## Presets

| Preset | Signed | What it shoots |
|---|---|---|
| `topic-copy` | in | Every topic's About card and "Before the first session" guide, on the admin preview scenes. |
| `public-pages` | out | Home, About and the shop: per page, the first screen with the cookie banner up, the first screen after "Reject all", and the whole page. One image per page. |

## What a composite looks like

The group's name at the top, then per entry: a label line, the phone captures
side by side (four across) as full scroll-height strips, and beneath them the
desktop pages two across the same span. Ground colour is the app's own
`--color-background`, read from the UI package's token sheet, so the picture
reads as the product rather than as a scan of it. Phones come first because the
phone width is where a translated line wraps into three.

**Ten files, each under 10 MB.** The workspace is on Slack's free plan, which
takes ten files per message, so a run that produces eleven composites is a review
that has to be posted twice and read out of order. The tool enforces it: more
than ten groups is a refusal, and a composite over 10 MB drops through quality
85 → 75 → 65 before failing by name rather than writing a file Slack rejects.
That is what makes grouping a preset-level decision — one group is one image.

A very long page stays one strip at its true proportions, uncapped: the shop on
a phone is about 15,500 px of document, which becomes a strip about 21,500 px
tall. Phones sit four across, so a group's height is set by its longest page
rather than by the locale count. Measured on production (2026-09-25), the shop's
composite in all four locales is 35,213 px tall — about half what a JPEG can
address — and 9.98 MB at quality 85, right at the Slack cap; the quality ladder
is the headroom. A shop that outgrows quality 65 fails by name, and the fix is
fewer locales per run or the whole page in its own group.

## Writing a preset

```js
export default {
  title, description,
  signedOut,              // optional; true = a first-time visitor, never signed in
  groups: [{ label, entries: [{
    slug,                 // unique; names the PNG
    label,                // the block's label inside the composite
    route,                // "/preview/…" or (locale) => "/preview/…"
                          //   the /{locale}/ prefix is added for you
    capture,              // "viewport" | "fullPage" | { selector }
    waitFor,              // optional selector to wait for before shooting
    banner,               // signed out only: "rejected" (default) | "up"
  }] }],
};
```

A route is the internal path. A public page's translated slug (`/fi/kauppa`) is
reached by the proxy's own redirect from `/fi/shop`, so a preset never keeps a
copy of the pathnames map.

A `{ selector }` capture that matches nothing is recorded as "nothing rendered
here" rather than failing the run — a surface that draws no such element is a
real answer.

## Signed in and signed out

**The preset decides, never a flag.** A page is only worth photographing the way
its reader sees it, so a preset about the public pages is signed out by what it
is rather than by what its caller remembers.

- **Signed in** (the default) — `STAGING_ADMIN_EMAIL` and
  `STAGING_ADMIN_PASSWORD`, an admin account on staging (which is what local dev
  points at), used to drive the real login form once. They live in `.env.local`
  **only**, and are deliberately not in `.env.local.example`: they are a local
  convenience for driving a browser, not something anyone needs to run the
  project. Neither value is ever printed. The consent banner is answered with a
  stored refusal, so it never mounts.
- **Signed out** (`signedOut: true`) — never loads `.env.local`, never reads the
  credentials, never visits the login form. Every shot is a first visit in a
  fresh browser context speaking the shot's locale, and a shot whose context
  ends up holding a Supabase session cookie fails by name. Needed because a
  signed-in reader of `/` is redirected to their dashboard, and the cookie banner
  never appears to anyone who has answered it.

## The cookie banner, in a signed-out run

Answered through its own buttons, never by writing the consent cookie. Per entry:

- `banner: "rejected"` (the default) — wait for the banner, press its "Reject
  all", wait for it to go, then shoot. The button's name comes from the locale's
  own `messages/<locale>.json`, so the button pressed is the one a reader of that
  language presses.
- `banner: "up"` — shoot the first screen with the banner still showing, which is
  what a first visit looks like. Only a `"viewport"` capture may ask for it.

A page on which no banner appears fails the shot: a first visit without the
question is a finding. A refusal loads no analytics or advertising script, so a
run against production leaves no trace in its analytics.

## What it takes out of the picture

The Next dev overlay, animations, transitions and the text caret — and, in a
signed-in run, the consent banner. Everything else in the shot is the product.
Before a `"fullPage"` shot the page is scrolled through once, so images that load
lazily as a reader approaches them are painted rather than blank.

A `{ selector }` capture additionally hides whatever is `position: sticky` or
`fixed` outside the target, computed at shoot time rather than guessed from a
selector list: an element taller than the viewport is shot by scrolling and
stitching, and the pinned site header would otherwise be painted across the
middle of it. `"fullPage"` needs none of that — it renders the document in one
pass, so the header appears once, where it belongs.

## The guard

**A signed-in run's `--base` is checked against a hardcoded loopback allowlist —
`localhost`, `127.0.0.1`, `[::1]`, any port, http or https — before the browser
starts, and there is no override flag.** It types a real admin password into the
login form at whatever that flag names, so a typo or a pasted URL is all it would
take to hand a working credential to a stranger's server, and the person running
it would see nothing but an ordinary sign-in failure. A deployed origin, if one
is ever wanted for a signed-in run, is added as a literal in `export.mjs` — never
as a flag, an environment variable, or a suffix pattern.

A signed-out run types nothing, so it takes any `http` or `https` origin:
production, a Vercel preview deployment, a local server.

## The sibling

`scripts/page-capture/` (on `feat/brand-palette-design-pass`, not on `dev` as of
2026-09-25) photographs the whole app per role against a seeded staging fleet:
whole pages, one language, a directory of PNGs. Different job, same machinery —
so this tool copies its viewports verbatim, its loopback guard, and its
locale-cookie pinning. **When that branch lands, the sign-in and the guard belong
in its `lib.mjs`** and this tool should import them rather than keep a second
copy.
