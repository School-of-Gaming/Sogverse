---
name: page-screenshots
description: Screenshot app pages across locales and desktop/phone widths — to review a UI or copy change on a branch, capture the public pages (home, About, shop) signed out, check a page as a first-time visitor with the cookie banner, or make images to share in Slack. Runs scripts/preview-export/export.mjs with a preset.
---

# Screenshots of app pages

`scripts/preview-export/export.mjs` walks a **preset** — a list of pages — in each locale
at desktop (1440×900) and phone (360×800) width, saves every capture as a PNG, and
composes one JPEG per group for Slack. Its `README.md` is the reference for the flags,
the preset shape and the composite; this skill is when and how to use it.

```bash
node scripts/preview-export/export.mjs --preset public-pages --base https://sogverse.sog.gg
node scripts/preview-export/export.mjs --preset public-pages --base http://localhost:3021 --locales en,fi
node scripts/preview-export/export.mjs --preset topic-copy --base http://localhost:3021
node scripts/preview-export/export.mjs --preset <name> --only <slug,…> --viewports mobile
node scripts/preview-export/export.mjs --selftest    # proves the pipeline, no app needed
```

| Preset | Signed | Shoots |
|---|---|---|
| `public-pages` | out | Home, About, shop: first screen with the cookie banner up, first screen after "Reject all", whole page. |
| `topic-copy` | in | Every topic's About card and "Before the first session" guide, on the admin preview scenes. |

Key flags: `--base` (default `http://localhost:3005`), `--locales` (default
`en,fi,sv,fr`), `--viewports desktop|mobile`, `--only` (entry slugs), `--out`. The full
public-pages run in four locales takes about three minutes.

## Signed in or signed out — the preset decides

- **Signed in** (the default): signs in as the staging admin with `STAGING_ADMIN_EMAIL`
  / `STAGING_ADMIN_PASSWORD` from `.env.local`. **`--base` must be loopback** (`localhost`, `127.0.0.1`,
  `[::1]`), with no override flag, because the run types that password into whatever
  `--base` names. It refuses before launching a browser or reading the credentials.
- **Signed out** (a preset with `signedOut: true`): reads no credentials, and every shot
  is a first visit in a fresh browser. **`--base` may be any http/https origin** —
  production, a Vercel preview, a local server. The public pages need this: signed in,
  `/` redirects to the dashboard and the cookie banner never appears.

## Output, and reading it back

A run writes to `scripts/output/preview-export/<preset>-<date>/` (then `-2`, `-3`) and
prints the path: `NN-<group>.jpg` composites, `index.html`, and
`<slug>--<locale>--<viewport>.png` per capture.

- **Read the per-capture PNGs to check the result, not the composites.** A composite is
  2,068 px wide and up to ~35,000 px tall, so the Read tool shrinks it until the text is
  unreadable. A phone full-page PNG is also very tall (the shop is ~31,000 px at 2×);
  crop the part you need with `sharp(...).extract(...)` into the scratchpad and read that.
- **Output lives in the checkout the tool ran from.** Run from a worktree, it is deleted
  with the worktree at teardown — copy anything worth keeping out first.

## Previewing a branch

The main checkout's dev server serves `dev`, so a branch is shot from its own server.
Following `/worktree-flow` Phase 3: in the branch's worktree, pick a port nobody is on
(check it is free; treat 3000–3002 as taken), start `npx next dev --turbopack -p <port>`
in the background, and point `--base` at `http://localhost:<port>`. Run the tool from
that same worktree when the branch changes a preset; otherwise either checkout works.
Stop the server by port with a tree kill when done (Phase 5, step 3). Never run
`npm run dev`, and never touch a server you did not start.

The first request to each route compiles it, so the first shots of a cold dev server
are slow; that is not a failure.

## A new set of pages is a new preset, not a new script

Add `scripts/preview-export/presets/<name>.mjs`, default-exporting
`{ title, description, signedOut?, groups: [{ label, entries: [...] }] }`; `--preset
<name>` picks it up. The README's "Writing a preset" has the entry shape. What is easy to
get wrong:

- **A group is one composite image, and a run refuses more than ten groups** (one Slack
  message). Group by what a reviewer looks at as a unit — a page, a topic.
- **A route is the internal path** (`/shop`, not `/kauppa`); the tool adds the locale
  prefix and the proxy redirects to the translated slug.
- **`banner` is signed-out only**: `"rejected"` (default — the banner's own "Reject all"
  is pressed first) or `"up"` (the first screen with the banner showing; `capture` must be
  `"viewport"`).
- A one-off list nobody will reuse goes through `--pages <path>` instead of a committed
  preset.

## Verifying a run

The summary line reads `N captured · 0 with nothing to shoot · 0 failed`, and the start
line says `signed out` or `signed in as the staging admin`. A signed-out shot fails by
name if no cookie banner appears or if a session cookie turns up. Then open a few PNGs:
the banner-up shot shows the banner, the rejected ones do not, and the header shows the
sign-in icon rather than an avatar when signed out.
