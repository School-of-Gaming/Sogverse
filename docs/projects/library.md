# The Library

Admin-authored articles for parents: public pages for search engines and LLMs, and an admin
section to write and publish them. Ported from the old Webflow blog (www.sog.gg/library);
the Webflow import is a separate, later piece of work.

## Current state (2026-09-29)

Everything is built and committed on `feat/library` (worktree `.claude/worktrees/library`),
rebased on `dev` as of 2026-09-29. Its full diff has passed two independent reviews; every
accepted finding is fixed. Gates at the last run: lint clean, type-check clean,
translations clean, unit + integration 7304+ tests, DB suite 1657 tests twice in a row.

**The branch is too large to land as one, so it is being split** — see "The split" below.
That is the next piece of work. `feat/library` stays untouched as the reference until the
integration branch has been proven equal to it.

Running for the owner's manual review, and torn down only when the split is proven:
- dev server on port 3007 from the `feat/library` worktree (sign in `admin@example.com` /
  `password`);
- that worktree's local Supabase stack, rich seed (5 Library articles: 3 live, one of them
  with unpublished changes, one live with no cover; 2 drafts, one incomplete).

## The split (owner-approved 2026-09-29)

Four topic branches, each for a focused review, plus one integration branch that merges
all four, gets the holistic review of the whole feature and everything changed to support
it, and is **the only branch that merges into `dev`**.

| # | Branch | Base | Carries |
|---|---|---|---|
| 1 | `feat/markdown-one-style` | `dev` | one authored-markdown look for app, editor and mail; use cases over feature flags; the `article` use case; the link rule; nested-list spacing |
| 2 | `feat/image-catalogue-purposes` | `dev` | `product_images` → `catalogue_images`; purposes and per-purpose buckets; crop on upload; the shared crop dialog (team photo moves onto it); `FramedImage`, `ProductBanner`, the shared hover zoom |
| 3 | `feat/library-admin` | 1 + 2 | the Library migration and service; Library Content (list, editor, Preview page); the shared list search; the public bodies the admin preview renders; the rich-seed articles |
| 4 | `feat/library-public` | 3 | the `/library` and `/library/<id>` routes, their metadata and JSON-LD, the proxy's public entry |
| — | `feat/library-integration` | `dev` | merges 1–4; the equivalence check; the holistic review; the one merge into `dev` |

How it is done:
- **By file, not by replaying commits** — `feat/library`'s commits interleave the concepts.
  Each topic branch is cut from `dev` (or its base) and takes the final version of its files
  from `feat/library`. Regenerate the list with `git diff --name-only origin/dev...feat/library`.
- **Shared files split hunk by hunk:** `messages/*.json`, `src/lib/constants/routes.ts`,
  `src/i18n/pathnames.ts`,
  `src/proxy.ts` (admin-only preview gate → 3, public routes → 4), `src/types/index.ts`,
  the root/`src`/`supabase` `CLAUDE.md` files, `TODO.md`, `next.config.ts`,
  `scripts/local-db/rich-images.sh` and `supabase/rich-seed.sql` (product images → 2,
  Library covers and articles → 3).
- **Generated files are regenerated per branch** (`npm run db -- generate`), never copied:
  `database.types.ts`, `supabase/schema/`.
- **Migrations:** rename + purpose → 2; the Library migration → 3. They land together, in
  that order, in the one integration merge, restamped once.
- **Fixes always go on the topic branch they belong to** and are re-merged into integration;
  never patched on integration directly.
- **The equivalence check:** once integration first assembles, `git diff feat/library
  feat/library-integration` must be empty (generated files may differ only by regeneration
  order). Then `feat/library` is retired and torn down, and previews move to integration.
- The session is isolated in the `feat/library` worktree and cannot create others: leave it
  (`ExitWorktree` keep) and create the new worktrees from the main checkout with
  `.claude\scripts\worktree-setup.ps1` (`-Base` for 3 and 4).
