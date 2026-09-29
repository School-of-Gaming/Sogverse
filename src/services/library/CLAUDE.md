# Library

The Library's articles: the admin's working copies, publishing, and the published copies
the public pages read. The admin pages are in `src/components/admin/library/`.

**An article has two copies, and a published row existing is what "live" means.** The
working copy (`library_articles`) is admin-only; the published copy
(`library_article_publications`) is public, and there is no flag beside it. A save changes
only the working copy. Publishing copies the working copy over the published one;
unpublishing deletes the published row and keeps the working copy.

**Publishing refuses an incomplete copy, and a cover is never required.** The publish
function raises `check_violation` naming every missing field of title, summary, category
and body; an article goes live without a cover and readers see the NO IMAGE placeholder.
A working copy may be saved with only a title. The editor holds Publish back and names the
missing fields itself, so the refusal fires only on a state the UI cannot produce.

**A cover is a `library_cover` entry of the shared image catalogue**
(`src/services/catalogue-images/`), its object in the `library-covers` bucket, linked by id
from both copies. A catalogue replace repoints both, and a catalogue removal
nulls both, so either reaches a live article at once, without a republish.

**List reads never carry the body, and a card shows nothing derived from it.**

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
