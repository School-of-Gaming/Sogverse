# Landing pages

Marketing pages an admin authors — for a school, a city, a business, an event — that exist
to be found by search engines and AI apps first and people second. The model is the
Library's (`src/services/library/CLAUDE.md`) wherever this file says nothing different;
the sections are the registry's, in `src/lib/landing-pages/sections/`.

**Pages are written only through the MCP server** (`src/lib/mcp/`), by an AI app acting as
the admin. In Sogverse an admin has the list of pages, a tab of the Marketing hub (a failed
read says so, never "no pages"), and, for each, a status page that is read-only apart from
publishing. Per language it shows complete or what is still missing, its preview and live
links, and its address; a live language removed from the working copy shows too, still
live until the next publish. For the page it shows what a publish would do, whether there
are unpublished changes, who last saved it and through which AI app, the testimonials it
places, the product picks that would not be drawn and why, which link preview each
language shares — with, on a live language whose working card differs from the one shared
now, a note that links keep the live preview until the next publish — and Publish and
Unpublish.

## Model and writes

**A page has two copies, and a published row existing is what "live" means.** The working
copy (`landing_pages`) is admin-only; the published copy (`landing_page_publications`) is
public, with no flag beside it. A save changes only the working copy; publishing copies it
over the published one; unpublishing deletes the published rows and keeps the working
copy. There is no delete.

**The structure is the page's; the words are per language.** The structure is an ordered
list of sections, each with a stable id, a type and its shared fields — pictures, button
targets, icons, its background, its sticky side, a testimonials section's arrangement, the
ids of the rows it places (testimonials, products, a guide) and the ids and order of its
items — and it is the same in every language. Each language version holds the title, the
summary, the slug, the share card and the words of every section, keyed by section id.
Anything a translator would change is a word; anything that must be the same in every
language is structure. An item inside a section (a point, a step, a question, a picture of
an image section) has an id of its own and its words are keyed by it, so reordering or
removing items never misaligns another language's words. **Every refusal about the
structure names a section by its number from one, never its id**, which an AI app that
sent the section without one has never seen.

**A page is created whole, and every later write carries one part of it.** Creating sends
the structure and the first versions together, through a whole-copy save only create and
clone call (`authenticated` cannot execute it). After that a write carries the structure
alone, one language's words, or one language's removal. A structure write that removes a
section drops that section's words from every language — the database does it, whoever
wrote the structure — and touches the words in no other way. A one-language write is
checked against the structure as it is at that moment, and refused if it carries words for
a section the page does not have. A removal takes that version from the working copy alone
and refuses the page's last one: a live language stays live until the next publish. Every
write stamps who saved it and through which AI app, by the Library's trigger pattern: no
writer passes either, and publishing moves neither.

**A clone is a create whose content the database copies in one call**, so no word passes
through the application or the AI app. Everything in the source's working copy is copied
verbatim — the structure with its pictures, and each language's summary, words and share
card — with two departures.
Every section and every item gets a new id, and each language's words are re-keyed by the
same map, so they stay on what they were written for and the clone shares no id with its
source. And each language's title is the source's followed by a copy marker in that
language's own word, from the message files rather than the admin's locale, because the
title derives the slug, which the database numbers (`-2`, `-3`, …, cut to the length cap)
while any page holds it in that locale, live or working. Every language the source has is
copied. The tool's description says a clone is a starting structure whose every word is
rewritten before it is published — near-identical pages swapping only a city or an
audience are what search engines penalise as doorway pages — and, since a copied share
card shows only in link previews, to have the admin review each language's.

**Every write passes through one link hook in the service before it is sent**, so every
writer is held to the same links: own-site links in the markdown and in button targets
are stored canonical there, a slug address at the id of the live page it names. A link
leading to no page — or to a slug no live page has — refuses the write as a
`check_violation` naming the link, so it reaches the admin like the database's own
refusals. Each link stored at another address than the one written comes back from the
write, from and to, for the MCP tools to report — a rewrite is the save working, not a
refusal. A clone sends no words, so it has none to check.

## Completeness, publishing and slugs

**A version is complete when its title, summary and slug are written and every section
has every required word in that language.** Which words a type requires is declared in
its section module; the same rule is written once more in SQL, which is what publishing
reads, and a DB test runs both halves over one set of generated cases and requires the
same answer. Completeness depends on the structure, so it is recomputed for every version
whenever the structure changes: adding a section to a live page makes every live language
incomplete until its words are written, and the status page and the MCP tools say so,
because publishing then would leave those languages out — or, with none left, refuse.

