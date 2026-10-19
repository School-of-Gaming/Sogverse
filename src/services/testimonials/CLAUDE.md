# Testimonials

Marketing's one store of testimonials — real words from real parents, gamers and gedus —
for the pages admins compose. The admin pages are in `src/components/admin/testimonials/`,
a tab of the Marketing hub; the public rendering is `src/components/home/testimonial.tsx`,
which takes a quote and whom it is from as plain data.

**The home page's and About's quotes are not in this store.** Those pages are
developer-authored, so their quotes are message strings like the rest of their copy, and
the same component renders them.

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
renderer wraps every quote it is given in the page locale's `testimonial.quoted`
template, so every locale quotes in its own style — the message-string quotes carry none
either. A quote starting or ending with a quotation mark is
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

**Testimonials are never deleted by the app.** Once created a testimonial stays — no
admin page, MCP tool or database function deletes one, and no Data API role but the
service role holds DELETE on the table (the DB test suite removes its own rows with it).
Removing one language version is editing, and refuses the last.

**Every write invalidates the whole `testimonials` key tree**, list and detail alike.
