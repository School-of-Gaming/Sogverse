# scripts/preview-export

> "It works well if I need to see a lot of versions of a page with a given
> account and it would be too many steps to do it manually. It's not only for
> checking copy but also a UI layout. UI Previews already does most of this for
> me. This is mostly adding the convenience so I can export some UI as a single
> view to share it in a review."

Sign in once as the staging admin, walk a list of pages across locales and
widths, and bind the lot into **one PDF you can paste into a review**. The list
of pages is the input — a *preset* — so a second review is a second preset, not
a second script.

## Running it

```bash
node scripts/preview-export/export.mjs --preset topic-copy
node scripts/preview-export/export.mjs --preset topic-copy --locales en,fi --viewports mobile
node scripts/preview-export/export.mjs --pages ./my-pages.mjs --only minecraft_java--about
node scripts/preview-export/export.mjs --selftest   # no app, no login, proves the sheet
```

| Flag | |
|---|---|
| `--preset <name>` | A module under `presets/`. Default `topic-copy`. |
| `--pages <path>` | A module of the same shape, for a list nobody wants to commit. |
| `--base <url>` | Default `http://localhost:3005`. Loopback only — see the guard. |
| `--out <dir>` | Default `scripts/output/preview-export/<preset>-<date>/`. |
| `--locales` | Default `en,fi,sv,fr`. (`tlh` is a test locale.) |
| `--viewports` | `desktop`, `mobile`, or both (the default). |
| `--only <slug,…>` | Just these entries. |
| `--selftest` | Renders placeholders through the sheet and the PDF. |

Everything lands in one folder: the PDF, the contact sheet it was printed from,
and every screenshot at full resolution as `<slug>--<locale>--<viewport>.png`,
so a single picture can be pasted on its own. The PDF embeds downscaled JPEGs
and re-encodes smaller if it comes out over budget; the PNGs are never touched.

## Writing a preset

```js
export default {
  title, description,
  groups: [{ label, entries: [{
    slug,                 // unique; names the PNG
    label, notes,         // how the sheet titles and annotates it
    route,                // "/preview/…" or (locale) => "/preview/…"
                          //   the /{locale}/ prefix is added for you
    capture,              // "viewport" | "fullPage" | { selector }
    waitFor,              // optional selector to wait for
    text,                 // optional (locale) => lines, printed as
                          //   selectable text under the images
  }] }],
};
```

`text` is the generic form of "print the words as well as the picture": a
screenshot cannot be copied out of, and a reviewer fixing a Finnish sentence
wants to paste it. `presets/topic-copy.mjs` fills it from the message catalog; a
layout review leaves it out. A `{ selector }` capture that matches nothing is
recorded as "nothing rendered here" rather than failing the run — a surface that
draws no such element is a real answer.

## What it takes out of the picture

A stored consent refusal (so the cookie banner never mounts — at a phone width it
covers most of the page), the Next dev overlay, animations, transitions and the
text caret. Everything else in the shot is the product.

## Credentials

`STAGING_ADMIN_EMAIL` and `STAGING_ADMIN_PASSWORD` — an admin account on staging
(which is what local dev points at), used to drive the real login form once. They
live in `.env.local` **only**, and are deliberately not in `.env.local.example`:
they are a local convenience for driving a browser, not something anyone needs to
run the project. Neither value is ever printed.

## The guard

`--base` is checked against a hardcoded loopback allowlist — `localhost`,
`127.0.0.1`, `[::1]`, any port, http or https — before the browser starts, and
**there is no override flag.** The run types a real admin password into the login
form at whatever that flag names, so a typo or a pasted URL is all it would take
to hand a working credential to a stranger's server, and the person running it
would see nothing but an ordinary sign-in failure. A deployed origin, if one is
ever wanted, is added as a literal in `export.mjs` — never as a flag, an
environment variable, or a suffix pattern.

## The sibling

`scripts/page-capture/` (on `feat/brand-palette-design-pass`) photographs the
whole app per role against a seeded staging fleet: whole pages, one language, a
directory of PNGs. Different job, same machinery — so this tool copies its
viewports verbatim, its loopback guard, and its locale-cookie pinning. **When
that branch lands, the sign-in and the guard belong in its `lib.mjs`** and this
tool should import them rather than keep a second copy.
