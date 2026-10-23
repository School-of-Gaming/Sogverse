# Landing pages: the open items

**Status: open, 2026-10-22.** Everything still unresolved from marketing's landing page
fixes list (13 Oct 2026): the items no one has built yet, the branches built and waiting
for the owner's review, the operator steps outside the code, and the questions for
counsel. **When an item is resolved — built and merged, or dropped by the owner — delete
its section. Delete this file when nothing is left.** It is self-contained: nothing
outside the repo is needed to pick any item up.

Marketing's list was written without sight of the code, so its items are statements of
intent, not specs: work out the behaviour wanted, check what the code already does, and
recommend. Landing pages exist for search engines and AI apps first and people second;
they are written only through the MCP server (`src/services/landing-pages/CLAUDE.md`).

## Not built yet

### Video system (list #13) — design first, with the owner

The ask was a video section for landing pages, so marketing's short ad videos (often
vertical 9:16; one is an 8-second guide video) can be used on them. The owner wants it
treated as **a Sogverse system, not a landing page feature**: videos any surface can
use, the way pictures are a shared catalogue. Start with questions and options, not
code; once the shape is agreed, write it up as a plan and build it.

What exists:
- **The home hero video**: one video made of three cuts (wide, close, vertical). It picks
  a cut by the viewport's shape, plays muted on a loop, uses each cut's first frame as
  its poster, and respects reduced motion. The files are committed by hand to
  `public/media/` and wired up in code; `src/assets/marketing/CLAUDE.md` documents the
  encoding and versioning. An admin cannot add or change a video.
- **The image catalogue**, a shared, admin-owned collection pages and products link to:
  content-addressed immutable files, derived paths, replace as repoint, a bucket per
  purpose (`src/services/catalogue-images/CLAUDE.md`, `src/lib/images/CLAUDE.md`).
- **Per-language content with a reader fallback** (`src/services/landing-pages/CLAUDE.md`,
  `src/services/library/CLAUDE.md`, `src/i18n/CLAUDE.md`).
- **Pictures reach the catalogue through the MCP uploader view**, which never crops: a
  picture that matches none of the accepted shapes is refused with a sentence for the
  admin (`src/lib/mcp/CLAUDE.md`, "Uploading through an MCP Apps view").

What the owner asked to be considered: **aspect ratios** (clips come in different shapes
and are shown full-screen in heroes and as boxes in a content column); **sound** (some
are silent ambient loops, others have speech or music); **locale** (en, fi, sv, fr and
tlh — a video may carry speech or burned-in text in one language).

Constraints: no third-party tracker loads before marketing consent
(`src/components/consent/`), the current video is self-hosted, and the CSP is per
request (`src/CLAUDE.md`); browsers will not autoplay video with sound, and the layout
rules forbid content shifting on its own schedule (`src/components/layout/CLAUDE.md`);
storage is Supabase, hosting Vercel, around 300 daily active users (owner's figure, October
2026 — re-pull with the `vercel-analytics` skill before sizing anything on it), and nothing
re-encodes media on the server today; admin content is written through the MCP server as
well as the admin UI; an MCP tool cannot receive a file's bytes through the model, which
is why uploads go through a view.

## Built, waiting for the owner's review

Each branch has a worktree at `.claude/worktrees/<name>` (the branch is `feat/<name>`);
nothing is merged. Review each through `/worktree-flow` from Phase 3 — enter the existing
worktree by path, preview if it is UI, a `code-reviewer` review, and merge only on the
owner's word. Where a final full test run was skipped, run `npm run gates` (and
`npm run test:db:local` if the branch has migrations) before landing.

| Worktree | Item | Points for the review |
|---|---|---|
| `landing-share-card` | #12 share title and picture per page | In the MCP tools, leaving a share field out of a save clears it — decide whether that is acceptable. |
| `landing-sticky-section` | #17 one sticky section (email sign-up only) in a side column from 1280px, at the page's end with a jump button below that | Built on an earlier version of the email sign-up (Brevo, double opt-in), which landed as a one-way send to Klaviyo: merging `dev` in rewrites its sign-up side. Section backgrounds are on `dev`, so merging it in conflicts in the section renderer: the column inset belongs on each section's inner container, not its band. Image size hints still assume no column. |
| `landing-mcp-seo-and-links` | extras 1 and 2: rendered SEO values in the page read tool; the link rule explained, and rewrites reported on save | The share-card branch's override belongs inside the one function that computes the rendered values. |

**Merge order.** Any order. Expect small
conflicts between `landing-share-card`, `landing-mcp-seo-and-links` and what the
`/discover` index work put on `dev` (sitemap, landing metadata, the production check), and between
`landing-sticky-section` and the section registry and renderer on `dev`.

## Operator steps outside the code

- **Google Search Console:** the `sog.gg` Domain property is verified by a TXT record in
  the DNS — keep it. Three owners without an `@sog.gg` address are to be reviewed.

## Questions for counsel, asked together

1. Does a free account, with no purchase, qualify for the soft opt-in under §200 of the
   Finnish Act on Electronic Communications Services? The answer decides whether the
   deferred sync of account holders to Brevo (`landing-email-capture`) may include
   those who did not tick the marketing box.
2. Is the registration form's marketing checkbox worded specifically enough?

## Small follow-ups noticed along the way

- A landing "points" section without a heading draws its item titles as H3, which can
  skip a level after the page's H1.
