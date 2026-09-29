# The Library

Admin-authored articles for parents: public pages for search engines and LLMs, and an admin
section to write and publish them. Ported from the old Webflow blog (www.sog.gg/library);
the Webflow import is a separate, later piece of work.

## Current state (2026-09-29)

The split is done. Four topic branches, each reviewed on its own focus with every accepted
finding fixed, merge into `feat/library-integration` (worktree
`.claude/worktrees/library-integration`), which has had the holistic review and is **the
only branch that merges into `dev`** — on the owner's instruction, after the owner's UI
pass.

| # | Branch | Carries |
|---|---|---|
| 1 | `feat/markdown-one-style` | one authored-markdown look for app, editor and mail; use cases over feature flags; the link rule |
| 2 | `feat/image-catalogue-purposes` | `product_images` → `catalogue_images` with purposes, per-purpose buckets and sizes; crop on upload; one crop hook for team photos and catalogue images |
| 3 | `feat/library-admin` (on 2 + 1) | the Library migration and service; Library Content; the Preview page; shared list search; rich-seed articles |
| 4 | `feat/library-public` (on 3) | the public `/library` and `/library/<id>` pages |

Fixes go on the topic branch they belong to and are merged forward (3 → 4 → integration),
never patched on integration. Integration equals branch 4; against the old `feat/library`
it differs only by the review fixes. The three migrations land together in the one merge
into `dev`, restamped once.

Before landing: a read-only check that no `library-covers` bucket already exists on
staging or prod (the purpose migration creates it with a plain insert).

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

- On non-English URLs the article text is English under a document whose `lang` is the
  chrome's locale.
- Emails: session-report text is 16px beside the mail's 14px copy — owner judged it fine.
