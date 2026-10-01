# Library

The Library's articles: the admin's working copies, publishing, and the published copies
the public pages read. The admin pages are in `src/components/admin/library/`.

**An article has two copies, and a published row existing is what "live" means.** The
working copy (`library_articles`) is admin-only; the published copy
(`library_article_publications`) is public, and there is no flag beside it. A save changes
only the working copy. Publishing copies the working copy over the published one;
unpublishing deletes the published row and keeps the working copy.

**An article has a version per language, in both copies.** The title, summary and body are
written per site locale, by hand, in the editor's language tabs — one row per (article,
locale) in `library_article_translations` and `library_article_publication_translations`;
the category and the cover are the article's, once. A save writes the whole version set,
so a language left out is removed. There is no per-language publishing and no translation
workflow.

**One Publish puts every complete version live at once, and refuses an article with
none.** A version is complete when its title, summary and body are all written (the
working table's generated `is_complete` is the one definition); publishing copies the
complete ones and leaves an incomplete one in the working copy, and the live set becomes
exactly those. It raises `check_violation` naming what is missing — a category, or any
complete version. A cover is never required: an article goes live without one and readers
see the NO IMAGE placeholder. A version may be saved with only its title. The editor holds
Publish back, names what is missing and which languages a publish would leave out, so the
refusal fires only on a state the UI cannot produce.

**"Unpublished changes" compares what publishing would copy with what is live** — the
shared fields and the complete versions, by their short fields and body digests. A
half-written new language is therefore no change; a live language whose working version is
no longer complete is one, since publishing would take it down.

**Readers fall back from their locale to English to the first version written.** The
service hands back every live version, in `SUPPORTED_LOCALES` order so "first" is stable;
pages pick one with `localizeArticle` / `localizeArticleSummaries`. The admin preview
shows the page locale's working version, the one the editor's Preview opens on, blanks
and all.

**A cover is a `library_cover` entry of the shared image catalogue**
(`src/services/catalogue-images/`), its object in the `library-covers` bucket, linked by id
from both copies. A catalogue replace repoints both, and a catalogue removal
nulls both, so either reaches a live article at once, without a republish.

**List reads never carry a body, and a card shows nothing derived from one.**

**The public pages (`/library` and `/library/[id]`) are treated like `/schools` until the
owner's visibility pass** — `noindex, nofollow`, no `hreflang` alternates on the index,
unlinked from nav, footer and every page, and absent from the sitemap and `llms.txt`.
Launching them is lifting the `noindex`, restoring the index's alternates, and adding their
sitemap and `llms.txt` entries (with the links).

**There is no delete.** An article leaves the public Library by unpublishing.

**Every Library write invalidates the whole `library` key tree, the admin detail
included, on purpose** — and the image catalogue's usage map, which reads the articles'
covers. The detail refetch is what moves the editor's status and publish
controls after a save or a publish. It is safe because the editor seeds its form once per
article id and never from a refetch; that seeding is what keeps the refetch off the
admin's typing, so it must stay. The catalogue's own mutations invalidate the whole admin
tree too, because a catalogue replace or removal moves the working copy's cover under an
open editor, and a stale detail would read as unsaved changes.
