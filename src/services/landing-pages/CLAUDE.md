# Landing pages

Marketing pages an admin authors — for a school, a city, a business, an event — that exist
to be found by search engines and AI apps first and people second. The model is the
Library's (`src/services/library/CLAUDE.md`) wherever this file says nothing different;
the sections are the registry's, in `src/lib/landing-pages/sections/`.

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

**Writes are whole or partial, and the partial ones are two pieces that never overwrite
each other.** The editor saves whole: the structure and every version, the set replacing
what is stored, so a language left out is removed. Everything that edits a piece at a time
(the MCP tools) writes either the structure alone or one language's words alone. A
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
live language incomplete until its words are written, and the editor has to say so,
because publishing then would leave those languages out — or, with none left complete,
refuse.

**One Publish puts every complete version live at once**, leaves the incomplete ones in
the working copy, and refuses a page with none complete.

**"Unpublished changes" compares what publishing would copy with what is live** — the
structure's digest and, for the complete versions, their short fields and the digest of
their words — so the admin list never reads a page's words.

**Slugs are stored, per language, and fixed once that language has been published.** A
slug is lowercase a–z, digits and single hyphens, length-capped, and never shaped like a
uuid, so an id address and a slug address cannot be mistaken for each other. It is unique
per locale across every page, live or not, and a slug another page still has live is
refused even when that page's working version no longer holds it. A save that sends no
slug keeps the one stored; a version that has none takes its title's, derived in the
application. Once a language has gone live its slug never changes — through unpublishing
too, and when a whole save drops a live language and a later save writes it again, it
takes its live slug back. There are no redirects, so a slug that could change would be a
link that could break.

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

**Every write passes through one link hook in the service before it is sent**, so the
editor and the MCP tools are held to the same links: own-site links in the markdown and in
button targets are stored canonical there, a slug address at the id of the live page it
names. A link leading to no page — or to a slug no live page has — refuses the write as a
`check_violation` naming the link, so it reaches the admin like the database's own
refusals. Nothing else in the save path touches a link.

**Every landing page write invalidates the whole `landing-pages` key tree**, the admin
detail included, and the image catalogue's usage map.
