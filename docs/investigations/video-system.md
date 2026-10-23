# A video system

**Status: open, nothing decided, 2026-10-23.** The constraints and what exists were
gathered from the code in October 2026; re-check them before relying on them. The
questions are the owner's, not answered yet.

Marketing asked for a video section on landing pages (their fixes list, 13 Oct 2026), so
their short ad videos can be used there. Those are often vertical 9:16, and one is an
8-second guide video. The owner wants it treated as **a Sogverse system, not a landing
page feature**: videos any surface can use, the way pictures are a shared catalogue.
Start with questions and options, not code. Once the shape is agreed, write it up as a
plan in `docs/plans/` and delete this file.

## What exists

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

## What the owner asked to be considered

- **Aspect ratios.** Clips come in different shapes, and they are shown full-screen in
  heroes and as boxes in a content column.
- **Sound.** Some are silent ambient loops; others have speech or music.
- **Locale.** The app has en, fi, sv, fr and tlh, and a video may carry speech or
  burned-in text in one language.

## Constraints

- No third-party tracker loads before marketing consent (`src/components/consent/`), the
  current video is self-hosted, and the CSP is per request (`src/CLAUDE.md`).
- Browsers will not autoplay video with sound, and the layout rules forbid content
  shifting on its own schedule (`src/components/layout/CLAUDE.md`).
- Storage is Supabase and hosting is Vercel, with around 300 daily active users (owner's
  figure, October 2026; re-pull it with the `vercel-analytics` skill before sizing
  anything on it). Nothing re-encodes media on the server today.
- Admin content is written through the MCP server as well as the admin UI. An MCP tool
  cannot receive a file's bytes through the model, which is why uploads go through a
  view.
