# Product image catalogue

Admins own a shared collection of pictures. A product does not have a file; it points at
a catalogue entry, and many products may point at the same one. Every surface that paints
a product picture still reads `products.image_path` and knows nothing about this table.

## The four rules that make the design work

**An object is named by the sha256 of its bytes, and is never written over.** Uploading
the same picture twice therefore resolves to the same object and the same row — that is
the whole dedup mechanism, and it is what lets a bucket URL promise that its bytes never
change (the image optimizer caches on that promise for a year). Uploads use
`upsert: false`, and storage answering "already exists" is **success**, not a conflict:
the bytes at that key are by construction the bytes we were about to write.

**An entry is immutable except for its label.** Bytes never change, so a path never
changes, so nothing that already points at an entry can be surprised by it. The label is
the only column an admin can edit.

**`products.image_path` is derived by a database trigger and is never written by
application code.** Application code writes `products.image_id`; the trigger fills the
served path from the linked entry on every products write, and NULLs it whenever
`image_id` is NULL — on insert and update alike, whatever the statement said about the
column. So "this product has no entry" and "this product has no picture" are the same
sentence, and there is no third state. Nothing here — no route, no service, no script —
assigns a path to a product. If a path looks wrong, the link is wrong.

**Replace is a repoint, not an edit.** It resolves the new bytes to their entry
(creating one if needed, inheriting the old entry's label) and then runs a single
`UPDATE products SET image_id = new WHERE image_id = old`. One statement, so every linked
product follows atomically and the trigger writes each path. The old entry stays in the
catalogue, unlinked, which is what makes a replace reversible. When the new bytes resolve
to the entry being replaced, that is a no-op that relinks nothing — not an error.

Removal is the mirror: the row goes, the foreign key nulls every `image_id` pointing at
it, the trigger nulls each path, and the object is deleted. An object left behind by a
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

**There is deliberately no foreign key from `products.image_path` to
`product_images(path)`, and adding one is a breaking change.** It looks like the missing
half — let Postgres own "a served path is a catalogue path" — and it was written, applied
to staging and reverted within the hour. PostgREST resolves an embed by finding *the*
relationship between two tables; with two, it refuses the request with PGRST201 and every
caller has to name the key it means. The admin product detail query embeds this table, so
the observed effect was every admin product page reporting "product not found", caused by
a migration alone. **Never add a second relationship between `products` and
`product_images` without hinting every existing embed in the same change.** And the key
would buy nothing here: the trigger above already is the guarantee.

Should the bucket and the catalogue ever need reconciling, that is a join rather than a
program: `product_images.path` against `storage.objects.name` for the `product-images`
bucket, in both directions — a row with no object, and an object no row names.

## Reads have no routes; writes have four

Reads go through the injected client. The table is admin-only at the database, so an
admin's own session is all the authority a read needs and a route would add nothing. Both
reads are walked with the shared paging primitive: the catalogue only grows, and an image
an admin cannot see is precisely what this feature exists to prevent.

Usage — which products a given entry reaches — is **derived** from a products read and
computed in JavaScript. It is not stored, and there is no counts map beside the lists: a
badge's number is its list's length, because two derivations of one number is how they
come to disagree.

Writes go through the API routes because they touch the storage bucket, which has no
policies and needs the service-role client the browser must never hold. Inside a route the
split is deliberate: **storage on the admin client, the catalogue table on the caller's own
session.**

## Cache invalidation — and the one key that must not be touched

Every catalogue mutation invalidates three keys: the catalogue list, the usage map, and
the products **list** keys (those surfaces paint the derived path, and a repoint changes
it under them).

**Never invalidate the admin product *detail* key, and never invalidate the products
parent key** — the parent cascades into the detail one. The product form seeds its state
once from the detail query, so refetching it while the dialog is open would discard a
half-filled form. This is a constraint to keep, not an accident, which is why the three
keys are listed individually rather than swept with one parent key.

## Uploads

The cap is 4 MB and it is checked on both sides. The platform refuses a larger body before
it reaches the route, so the client-side check exists to give the admin the real reason
instead of a network failure. The route checks again because a route never trusts its
caller. Two refusals carry a stable code for the UI to translate — over the cap, and a
type outside the accept list; everything else surfaces the route's own admin-facing
English verbatim, as the neighbouring product routes do.

**The accept list has exactly one definition in this codebase**, held as a `Map` in the
contracts module; every caller reaches it through the one resolver rather than restating
the pairs. Two copies of one list drift — and an object literal keyed by a
caller-supplied filename fragment answers `constructor` and `__proto__` from its
prototype chain, which is how a file named `castle.constructor` once passed the 415 gate.
A `Map` has no inherited keys.

The database holds the only other copy, in the `path` CHECK described below, and the two
lists differ by exactly one entry on purpose: `jpeg` is accepted on upload and normalised
to `jpg` before anything is stored, so it appears in the map and not in the CHECK.
Widening one without the other is a defect in whichever direction you get it wrong.

A new entry's label is the one supplied, else the upload filename's stem, else a plain
fallback — trimmed and capped rather than refused, because throwing away the bytes over a
cosmetic field would be the wrong trade. Renaming, where the label *is* the request,
validates strictly instead.