**One Publish puts every complete version live at once**, leaves the incomplete ones in
the working copy, and refuses a page with none complete, so a published copy always holds
a version. What a publish would do — the languages going live, those left out, the live
ones taken down, and the live addresses it would change — is forecast from one admin read
by one pure function in this directory, which the status page shows before Publish is
confirmed and the MCP tools hand the AI app before it publishes. The database still
decides; the forecast is never a gate.

**"Unpublished changes" compares what publishing would copy with what is live** — the
structure's digest and, for the complete versions, their short fields (the share card
among them) and the digest of their words — so the admin list never reads a page's words.
The MCP answers give it as null while the page is not live, where false would read as
"nothing to publish".

**The status page's Publish and Unpublish are the only browser writes**, so they are the
only mutations with a cache to invalidate: the whole `landing-pages` key tree, the image
catalogue's usage map, and the `testimonials` and `guides` trees, whose "where it is used"
names each page's copies.

**Slugs are stored, per language, and can change at any time, a live language's
included.** A slug is lowercase a–z, digits and single hyphens, length-capped, and never
shaped like a uuid, so an id address and a slug address cannot be mistaken for each other.
It is unique per locale across every page, live or not, and a slug another page still has
live is refused even when that page's working version no longer holds it; a page's own
live slug never blocks it. A save that sends no slug keeps the one stored; a version that
has none takes its title's, derived in the application. A live language's new slug goes
live with the next publish, and there are no redirects, so links to the old address stop
working then. Nothing refuses that: the forecast lists each live address a publish would
change, the status page warns, and the MCP tools tell the AI app to confirm the change
with the admin before publishing. **An id address resolves in every locale; a slug
address only in its own.**

## Pictures

**Pictures are entries of the shared image catalogue, referenced by id — from a section of
the structure, or from a language version as its share picture — in three shapes: wide
16:9, square 1:1 and portrait 4:5, each its own catalogue purpose.** The shape is the
purpose's, never a claim in the structure. The page reserves each picture's box before it
loads, so each copy carries the path *and the purpose* of every picture its structure or
any of its versions names, derived by the database on every write of either — public
pages paint a picture at its shape without reading the admin-only catalogue, and a picture
only one language names is in use exactly as long as that language names it. An entry's
purpose never changes and a replace keeps it, so a shape cannot drift under a page.

**Which shapes a section takes is its type's declaration in the section registry, and the
database refuses anything else.** A hero's picture is wide only, since it is the page's
link preview and the picture its structured data leads with; a share picture is wide only
for the same reason; a guide section's picture is wide only too; a text section's picture
and an image section's pictures may be any shape; and a section's pictures are all one
shape, so an image section's grid lines up — a mixed one is refused, naming both shapes.
The same rule is written once more in the SQL that derives the pictures, and a DB test runs
every type with a picture against every shape and requires the two halves to agree. The
derivation also refuses an entry that is gone or not a landing picture. **A picture
refusal names the picture by its catalogue id and its purpose in plain words**, never a
table.

No foreign key can reach into the structure, so the catalogue's two rules are kept another
way, with the same outcome as for a Library cover: a **replace** moves every picture in
both copies at once, a live page's included, without a republish; a **removal** unlinks
the picture from both copies at once — a hero, text or guide section loses its picture, an
image section loses that picture, an image section left with none is dropped with its
words, and a language's share picture is unset — done by a trigger on the catalogue's own
delete, so it needs nothing from the remover. Either moves the working copy's "last
saved" time and saver, as a cover removal does.

## Things placed by id

**One trigger function refuses an id no row has, for every section type that names
another table's rows** — testimonials, products, a guide — attached once per type with its
arguments (the type, the key holding the ids, the table and the words of its refusal), so
a new such type is a new trigger on it, never a copy of its body. It checks only the ids a
save adds, so a write that moves only the structure's other contents is never refused for
a placement it did not make, and it names every unknown id the save adds for its type in
one `foreign_key_violation`, each under its section's number; ids of another type surface
on the next attempt.

