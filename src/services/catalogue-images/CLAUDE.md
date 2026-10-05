# Image catalogue

Admins own a shared collection of pictures. A product does not have a file; it points at
a catalogue entry, and many products may point at the same one. A Library article's cover
is an entry too, linked from both of the article's copies — the working copy and the
published one. Every surface that paints a picture reads a derived path
(`products.image_path`, or an article copy's `cover_path`) and knows nothing about this
table, which is admin-only; that is what lets the public Library read a live cover.

## The four rules that make the design work

**An object is named by the sha256 of its bytes, and is never written over.** Uploading
the same picture twice for one purpose therefore resolves to the same object and the same
row — that is the whole dedup mechanism, and it is what lets a bucket URL promise that its bytes never
change (the image optimizer caches on that promise for a year). Uploads use
`upsert: false`, and storage answering "already exists" is **success**, not a conflict:
the bytes at that key are by construction the bytes we were about to write.

**An entry is immutable except for its label.** Bytes never change, so a path never
changes, so nothing that already points at an entry can be surprised by it. The label is
the only column an admin can edit.

**A served path is derived by a database trigger and is never written by application
code.** Application code writes `products.image_id`, or an article copy's
`cover_image_id`; a trigger on each table fills the served path from the linked entry on
every write, and NULLs it whenever the link is NULL — on insert and update alike, whatever
the statement said about the column. So "this has no entry" and "this has no picture" are
the same sentence, and there is no third state. Nothing here — no route, no service, no
script — assigns a path. If a path looks wrong, the link is wrong.

**Replace is a repoint, not an edit.** It resolves the new bytes to their entry
(creating one if needed, inheriting the old entry's label) and then moves every link:
`UPDATE products SET image_id = new WHERE image_id = old` on the admin's session, and
`repoint_library_covers(old, new)` for the Library, whose tables carry no write grant —
one statement over both of an article's copies, so a live cover changes with no
republish. Each is one statement, so every linked product, and every linked article,
follows atomically and the triggers write each path; a product links only a `product`
entry and an article only a `library_cover` one, so for any entry at most one of the two
moves anything. The new entry has the replaced one's purpose, whatever the request says. The old entry
stays in the catalogue, unlinked, which is what makes a replace reversible. When the new
bytes resolve to the entry being replaced, that is a no-op that relinks nothing — not an
error.

A landing page's pictures are named inside its section structure, where no foreign key
reaches, so their half of a replace is `repoint_landing_images(old, new)`, the same shape
over both of a page's copies (`src/services/landing-pages/CLAUDE.md`).

Removal is the mirror: the row goes, the foreign keys null every link pointing at it —
live covers included — the triggers null each path, and the object is deleted. A landing
page's pictures are unlinked by a trigger on the row's delete instead, to the same effect. An object left behind by a
failed removal is logged rather than retried — re-uploading the same file recreates the
row over the surviving object, because the object's name is still the hash of those
bytes.

The one thing removal never deletes is an object some *other* row has come to name.
Content addressing makes that a live race: between the row delete and the object removal
another admin may upload the same picture and be handed the same key back, and removing
it would break their entry instead. So the table is asked again for that path before the
bucket is touched, and anything short of a clear "no row names this" — a hit, or a
failure to ask — keeps the bytes. Bytes nothing references cost storage; bytes a row
references are somebody's picture.

## The invariants live in the schema, not in the code that keeps them

The rules above are not conventions this directory agrees to follow — each is enforced by
the database, so code that gets one wrong fails loudly instead of leaving a row nobody
notices:

- **`sha256` is 64 lowercase hex characters** — a CHECK. The column *is* a picture's
  identity, so a value that is not a hash is a row the bytes it claims to name can never
  find again.
- **`path` is exactly `<sha256>.<ext>`** — a CHECK, with `ext` from the accept list
  described under "Uploads". The key cannot drift from the bytes it names.
- **The trigger has no column list**, so no statement can name `image_path` and win — and
  it derives the column on every write, so it is that column's *only* writer. This is why
  nothing in application code may write it and why the product RPCs take no image
  parameter at all.
- **A product links only a `product` entry, and an article's cover only a
  `library_cover` one** — each table's trigger refuses any other purpose (23514). The
  catalogue dialog, opened for one purpose, lists only that purpose, so this fires only on
  a state the UI cannot produce.
- **An entry's purpose never changes** — a BEFORE UPDATE trigger on the table refuses any
  update that moves it (23514), while a label edit passes. The object lives in the
  purpose's bucket and every link was checked against the purpose when it was made, so a
  changed purpose would name the wrong bucket under each of them.
- **Dedup is per purpose** — `sha256` and `path` are each UNIQUE together with `purpose`,
  not on their own. The same bytes uploaded as a product picture and as a Library cover
  are two objects under one key in two buckets, so they are two rows with the same path.

Should a bucket and the catalogue ever need reconciling, that is a join rather than a
program: `catalogue_images.path` against `storage.objects.name`, matching each purpose to
its bucket, in both directions — a row with no object, and an object no row names.

## Reads have no routes; writes have four

Reads go through the injected client. The table is admin-only at the database, so an
admin's own session is all the authority a read needs and a route would add nothing. Both
reads are walked with the shared paging primitive: the catalogue only grows, and an image
an admin cannot see is precisely what this feature exists to prevent.

Usage — which products and Library articles a given entry reaches — is **derived** from
a products read and an articles read and computed in JavaScript. An article is listed by
its working title, under the entry its working copy links and under the one its live copy
links, which differ while a cover change is unpublished; a replace or a remove reaches
both. It is not stored, and there is no counts map beside the lists: a
badge's number is its list's length, because two derivations of one number is how they
come to disagree.

Writes go through the API routes because they touch the storage buckets, which the routes
write through the service-role client the browser must never hold. The one other writer is
the MCP server's Library cover uploader (`src/lib/mcp/`), which adds a cover through the
same checks and the same find-or-create as the upload route, from the server module here. Each bucket also
carries admin-only write policies on `storage.objects`, the same three on both; nothing
uses them today, and they are what an admin's own session would be held to. Inside a route the
split is deliberate: **storage on the admin client, the catalogue table on the caller's own
session.**

## Cache invalidation — and the one key that must not be touched

Every catalogue mutation invalidates the catalogue list, the usage map, the products
**list** keys and the Library's whole admin tree (those surfaces paint a derived path,
and a repoint changes it under them).

The usage map is read from products and Library articles together, so a product's create
and update and every Library write (create, save, publish, unpublish) invalidate it too:
a stale map shows a live cover as unused, and removable without warning. Its key sits in
`catalogue-images.keys.ts`, which imports no other feature's module, so the product and Library hooks can
name it without an import cycle.

**Never invalidate the product's admin *detail* key, and never a parent key that cascades
into it.** The product form seeds its state from the detail query, so refetching it while
the dialog is open would discard a half-filled form. This is a constraint to keep, not an
accident, which is why the product keys are listed individually rather than swept with
one parent key. The Library's admin detail is the opposite case and *must* be refetched:
a replace or a removal moves the working copy's cover in the database, and a detail left
cached makes the open editor read the followed cover as an unsaved change. The Library
editor seeds its form once per article id, so that refetch never touches the admin's
typing.

## Purposes, buckets and exact sizes

Every entry records its **purpose**, what it is for, set when it is created and never
changed:

| Purpose | Bucket | Stored size |
|---|---|---|
| `product` | `product-images` | exactly 1200 × 800 |
| `library_cover` | `library-covers` | exactly 1600 × 900 |
| `landing_image` | `landing-images` | exactly 1600 × 900 |

The purpose is a column; the bucket and the size live once, in the purpose map in
`src/lib/images/`, which everything reads them from: URL building, the upload and the
removal, the crop dialog, the size check and the image optimizer's allowed patterns in
`next.config.ts`. Both buckets are public, and every URL is built from the purpose, since
the same path can exist in both.

**The table stores no aspect ratio, width or height, and a ratio never decides a
purpose.** A purpose outlives any one crop: if the shop's crop changes, product pictures
are still product pictures, so the change is one edit to the map and no row moves. The
database never sees the bytes either, so a stored size would be a claim nobody checked.

Where each rule is enforced:

- **The size — the upload routes and the MCP cover uploader**, the only writers to the
  buckets, sharing one set of checks. Each reads the pixel
  size from the uploaded bytes and refuses anything that is not a JPEG of exactly its
  purpose's size, with a stable code. A new entry's purpose is the form's `purpose` field;
  a replacement takes the replaced entry's purpose and ignores the field, because
  everything following the repoint may link only that purpose. The browser always sends a
  conforming file: every upload, and every replace, goes through the shared crop dialog at
  its purpose's size, and the crop comes out as a JPEG.
- **Linking and immutability — the database**, as listed under the invariants above.
- **The bucket's own cap and types — storage.** `library-covers` refuses anything over the
  routes' 4 MB or other than JPEG before the bytes land; `product-images` still holds
  entries from before uploads were JPEG only, so it carries no type list.

Entries uploaded before sizes were enforced may be any size, and they keep working
everywhere. **They are corrected by hand rather than by code**: the app neither detects
nor repairs one.

## Uploads

The cap is 4 MB and it is checked on both sides. The platform refuses a larger body before
it reaches the route, so the client-side check exists to give the admin the real reason
instead of a network failure. The route checks again because a route never trusts its
caller. Three refusals carry a stable code for the UI to translate — over the cap, not a
JPEG, and not the purpose's exact size; everything else surfaces the route's own
admin-facing English verbatim, as the neighbouring product routes do.

**The accept list has exactly one definition in this codebase**, held as a `Map` in the
contracts module; every caller reaches it through the one resolver rather than restating
the pairs. Two copies of one list drift — and an object literal keyed by a
caller-supplied filename fragment answers `constructor` and `__proto__` from its
prototype chain, which is how a file named `castle.constructor` once passed the 415 gate.
A `Map` has no inherited keys.

The database holds the only other copy, in the `path` CHECK described above. Uploads are
JPEG only, so the map holds `jpg` and `jpeg` (normalised to `jpg` before anything is
stored); the CHECK holds `jpg` plus `png`, `webp` and `avif`, the extensions of entries
from before uploads were JPEG only. So the CHECK is a superset of what an upload can
store. An extension the map accepts and the CHECK refuses is an upload that fails after
its bytes are already in the bucket, so widening the map means widening the CHECK in the
same change.

A new entry's label is the one supplied, else the upload filename's stem, else a plain
fallback — trimmed and capped rather than refused, because throwing away the bytes over a
cosmetic field would be the wrong trade. Renaming, where the label *is* the request,
validates strictly instead.
