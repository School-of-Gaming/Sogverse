# Landing pages: the open items

**Status: open, 2026-10-16.** Everything still unresolved from marketing's landing page
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

### Gated download (list #3) — owner decision pending

The ask: attach a file (a PDF guide) to a page and deliver it after a sign-up. Paused
while the owner agrees with marketing how gating fits email marketing. The leaning: **a
free account is the gate**, and marketing consent stays a separate, optional box. The
reasons, which any design must respect: under EU law marketing consent cannot be the
price of a download (consent made a condition of a service is not freely given); an
account is a fair exchange; marketing email goes only to people who ticked the box.
Whether a free account alone allows follow-up email is a question for counsel (below).
Build nothing until the owner rules.

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

### Analytics gaps found while building the analytics tools

Neither is on the list as its own item; both were part of extra 3 ("views, button clicks
and signups by source page"), and both are new work if marketing wants them:
- **Button clicks are not tracked anywhere.** Landing page buttons have no tracking; the
  Meta Pixel reports product-page signup clicks only to Meta.
- **A signup cannot be tied to the page it came from.** Only the arrival link's campaign
  labels are stored, and only for parents who accepted marketing cookies.

## Built, waiting for the owner's review

Each branch has a worktree at `.claude/worktrees/<name>` (the branch is `feat/<name>`);
nothing is merged. Review each through `/worktree-flow` from Phase 3 — enter the existing
worktree by path, preview if it is UI, a `code-reviewer` review, and merge only on the
owner's word. Where a final full test run was skipped, run `npm run gates` (and
`npm run test:db:local` if the branch has migrations) before landing.

| Worktree | Item | Points for the review |
|---|---|---|
| `landing-email-capture` | #2 email sign-up section, Brevo double opt-in | Sogverse stores nothing about the lead except a one-hour hashed-IP rate-limit table — confirm that is acceptable. Account holders are not synced to Brevo (deferred). Brevo setup outstanding (below). |
| `admin-analytics` | #4 admin Analytics page, and extra 3's two read-only MCP tools | All admins see the page. "Pages served" needs a Vercel token with observability access (below). The tools refuse page-level signups rather than guess, and refuse a range wholly before the data starts. Needs polish before it goes live. |
| `faq-question-headings` | #5 FAQ questions as headings | Applies to every FAQ on the site. |
| `discover-index` | #10 `/discover` index, breadcrumbs, IndexNow | Publish and Unpublish (landing pages and Library) now go through admin API routes so IndexNow can fire; the API route wrapper now returns the database error code where it discloses errors; the production check is duplicated byte for byte with the one already on `dev` (`src/lib/seo/deployment.ts`) on purpose; the index has no closing call to action though the site-quality rule asks every public page for one; the Finnish copy wants a native check. |
| `landing-share-card` | #12 share title and picture per page | In the MCP tools, leaving a share field out of a save clears it — decide whether that is acceptable. |
| `landing-picture-shapes` | #14 pictures in three shapes (wide 16:9, square, portrait 4:5), never cropped | Library covers uploaded through the AI app are now refused rather than cropped when not 16:9; a column was renamed to hold each picture's purpose; the uploader view has a new address. Not yet tried in a real AI app. |
| `testimonials` | #15 part 1: the testimonials store, the Marketing admin hub, MCP tools | Home spots are written only by migrations; testimonials are never deleted by the app (the service role keeps DELETE so DB tests can clean up); a save with quotation marks in the text is refused; if the read fails, Home and About render without quotes. Check whether Home lost static rendering by reading testimonials per request. New fi/sv/fr admin copy wants a native check. |
| `landing-products` | #16 Products section: hand-picked shop products in the shop's own card and carousel | The carousel is now shared with the Roblox page and centred when it is not full; a pick the shop no longer lists is not drawn and is reported on the status page; municipality clubs can be picked but never show — consider refusing them at save. Each products section ships the whole shop listing to the browser. |
| `landing-section-backgrounds` | #17 a default or card background per section | The default is written into the structure, so an existing page shows "unpublished changes" once after its first structure save. The Products section needs the field when the two branches meet. Final full test run outstanding. |
| `landing-sticky-section` | #17 one sticky section (email sign-up only) in a side column from 1280px, at the page's end with a jump button below that | Built on `landing-email-capture`, which must land first. Merging with `landing-section-backgrounds` conflicts in the section renderer: the column inset belongs on each section's inner container, not its band. Image size hints still assume no column. |
| `uploader-multi-file` | #18 several pictures at once in the uploader | Built on `landing-picture-shapes`, which must land first. Files past the room are refused before any upload; one batch per opening. Final full test run outstanding; not yet tried in a real AI app. |
| `landing-mcp-seo-and-links` | extras 1 and 2: rendered SEO values in the page read tool; the link rule explained, and rewrites reported on save | The share-card branch's override belongs inside the one function that computes the rendered values. |
| `landing-testimonials` | #15 part 2: a testimonials landing section (feature 1, pair 2, row 3, showcase 6) | Built on `testimonials`, which must land first. Still being built at the time of writing, in a sibling directory; it moves to `.claude/worktrees/` when its build finishes. |

**Merge order.** Any order within these constraints:
`landing-email-capture` before `landing-sticky-section`; `testimonials` before
`landing-testimonials`; `landing-picture-shapes` before `uploader-multi-file`. Expect small
conflicts among `discover-index`, `landing-share-card` and `landing-mcp-seo-and-links`
(sitemap, landing metadata, the production check), and among `landing-products`,
`landing-section-backgrounds` and `landing-sticky-section` (the section registry and
renderer).

## Operator steps outside the code

- **Brevo:** a list, a double opt-in template and the contact attributes the email
  sign-up sends; the env vars are named in `.env.local.example` on its branch and are
  empty in `.env.local`. Needed before `landing-email-capture` can go live.
- **Vercel:** a token with observability access for the Analytics page's "pages served";
  until then it shows that Vercel refused. A real `INDEXNOW_KEY` on production for
  `discover-index`. Env vars go through the `vercel-env-vars` skill.
- **Google Search Console:** the `sog.gg` Domain property is verified by a TXT record in
  the DNS — keep it. Three owners without an `@sog.gg` address are to be reviewed.

## Questions for counsel, asked together

1. Does a free account, with no purchase, qualify for the soft opt-in under §200 of the
   Finnish Act on Electronic Communications Services?
2. Is the registration form's marketing checkbox worded specifically enough?
3. Does sending UTM values to Brevo with the source page breach point 6 of
   `src/lib/utm.ts` ("never combined with journey data")?

## Small follow-ups noticed along the way

- A landing "points" section without a heading draws its item titles as H3, which can
  skip a level after the page's H1.
- `npm run test:smoke` was reported to need a prior `npm run build`, contrary to the root
  `CLAUDE.md`; verify, then fix the doc or the script.
