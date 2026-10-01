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
each page picks one per article, for a list card by card. The admin preview
shows the page locale's working version, the one the editor's Preview opens on, blanks
and all.

**A cover is a `library_cover` entry of the shared image catalogue**
(`src/services/catalogue-images/`), its object in the `library-covers` bucket, linked by id
from both copies. A catalogue replace repoints both, and a catalogue removal
nulls both, so either reaches a live article at once, without a republish.

**List reads never carry a body, and a card shows nothing derived from one.**

**An article has two addresses, neither redirecting** (`src/lib/slug.ts`):
`<library>/<id>`, which resolves in every locale, and `<library>/<slug>`, the one people
share and the canonical. The slug is derived from the title of the version in the page's
locale, on every read, and stored nowhere; it resolves in that locale only, matched
against the live titles in app code. Retitling changes the shared address and old shared
links stop resolving. Two titles deriving one slug in a locale leave it to the article
that went live first; the newer is reachable by its id. The address helpers are in
`src/components/library/`, and every link to an article goes through them.

**A page canonicalises to the slug address of the version it shows**: its own locale's
where written, else the fallback's (English, then the first written), and only the
locales written are `hreflang` versions, in the sitemap too. Text the page shows in
another language than the page's is marked with `lang`, on the article and on a card;
a card opens the article where its page canonicalises, so a card showing the English
fallback opens the English page. The Library is promoted
(`docs/architecture/discoverability.md`): indexed, in the sitemap with each article's
publish date, and each article listed in `llms.txt`. The admin preview stays `noindex`.

**There is no delete.** An article leaves the public Library by unpublishing.

**Every Library write invalidates the whole `library` key tree, the admin detail
included, on purpose** — and the image catalogue's usage map, which reads the articles'
covers. The detail refetch is what moves the editor's status and publish
controls after a save or a publish. It is safe because the editor seeds its form once per
article id and never from a refetch; that seeding is what keeps the refetch off the
admin's typing, so it must stay. The catalogue's own mutations invalidate the whole admin
tree too, because a catalogue replace or removal moves the working copy's cover under an
open editor, and a stale detail would read as unsaved changes.