- Only integration needs a preview server and a rich stack; topic branches run DB tests on
  a `--no-rich-seed` stack and park it.
- Owner's review order: 1 and 2 first (they reach beyond the Library; each gets an owner UI
  pass), then 3 and 4.

## Decision log (all owner rulings)

**Data model**
- Working copy (`library_articles`, admin-only) and published copy
  (`library_article_publications`, anon-readable; the row existing means live). Publish
  copies the working copy over; later saves stay private until the next publish; unpublish
  deletes the row. No delete of an article. The id is the URL; no slug. Author stored,
  never shown.
- A draft needs a title; publish needs category, title, summary and body. A cover is
  optional even to publish (reversed 2026-09-28 from "required"); a missing one shows the
  intentionally ugly NO IMAGE placeholder products use.
- Categories: the `library_article_category` enum is the only vocabulary; URLs carry its
  values as they are; five categories, no news category.
- Reading time shows on the article page only; cards carry none, and list reads never carry
  the body (2026-09-29, following dev's product-list fix ff557f9d).

**Images**
- Covers are catalogue entries. Every entry has a **purpose** (`product`, `library_cover`),
  fixed at creation; one code map gives each purpose its bucket and exact size (product →
  `product-images`, 1200×800; library_cover → `library-covers`, 1600×900). No aspect ratio
  is stored — purpose, not shape, is what an image is (owner, 2026-09-29).
- Every upload and replace is cropped to the purpose's exact size, JPEG only, measured and
  enforced by the upload routes. Legacy images are corrected by hand, never by code: the
  in-app re-crop badge was removed. Prod's three live non-conforming product pictures were
  replaced 2026-09-29 (old entries kept; rollback in the session scratchpad's
  `prod-recrop/apply.md`). Staging's were normalised the day before.
- The Library shows covers at 16:9; products stay locked to 3:2.
- A catalogue Replace repoints products and articles, draft and live, without a republish;
  Remove nulls them.

**Authored markdown**
- One look app-wide, **mail included**: one definition (`src/lib/authored-markdown.ts`)
  feeds the renderer, the editor and the mail's inline styles.
- A field names its use case; a use case is a set of feature flags (`headings`, `links`).
  `feed` has no links (safeguarding). `article` and `marketing` stay separate use cases.
- Links: our site in the same tab; another site in a new tab with an icon and screen-reader
  text; mail unchanged. Raw HTML shows as literal text, as it always did in the app.
- A sub-list sits at the item gap (4px) below its bullet.

**Admin UI**
- Library Content sits after Invoice Customers, before Tools. The list follows the product
  lists' look, with a cover thumbnail, and shares their search pieces.
- Save only when something changed (the baseline is the editor's own serialisation of the
  stored body). Publish and Preview act on the saved copy and ask for a save first.
- Preview is a button that opens an admin-only, noindex page in the public chrome.
- 2026-09-29: the owner removed the Library's three preview scenes (index, article, admin
  content), since the rich seed covers every state on the real pages, and removed the
  old-blog images they used from the repo and from its history.
- "Unpublished changes" is info blue.

**Public pages**
- Treated like `/schools` until the owner's visibility pass (2026-09-29): `noindex,
  nofollow`, no alternates on the index, linked from nowhere, and absent from the sitemap
  and `llms.txt`. Launching lifts the `noindex`, restores the index's alternates and adds
  the sitemap and `llms.txt` entries. An article's canonical is its English address (articles
  are English at every locale).

**Process**
- A branch's unlanded migrations are consolidated before merging, one file per concept, in
  dependency order — now in `supabase/CLAUDE.md`.

## Open

- `usePublishedLibraryArticles` has no caller; kept for a client-side public reader.
  Delete if none is planned.
- On non-English URLs the article text is English under a document whose `lang` is the
  chrome's locale.
- Emails: session-report text is 16px beside the mail's 14px copy — owner judged it fine.
