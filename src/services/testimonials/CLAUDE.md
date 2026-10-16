# Testimonials

Marketing's one store of testimonials — real words from real parents, gamers and gedus —
and the home spots that put some of them on the public site. The admin pages are in
`src/components/admin/testimonials/`, a tab of the Marketing hub; the public rendering is
`src/components/home/testimonial.tsx`.

**A testimonial is its words per language and nothing else.** One row per (testimonial,
locale) in `testimonial_translations`, each with whom the quote is from (`from` in the app,
stored as `attribution` because FROM is SQL's own word) and the quote, both required; at
least one version per testimonial. No original language, status, kind of giver, name,
place, photo or date of the admin's own: adding a field is easier than removing one, so one
arrives only with an owner's decision. Readers pick their version with
`resolveTranslation()`. Admins are trusted: adding a testimonial is the clearance, with no
consent workflow.

**The words are the giver's.** No surface writes, embellishes or "improves" them — the
editor's hints and the MCP tool descriptions say so — and translating an admin-supplied
quote into another locale is what the versions are for.

**A stored quote never carries quotation marks; the page adds its reader's.** The
renderer wraps the picked version in the page locale's `testimonial.quoted` template, so
every locale quotes in its own style. A quote starting or ending with a quotation mark is
**refused, never stripped**: the writer is told to leave the marks out, and nothing
changes their words behind their back. The marks are listed once in the contracts, and
the database's CHECK and writers name the same set — a DB test runs every mark through
both. The apostrophes are not marks: a word may start or end with one.

**Who created a testimonial, who last saved it, when, and through which AI app are
stamped by a trigger**, the Library's saver pattern: no writer passes them, a write with
no signed-in caller (a migration) records no one.

**Writes are whole or one language at a time, and the two never mix.** The editor saves
the whole version set, so a language left out is removed; the MCP tools write or remove
one language alone, never touching another admin's.

**The home spots are data, and only migrations write them.** `home_testimonials` holds
which testimonial fills which position of `feature` (under the hero, one), `safety` (beside
the safety facts, two) and `row` ("What parents tell us", three). About shows exactly the
same testimonials in the same three groups, with no setup of its own. **No admin surface
and no MCP tool assigns a spot**, and no Data API role holds a write grant on the table:
the home and About pages are the site's front door, so their composition is a developer's
decision, made in a migration, while the words are an admin's. A spot renders what it
holds, and an empty one renders nothing — the row's heading included.

**The public reads the placed testimonials alone**, through `list_home_testimonials`, on
an anon client per request; the store itself is admin-only. A failed read renders the
home page and About without their quotes and logs the failure, rather than failing the
site's front door.

**Where a testimonial is used is a list of usages, one kind of place per member of a
union.** The admin read derives it, the editor lists each place with its public page, and
the MCP tools answer it. A new kind of place joins the union, the read's embed, and the
delete's check — and every consumer that assumes a home spot stops compiling until it
handles the new kind.

**A testimonial in use cannot be deleted.** `delete_testimonial` refuses it with a
sentence naming the spot (`foreign_key_violation`), and the placement's foreign key
restricts beneath the check. The list disables Delete for a used testimonial. Editing a
used testimonial is allowed; the editor shows where it is used above the words, which is
what makes that a visible decision.

**Every write invalidates the whole `testimonials` key tree**, list and detail alike.
