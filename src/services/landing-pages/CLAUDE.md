# Landing pages

Marketing pages an admin authors — for a school, a city, a business, an event — that exist
to be found by search engines and AI apps first and people second. The model is the
Library's (`src/services/library/CLAUDE.md`) wherever this file says nothing different;
the sections are the registry's, in `src/lib/landing-pages/sections/`.

**Pages are written only through the MCP server** (`src/lib/mcp/`), by an AI app acting as
the admin. In Sogverse an admin has the list of pages, a tab of the Marketing hub, and, for each, a status page that is
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
**A language leaves by a writer of its own**, which removes that version from the working
copy alone and refuses the page's last one: a live language stays live until the next
publish, which takes it down.

**A clone is a create whose content the database copies in one call**, so no word passes
through the application or the AI app. Everything in the source's working copy is copied
verbatim — the structure, the pictures (catalogue entries are shared, so the clone names
the same ones) and each language's summary and words — with two departures. Every section
and every item gets a new id, and each language's words are re-keyed by the same map, so
they stay on what they were written for and the clone shares no id with its source. And
each language's title is the source's followed by a copy marker in that language's own
word, from the message files rather than the admin's locale, because each title derives
that language's slug: the slug is the new title's, derived in the application as for a
version without one, and the database numbers it (`-2`, `-3`, …, cut to the length cap)
while any page holds it in that locale, live or working. The clone is unpublished and
stamped with its saver like any create. The application names the languages to copy, and
one the source does not have is refused. The tool's description carries the rule that
matters most: a clone is a starting structure, and every word is rewritten for the new
page before it is published, since near-identical pages that only swap a city or an
audience are what search engines penalise as doorway pages.

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

**Readers fall back from their locale to English to the earliest version written** in
`SUPPORTED_LOCALES` order — exactly the Library's rule (`src/i18n/CLAUDE.md`, "Content
written per locale"). An id address resolves in every locale; a slug address only
in its own.

**Pictures are entries of the shared image catalogue, referenced by id from the structure,
in three shapes: wide 16:9, square 1:1 and portrait 4:5, each its own catalogue purpose.**
The shape is the purpose's, never a claim in the structure: the catalogue stores no size,
and the page has to reserve each picture's box before it loads, so each copy carries the
path *and the purpose* of every picture its structure names, derived by the database — so
public pages paint a picture at its shape, from its bucket, without reading the
admin-only catalogue, and the shape cannot disagree with the file. An entry's purpose
never changes and a replace keeps it, so a picture's shape cannot drift under a page.

**Which shapes a section takes is its type's declaration in the section registry, and the
database refuses anything else.** A hero's picture is wide only, since it is the page's
link preview and the picture its structured data leads with; a text section's picture and
an image section's pictures may be any shape; and a section's pictures are all one shape,
so an image section's grid lines up — a mixed one is refused, naming both shapes. The
same rule is written once more in the SQL that derives the pictures, and a DB test runs
every type with a picture against every shape and requires the two halves to agree. The
renderer lays each shape out on its own terms (a square or portrait picture beside words
is held narrower than its column, so it does not tower over them) with its box and its
`sizes` stated for that shape.

The derivation also refuses an entry that is gone or not a landing picture. No foreign key
can reach into the structure, so the catalogue's two rules are kept another way, with the
same outcome as for a Library cover: a **replace** moves every picture in both copies at once, a live
page's included, without a republish (the replace's landing half is a database function
the catalogue's replace calls beside the Library's); a **removal** unlinks the picture
from both copies at once — a hero or text section loses its picture, an image section
loses that picture, and an image section left with none is dropped with its words —
done by a trigger on the catalogue's own delete, so it needs nothing from the remover.
Either moves the working copy's "last saved" time and saver, as a cover removal does.

**Testimonials are placed by id from the structure and read live from the store**
(`src/services/testimonials/`). A testimonials section names an arrangement and exactly as
many distinct testimonial ids as it shows — `feature` 1, `pair` 2, `row` 3, `showcase` 6,
the layouts the home page and About use, drawn through the one set of arrangements the
three pages share — and a save with another count is refused with a sentence naming both.
The count is checked in the registry and again in the SQL structure check, and a DB test
holds the two to one answer over every arrangement and count. An id no testimonial has is
refused loudly by a trigger on the working copy, which checks only the ids a save adds, so
a write that moves only the structure's other contents is never refused by a placement it
did not make. **One trigger function serves every section type that names another table's
rows by id**, attached once per type with its arguments — the type, the key holding the
ids, the table and the words of its refusal — so a new such type is a new trigger on it,
never a copy of its body. **Neither copy carries a testimonial's words**: the live page
reads them per request through the public read that answers only what the published copy places, so an
edit to a testimonial shows on every live page at once, without a republish, while a
testimonial placed only in a working copy stays admin-only; the preview and the status
page read the working copy's from the store under the admin policy. Each reader gets the
testimonial's own version by the reader fallback, independent of the page version shown.
The section's only words are an optional header, so it never makes a version incomplete,
and it contributes no structured data — review markup a site writes about itself earns
nothing. Its words are never written through a landing page tool, and a quote comes off a
page by saving the structure without it.

**A page's link preview is its hero's picture**, the one its structured data names as the
picture the page leads with, with the shown version's alt text; a hero without one shares
the site-wide card. So placing a hero picture places it in every chat and feed the page is
shared to, and a partner's mark in one needs that partner's sign-off (`src/CLAUDE.md`).

