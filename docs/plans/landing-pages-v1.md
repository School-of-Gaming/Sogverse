# Landing pages v1 — finish and land

**Status (2026-10-05): built on `feat/landing-pages`, not landed, waiting on owner decisions.**
The branch is pushed to `origin` and has no worktree; to resume, check it out into a fresh
worktree (`git worktree add .claude/worktrees/landing-pages feat/landing-pages` from the
main checkout, then enter it by path), copy `.env.local` in, and junction or install the
nested `packages/mcp-cover-uploader` dependencies the way `.claude/scripts/worktree-setup.ps1`
does. Merge `origin/dev` in first if `dev` has moved. Everything below the
"Open decisions" section is already implemented, tested and reviewed; this plan exists so a
fresh session can pick the branch up cold, take the owner's rulings, finish and land it.
Delete this file in the change that lands the work.

## Problem

`www.sog.gg` (the legacy Webflow site) is being shut down, and with it the only place admins
could build marketing landing pages — for a school, a city, a business, an event, a product
they want to push. Admins must be able to create them inside Sogverse. They have to be
flexible enough for a wide range of pages and strict enough to stay on brand, and they exist
first to be **found** — by search engines and LLMs — so the system, not the admin, owns
every SEO and LLM affordance. The owner expects most pages to be authored by AI apps through
the MCP server.

## The decision (implemented)

- **A page is an ordered structure of typed sections shared by every language; the words
  are per language.** A section has a stable id, a type and its shared fields (pictures,
  button targets, icons, item ids); each language version holds the title, summary, slug and
  each section's words. Sections: hero (exactly one, first; the page's only H1), text (with
  an optional picture), image (1–4 pictures), value points (with curated icons), steps, FAQ,
  closing CTA — each with an optional eyebrow.
- **The Library's model for everything else**: working and published copies, one publish
  puts every complete language live and leaves incomplete ones out, reader fallback page
  locale → English → first written, saver attribution including the AI app. A language is
  complete when its title, summary, slug and every section's required words are written;
  the rule exists in TypeScript and SQL and a DB test holds them equal.
- **Addresses**: `/<locale>/discover/<idOrSlug>` — `discover`, `tutustu`, `upptack`,
  `decouvrir`, `discover` for Klingon. Slugs are stored per language (not derived from the
  title), unique per locale, never uuid-shaped, and fixed once that language has been
  published (also after an unpublish). The id address works in every locale and
  canonicalises to the version it shows.
