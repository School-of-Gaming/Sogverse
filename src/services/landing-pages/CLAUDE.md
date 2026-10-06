# Landing pages

Marketing pages an admin authors — for a school, a city, a business, an event — that exist
to be found by search engines and AI apps first and people second. The model is the
Library's (`src/services/library/CLAUDE.md`) wherever this file says nothing different;
the sections are the registry's, in `src/lib/landing-pages/sections/`.

**Pages are written only through the MCP server** (`src/lib/mcp/`), by an AI app acting as
the admin. In Sogverse an admin has the list of pages and, for each, a status page that is
read-only apart from publishing: per language, complete or what is still missing, its
preview and live links, and its address; for the page, whether it has unpublished
changes, who last saved it and through which AI app, and Publish and Unpublish.

**A page has two copies, and a published row existing is what "live" means.** The working
copy (`landing_pages`) is admin-only; the published copy (`landing_page_publications`) is
public, with no flag beside it. A save changes only the working copy; publishing copies it
over the published one; unpublishing deletes the published rows and keeps the working
copy. There is no delete.

**The structure is the page's; the words are per language.** The structure is an ordered
list of sections, each with a stable id, a type and its shared fields — pictures, button
targets, icons, the ids and order of its items — and it is the same in every language.
Each language version holds the title, the summary, the slug and the words of every
section, keyed by section id. Anything a translator would change is a word; anything that
must be the same in every language is structure. An item inside a section (a point, a
step, a question, a picture of an image section) has an id of its own and its words are
keyed by it, so reordering or removing items never misaligns another language's words.

**A page is created whole, and every later write is one of two pieces that never
overwrite each other.** Creating sends the structure and the first versions together;
after that, a write carries either the structure alone or one language's words alone. A
structure write that removes a section drops that section's words from every language —
the database does it, whoever wrote the structure — and nothing else a structure write
does touches the words. A one-language write is checked against the structure as it is at
that moment, and refused if it carries words for a section the page does not have.

**A version is complete when its title, summary and slug are written and every section
has every required word in that language.** Which words a type requires is declared in
its section module; the same rule is written once more in SQL, which is what publishing
reads, and a DB test runs both halves over one set of generated cases and requires the
same answer. A change to a type's required words is therefore two edits, and the test
fails until both are made. Completeness depends on the structure, so it is recomputed for
every version whenever the structure changes: adding a section to a live page makes every
live language incomplete until its words are written, and the status page and the MCP
tools say so, because publishing then would leave those languages out — or, with none left
complete, refuse.

**One Publish puts every complete version live at once**, leaves the incomplete ones in
the working copy, and refuses a page with none complete. What a publish would do — the
languages going live, those left out, the live ones taken down, and the live addresses
it would change — is forecast from one admin read by one pure function in this
directory, which the status page shows before Publish is confirmed and the MCP tools hand
the AI app before it publishes. The database still decides; the forecast is never a gate.

**"Unpublished changes" compares what publishing would copy with what is live** — the
structure's digest and, for the complete versions, their short fields and the digest of
their words — so the admin list never reads a page's words.

**Slugs are stored, per language, and can change at any time, a live language's
included.** A slug is lowercase a–z, digits and single hyphens, length-capped, and never
shaped like a uuid, so an id address and a slug address cannot be mistaken for each other.
It is unique per locale across every page, live or not, and a slug another page still has
live is refused even when that page's working version no longer holds it; a page's own
live slug never blocks it. A save that sends no slug keeps the one stored; a version that
has none takes its title's, derived in the application. A live language's new slug goes
live with the next publish, and there are no redirects, so links to the old address
shared outside the site stop working then. Nothing refuses that: the forecast lists each
live address a publish would change, the status page warns on the language and in the
publish confirmation, and the MCP tools tell the AI app to confirm the change with the
admin before publishing.

**Readers fall back from their locale to English to the first version written**, and the
service hands back every live version in `SUPPORTED_LOCALES` order so "first" is stable —
exactly the Library's rule. An id address resolves in every locale; a slug address only
in its own.

**Pictures are `landing_image` entries of the shared image catalogue, referenced by id from
the structure.** Each copy carries the path of every picture its structure names, derived
by the database, which refuses an entry that is gone or of another purpose — so public
pages paint a path without reading the admin-only catalogue. No foreign key can reach into
the structure, so the catalogue's two rules are kept another way, with the same outcome
as for a Library cover: a **replace** moves every picture in both copies at once, a live
page's included, without a republish (the replace's landing half is a database function
the catalogue's replace calls beside the Library's); a **removal** unlinks the picture
from both copies at once — a hero or text section loses its picture, an image section
loses that picture, and an image section left with none is dropped with its words —
done by a trigger on the catalogue's own delete, so it needs nothing from the remover.
Either moves the working copy's "last saved" time and saver, as a cover removal does.

**The working copy records who last saved it, and through which AI app**, by the same
trigger pattern as the Library: no writer passes either, and publishing moves neither.

**Every write passes through one link hook in the service before it is sent**, so every
writer is held to the same links: own-site links in the markdown and in
button targets are stored canonical there, a slug address at the id of the live page it
names. A link leading to no page — or to a slug no live page has — refuses the write as a
`check_violation` naming the link, so it reaches the admin like the database's own
refusals. Nothing else in the save path touches a link.

**Every landing page write invalidates the whole `landing-pages` key tree**, the admin
detail included, and the image catalogue's usage map.

**The public page lives in `src/components/landing-pages/`, and every link to a landing
page is built by its address module** — the slug a locale's live version stores, else the
id — never by handing a segment to the route builder, because a slug resolves in its own
locale only and a hand-picked one is a 404 in every other. The renderer and the SEO
contribution (structured data) are each an exhaustive map over the section
types. Every section sits on the plain page ground: an admin chooses the order, so a
tinted band could land beside another and read as one section.