**Testimonials are placed by id from the structure and read live from the store**
(`src/services/testimonials/`). A testimonials section names an arrangement and exactly as
many distinct testimonial ids as it shows — `feature` 1, `pair` 2, `row` 3, `showcase` 6,
through the arrangements home and About use — and another count is refused with a
sentence naming both. The count is checked in the registry and again in the SQL structure
check, and a DB test holds the two to one answer over every arrangement and count.
**Neither copy carries a testimonial's words**, so an edit shows on every live page without
a republish; the preview and the status page read the working copy's under the admin
policy. Each reader gets the testimonial's own version by the reader fallback, independent
of the page version shown. The section's only words are an optional header, and it
contributes no structured data — review markup a site writes about itself earns nothing.

**A guide is placed by id the same way** (`src/services/guides/`): a guide section names
one guide and an optional cover picture, which the picture triggers handle like a hero's.
Neither copy carries a guide's files: the live page asks the public read only which of the
guides it places exist, and the download is the guide store's, gated on a signed-in reader.
The MCP page read names each guide section's guide by its label.

**A products section promotes products an admin picks, of every type, and its picks go
stale by design.** Its structure names products by id — at least one, each once, in the
admin's order, with no maximum, since the carousel scrolls — and its words, an eyebrow, a
heading and an intro, are all optional. Each pick is drawn as the shop's own card, live,
and only while the listing holds it — listed and not ended, over every product type, so a
municipality club is drawn like a camp, its card linking to its page under its town's
`/schools` address. An ended or unlisted pick is not an error anywhere, the published
copy included, only something the admin should swap. So **the admin read
reports, per products section of the working copy, whether each pick would be drawn once
published, and why not** — ended, unlisted, or no product at all any more — and the status
page and the MCP tools both show it; the MCP product list answers the same per product.
Whether a pick is drawn is the listing's own answer, asked over the same types the public
page draws by; the reasons only explain it.

## Rendering

**The public page lives in `src/components/landing-pages/`, and every link to a landing
page is built by its address module** — the slug a locale's live version stores, else the
id — never by handing a segment to the route builder, because a slug resolves in its own
locale only and a hand-picked one is a 404 in every other. The renderer and the SEO
contribution (structured data) are each an exhaustive map over the section types.

**A section that would draw nothing is left out of the page before the layout is chosen**,
so it leaves no empty band, card or gutter: a guide the public read did not answer, a
testimonials section none of whose placed ids it answered — both produced by a publish or
unpublish landing between the page read and the read of what it places — and a products
section none of whose picks the server's listing holds. When that listing read failed the
products section is kept, and the client decides.

**Every section but the hero carries a background, `default` or `card`, and it is
structure**, shared by every language. `default` is the page ground; `card` lays the
section on a band of the card ground that runs the viewport's full width, the content
keeping the section's own container. The structure rule and the SQL check refuse a section
without one, and the hero with one; an AI app may leave it out, and the tool's schema saves
it as `default`. Adjacent `card` sections join into one band, and that is the design: it
is how an admin groups related sections, so nothing refuses or merges them, and the MCP
tools tell the AI app as much. The band carries no spacing of its own, so two sections on
one band sit as far apart as two on the page ground, and cards on a band are told apart by
their own border (`packages/sog-ui/CLAUDE.md`). The field is one shared definition in the
registry, spread into each type's schema, checked once more in SQL and held equal to it by
a DB test.

**A page may have a sticky section on each side, marked on the section itself** — a
`sticky` side, `left` or `right`, in the structure. Which types may carry it is declared in
each type's section module: allowing another is that module's one line and its renderer's
sticky classes, plus the same type in the SQL structure check, and a DB test running every
type through both halves fails until the two agree. The structure rule refuses a type not
allowed one, listing the allowed types by their type keys, and a second sticky section on
a side, naming the side and both sections — the same sentences word for word in the
TypeScript rule and the SQL check, which a DB test compares.

**A sticky section is an ordinary section that from `2xl` is also its gutter's sticky
card.** Below `2xl` it is drawn at its place in the structure, on its own background,
exactly as the same section without `sticky`. From `2xl` the same element is lifted into
the gutter on its side, outside the sections' content box and pinned under the header as
the shop's filter rail is; its background is not drawn there, since the card carries its
own edge, and the rows around it close up, so two `card` sections either side of it meet
as one band — accepted. Each section is in the document once, at its structure position,
so the outline follows the structure at every width; the look switches by `2xl` classes on
that one element, never by drawing it twice. **A section is never narrowed or padded for a
card**: with one card the content keeps its full measure, moving away from the card only
as far as the viewport makes it; with a card on each side both gutters hold their floor,
so the content stays centred and its track narrows (the page body's comment works the
widths through). Every sticky type draws in the one sticky card frame the renderer shares,
in place of its own card rather than around it, so the cards read as one family.