- **Links**: own-site links (relative, or on `NEXT_PUBLIC_SITE_URL`'s exact host) are stored
  canonical at save — locale and translated segments removed, slugged addresses resolved to
  ids, a link that leads nowhere refused with a sentence naming the section and language.
  External links are allowed (discouraged, not blocked). The shared markdown renderer
  localises every own-site link to the page's locale for every use case, which also fixed
  Library articles and product descriptions holding locale-pinned links; the mail renderer
  writes own-site links absolute.
- **Pictures** are catalogue images of the purpose `landing_image`; removing one unlinks it
  from both copies, replacing one repoints them, the catalogue's usage map names the pages.
- **SEO/LLM, system-owned**: promoted tier — sitemap with publish date, hreflang for the
  live languages only, title and description from the version, a `WebPage` (or `FAQPage`)
  data block, a "Featured pages" entry in `llms.txt` (title, address, summary), the Meta
  Pixel allowlist. Default site link card.
- **MCP tools** (12): list, get, create, save structure, save one language's text, preview
  link, publish, unpublish, list/upload/place pictures. The section schemas live in one
  exhaustive zod-v4 record held to the app's schemas by a parity test; descriptions are
  generated from code. The MCP Apps picture uploader is one view for every catalogue purpose
  (Library covers included — its resource address and `upload_library_cover`'s answer shape
  changed).
- **Admin editor** at `/admin/landing-pages`: structure pane + Library-style language tabs.
  **This is what the owner found hard to use** — see the first open decision.

## Rejected alternatives, with the reason

- **Pages at the site root (`/<locale>/<slug>`)** — only justified by matching legacy sog.gg
  paths, which the owner ruled is not a goal; a prefix makes collisions with app routes
  impossible instead of guarded, and matches every other content route.
- **One shared slug for all languages** — a Finnish page deserves a Finnish address.
- **Slugs derived from the title (the Library's way)** — a retitle would break every shared
  and printed link, which costs a page built to rank its ranking.
- **A different section list per language** — over-applies "each locale persuades its own
  audience"; cultures differ in words, not section order, and per-language structure lets an
  admin forget a section in one language. Shared structure also suits AI authoring.
- **Images as markdown (`![alt](url)`)** — no dimensions (layout shift), any URL accepted,
  alt text skippable, free placement drifts off brand, and an image flag would be a decision
  for every markdown use case and the mail renderer.
- **Typed button targets referencing a product id; a products section** — dropped for v1 as
  too much; a product is reached by its URL in a link or a button.
- **An "unlisted" state** (live but not indexed) — more complexity than v1 needs; published
  or not, as the Library.
- **Blocking external links** — admins are trusted; off-platform links are discouraged and
  rare, not forbidden.
- **Building the sections as SOG-UI patterns now** — SOG-UI ships only tokens so far, and
  making this the first patterns-tier adoption would pull that whole process in; sections
  live in `src/components/landing-pages/`, one per type, and can move over whole.
- **Keeping `/roblox` hand-built vs. rebuilding it on this system** — it stays hand-built
  (partner-signed copy, its legal sub-pages); it is the acceptance test for a later
  partners feature.

## Open decisions (owner)

1. **The admin editor.** The structure-pane-plus-language-tabs form is hard to parse for a
   multi-section page (it copied the Library's shape, which suits one markdown body). The
   owner is looking at what MCP-authored pages actually look like before choosing. Options
   on the table:
   - **Page-shaped editor (recommended)**: the editor *is* the rendered page (the public
     section renderers), a language switcher redraws it in that language with gaps marked on
     the sections, clicking a section opens only that section's fields in a side panel;
     page settings (title, summary, slug) behind one button. Reuses the form logic,
     validation, save and publish wholesale — only the layout is new. True in-place typing
     (contenteditable) was judged far costlier for little more.
   - **MCP-first**: MCP is the authoring path; the editor becomes review and small fixes.
     Cheap additions either way: the empty list page explains how to author with an AI app;
     tool descriptions steer the AI to write every language before publishing.
   - **Order**: rebuild the editor on this branch then land (recommended), or land now with
     the editor hidden from the sidebar (MCP-only) and build the new editor next.
2. **`llms.txt` per page: summary only (recommended) or full text.** Summary only matches the
   Library and keeps the file cheap; the page itself carries the text. If summary only,
   delete the unused plain-text half of the per-section SEO map in
   `src/components/landing-pages/` (the `plainText` member and its helpers and test) — the
   branch review flagged it as dead code; keep the markdown-to-plain-text helper the FAQ data
   block uses.

## Steps to finish

1. Take the owner's rulings on the open decisions; build what they choose (delegate per
   `/worktree-flow`, which this branch was built under).
2. Apply the `llms.txt` ruling.
3. Review whatever the rulings added (one branch-level review), then land with
   `/worktree-flow` Phase 5: `npm run gates`, then — the branch adds migrations — merge
   `origin/dev` into it, `node scripts/restamp-migrations.mjs`, `npm run db -- generate`,
   commit; merge to `dev`; tear down the worktree.
4. Delete this file in the landing change.

## Acceptance criteria

- An AI app connected over MCP can create, write in several languages, illustrate, preview
  and publish a page, and it appears at its `/discover` address in each written language, in
  the sitemap and in `llms.txt`.
- An admin can do the same in the editor the owner chose, without needing a guide.
- `npm run gates` and the DB suite pass; lint is zero/zero.

## Resuming the preview (with MCP)

A fresh worktree needs its own local stack. For the MCP OAuth flow the stack's auth site
URL must be the preview server's origin, and the server's `NEXT_PUBLIC_SITE_URL` must
match. **Use `127.0.0.1`, not `localhost`**, everywhere:

- Stack: in PowerShell, `$env:SUPABASE_AUTH_SITE_URL = 'http://127.0.0.1:3005'`, append
  `SUPABASE_AUTH_SITE_URL` to `$env:WSLENV`, then `npm run db -- up` in the same call (about
  a minute). Check with `docker inspect` on the stack's `supabase_auth_*` container
  (`GOTRUE_SITE_URL`).
- Server: `$env:NEXT_PUBLIC_SITE_URL = 'http://127.0.0.1:3005'; npx next dev --turbopack -p 3005`
  (any free port, matched in both values).
- MCP endpoint: `http://127.0.0.1:3005/api/mcp`; sign in as `admin@example.com` /
  `password`. The rich seed has no landing pages or landing pictures.
- `next.config.ts` allows `127.0.0.1` as a dev origin on this branch; without it `next dev`
  serves no scripts to that host and the login form cannot submit.

## Constraints discovered while building

- Adding a catalogue purpose breaks every exhaustive purpose map (frames, copy in five
  catalogs) — they are the completeness check working.
- MCP schemas must be redeclared in `zod-v4`; the parity test is what keeps them honest.
- Removing a section drops its words in every language (a trigger); an MCP section sent
  without an id gets a fresh one, so omitting an existing id deletes its words.
- `set_landing_section_image` reads, edits and writes the structure, so a concurrent
  structure edit between the read and the write is overwritten — accepted.
- Buttons refuse `mailto:` and same-page anchors; markdown text keeps `mailto:`.
- "Own site" is `NEXT_PUBLIC_SITE_URL`'s exact host: a `www.` variant is external.

## Follow-ups (cut from v1)

Partners and co-branding (with the `/roblox` lockup as acceptance test), a products section
and a full single-product spotlight, video, per-page link cards, slug changes after publish
with redirects, editor SEO checks beyond the required fields, section-level MCP tools,
forms.