**A products section promotes products an admin picks, of every type, and its picks go
stale by design.** Its structure names products by id — at least one, each once, in the
admin's order, with no maximum, since the carousel scrolls — and its words, an eyebrow, a
heading and an intro, are all optional, so it never makes a version incomplete. Each pick
is drawn as the shop's own card in the product rail the Roblox page draws, so everything on
a card is the shop's, live; a pick is drawn only while the listing holds it — listed and
not ended, over every product type, so a municipality club is drawn like a camp, its card
linking to its page under its town's `/schools` address as its card on that town's page
does — and a section whose picks are none of them listed is not drawn at all — no heading,
no empty state. **A pick no product has is refused when a structure naming it is saved**,
by the database and not by the link hook: the shared trigger refuses it as a
`foreign_key_violation` naming the section and the id, the same code a picture gone from
the catalogue is refused with. The published copy has no such check: an ended or unlisted
pick is not an error anywhere, only something the admin should swap. So **the admin read
says, per products section of the working copy, which picks readers are not shown and
why** — ended, unlisted, or no product at all any more — and the status page and the MCP
tools both show it. Whether a pick is shown is the listing's own answer, asked over the
same types the public page draws by; the reasons only explain it. The MCP product list
answers the same question per product, from the same read.

**The working copy records who last saved it, and through which AI app**, by the same
trigger pattern as the Library: no writer passes either, and publishing moves neither.

**Every write passes through one link hook in the service before it is sent**, so every
writer is held to the same links: own-site links in the markdown and in
button targets are stored canonical there, a slug address at the id of the live page it
names. A link leading to no page — or to a slug no live page has — refuses the write as a
`check_violation` naming the link, so it reaches the admin like the database's own
refusals. Nothing else in the save path touches a link. A clone sends no words, so it has
none to check: the words it copies were made canonical when they were saved.

**Every landing page write invalidates the whole `landing-pages` key tree**, the admin
detail included, the image catalogue's usage map, and the `testimonials` tree, whose
"where it is used" names each page's copies.

**Every publish and unpublish goes through one helper per action in `src/lib/indexnow/`**,
which runs the service's own publish on the caller's client and then submits every
address the change touched to IndexNow — each live language's slug address before and
after, so an old slug and an unpublished page are submitted too, and the `/discover`
index. The admin's status page reaches it through its publication route, since the
browser cannot submit; the MCP tools call it directly. A submission is made from the
production deployment alone and never fails the publish (`docs/architecture/site-quality.md`).

**The email sign-up section (`subscribe`) is a one-way send to Klaviyo, and Sogverse
stores nothing about the person.** The form takes an address, an optional first and last
name and the consent box, and posts to `/api/landing-pages/subscribe`, which writes the
profile to Klaviyo and subscribes it to the newsletter list; nothing is ever read back. The
list is single opt-in, like the blog's newsletter form, so the reader is on it as soon as
the route answers and the form gives way to "you are signed up". An address that had
unsubscribed is simply subscribed again. Klaviyo records the consent and handles every
unsubscribe. A sign-up is not an account and never touches an account's marketing
consent; accounts are not synced to Klaviyo either. What the profile carries is the
address, the names given, the page's locale, the landing page's id, and the visit's UTM
values only under marketing consent — nothing else. The list is the deployment's
(`KLAVIYO_*` in the environment, read by `src/lib/landing-pages/subscribe-config.server.ts`):
the local server and Vercel Preview use a staging list, and production the real one. So
the section has no shared field; its form copy, consent sentence included, is fixed copy
in `landingSubscribe`, and the page writes only the ask. The route refuses a body without
the ticked consent and a page whose published copy no longer holds the section, and
answers a new address, a known one and a filled honeypot identically. The admin's preview
draws the form with its button disabled. **The names are anyone's words, an accepted
risk**: anyone can submit any address, and the import overwrites the names Klaviyo holds
for it, so a mail that prints a subscriber's name may print a stranger's text. The owner
accepted that over dropping the names; a flow or campaign that greets by name is the
admins' call with that in mind. A later section offering something on sign-up (a
download) would add a shared field to this type, not a second form.

**The public page lives in `src/components/landing-pages/`, and every link to a landing
page is built by its address module** — the slug a locale's live version stores, else the
id — never by handing a segment to the route builder, because a slug resolves in its own
locale only and a hand-picked one is a 404 in every other. The renderer and the SEO
contribution (structured data) are each an exhaustive map over the section
types. Every section sits on the plain page ground: an admin chooses the order, so a
tinted band could land beside another and read as one section. **A page with products
sections reads the listing of every product type and seat counts on the server, once for
all of them, before its HTML** — the live page and the preview alike, with no Suspense
boundary — so the cards, or a section's absence, are in the first byte and nothing below
them moves; a failed read seeds nothing, and the cards then arrive with the client's own
fetch. That listing seeds a cache entry of its own, keyed on its types, and never the
shop's, whose key promises the shop's three types alone. Its structured data gains one
shop-style `ItemList` per products section, naming the cards it draws whose page is
promoted — never a municipality club, whose `/schools` page is reachable and not promoted
— and never repeats a product's own markup, which stays on the product's page.

**`/discover` lists every live page, newest first**, each card in the reader's version at
the index's own locale, with the picture its hero leads with where it has one; there is
no opting out, because the index is what keeps the pages from being orphans to a crawler.
The footer links it from every page, and the header and the tab bar deliberately do not:
people reach landing pages from advertising, not by browsing. **Each page carries a
breadcrumb trail — the index, then the page — drawn on the page and stated as its
`BreadcrumbList` from the same names**, so the structured data names nothing the reader
cannot see.