**The page's outline is the hero's H1 and an H2 for each section heading written, and the
titles of a section's items — its points, steps, questions or product cards — are H3s
under that H2, or H2s themselves where the section has no heading written.** A fixed H3
would skip a level after the H1, or file the items under an earlier section's heading,
which is what a screen reader and an AI app reading the outline are handed.

**A page with products sections reads the listing of every product type and seat counts
on the server, once for all of them, before its HTML** — the live page and the preview
alike, with no Suspense boundary — so the cards, or a section's absence, are in the first
byte and nothing below them moves; a failed read seeds nothing, and the cards then arrive
with the client's own fetch. That listing seeds a cache entry of its own, keyed on its
types, and never the shop's, whose key promises the shop's three types alone. Its
structured data gains one shop-style `ItemList` per products section, naming the cards it
draws whose page is promoted — never a municipality club, whose `/schools` page is
reachable and not promoted — and never repeats a product's own markup, which stays on the
product's page.

## Search engines, link previews and the index

**What the page serves to search engines and link previews is decided by one function**
over a published copy, in `src/components/landing-pages/` — the title, description,
canonical, `hreflang` and share card — which the page hands to Next and the MCP tools run
over the copy a publish now would leave (the working copy's complete versions, built in
this directory). Every rule about those values goes into that function, never beside it,
so what an AI app is told the next publish serves is what it serves.

**A page's link preview is derived from the page, per language, unless the admin overrides
it.** Derived, it carries the shown version's title and summary and the hero's picture —
the one its structured data names as the picture the page leads with — with that version's
alt text; a hero without one shares the site-wide card. Each language may override part of
its own card: a **share title**, capped at a share card's length, and a **share picture**
with its alt text — wide, like the hero's, since the preview is drawn wide. The picture is
per language, not structure, because a share picture often carries words of its own, as
the app's own drawn cards do per locale. The description is always the summary. None of it
counts toward completeness. The share card is written with the language's words, but a
share field changes only when the call sends it, an empty value clearing it, so a call
that rewrites the words cannot drop a card it did not mention. An override does not follow
later edits to the title or the hero, so the status page and the MCP page read each show
the card a language uses, derived or custom. Whichever picture the card shows is placed in
every chat and feed the page is shared to, so a partner's mark in a hero picture or a
share picture needs that partner's sign-off (`src/CLAUDE.md`).

**`/discover` lists every live page, newest first**, each card in the reader's version at
the index's own locale, with the picture its hero leads with where it has one; there is
no opting out, because the index is what keeps the pages from being orphans to a crawler.
The footer links it from every page, and the header and the tab bar deliberately do not:
people reach landing pages from advertising, not by browsing. **Each page carries a
breadcrumb trail — the index, then the page — drawn on the page and stated as its
`BreadcrumbList` from the same names**, so the structured data names nothing the reader
cannot see.

**Every publish and unpublish goes through one helper per action in `src/lib/indexnow/`**,
which runs the service's own publish on the caller's client and then submits every
address the change touched to IndexNow — the slug address in each indexed language the
page is live in, before and after, so an old slug and an unpublished page are submitted
too, and the `/discover` index. The admin's status page reaches it through its publication
route, since the browser cannot submit; the MCP tools call it directly. A submission is
made from the production deployment alone and never fails the publish
(`docs/architecture/site-quality.md`).

## The email sign-up

**The email sign-up section (`subscribe`) is a one-way send to Klaviyo, and Sogverse
stores nothing about the person.** The form takes an address, an optional first and last
name and the consent box, and posts to `/api/landing-pages/subscribe`, which writes the
profile to Klaviyo and subscribes it to the newsletter list; nothing is ever read back.
The list is single opt-in, so the reader is on it as soon as the route answers. A sign-up
is not an account and never touches an account's marketing consent. The profile carries
the address, the names given, the page's locale, the landing page's id, and the visit's
UTM values only under marketing consent — nothing else. The section has no shared field
but its background and its sticky side; its form copy, consent sentence included, is fixed
copy in `landingSubscribe`, and the page writes only the ask. The route refuses a body
without the ticked consent and a page whose published copy no longer holds the section,
and answers a new address and a known one identically. **The names are anyone's words, an
accepted risk**: anyone can submit any address, and the import overwrites the names
Klaviyo holds for it, so a mail that prints a subscriber's name may print a stranger's
text. The owner accepted that over dropping the names.
