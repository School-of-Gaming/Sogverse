# Guides

Marketing's store of guides — PDFs a landing page hands out, a parents' guide or a school's
information pack — for the landing pages' guide sections
(`src/services/landing-pages/CLAUDE.md`). The model is the testimonials'
(`src/services/testimonials/CLAUDE.md`) wherever this file says nothing different.

**A guide is its files per language plus a label, and nothing else.** One file per
(guide, locale); at least one, so a guide is created together with its first file and its
last file cannot be removed. The label names the guide in the admins' lists and is never
shown to a reader: the section placing a guide carries the words a reader sees. Who created
it, who last saved it, who uploaded each file, and through which AI app, are stamped by
triggers. Readers get their language's file by `resolveTranslation()`.

**The files never have a public URL.** They live in the private `guides` bucket, which
only an admin's session can read; a reader gets one only through the download route,
which asks the database on the reader's own session which files they may have and then
reads the chosen object with the service role. Never sign or hand out a URL to an object
another way, and never call the download read on the service role, which the database
would answer for anyone.

**Who may download is the database's answer, not the route's**: any signed-in account,
whatever its role, for a guide the published copy of some live landing page places; an
admin for any guide, so a preview of a working copy downloads too. A signed-out visitor
sees the section through the public read — the ids of the guides a live page places,
nothing about their files — and has no download, which is the whole of the gate. No watermark and no download
log, by the owner's ruling.

**Every upload is a fresh object**, at `<guide id>/<locale>/<random uuid>.pdf`, which the
database holds the path to, so a replaced file is never served stale from any cache. The
writer answers the path it replaced or removed, and the caller deletes that object; an
object left behind by a failed delete is unreachable and only logged.

**Bytes go through one server-side store function** that both the admin tab's upload route
and the MCP upload tool call. It checks the bytes start as a PDF and fit the cap its
caller passes, puts them in the bucket with the service-role client, and writes the rows
with the admin-guarded functions on the caller's own session, so the database decides who
may store a guide. The two caps — 4 MB through the route, about 2.9 MB through the MCP
view — are accepted limits of the platforms, left until they become a problem; a refusal
sends the admin to re-export the PDF smaller.

**Guides are never deleted by the app.** No page, tool or function deletes one, and no
Data API role but the service role holds DELETE. A guide comes off a page by that page's
structure being saved without it.

**Where a guide is used is the list of landing pages placing it**, derived from every
page's two copies, as for a testimonial.

**Every write invalidates the whole `guides` key tree** and the landing pages' tree.
