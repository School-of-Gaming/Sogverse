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
served path from the linked entry on every products write. Nothing here — no route, no
service, no script — assigns a path to a product. If a path looks wrong, the link is
wrong.

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

A new entry's label is the one supplied, else the upload filename's stem, else a plain
fallback — trimmed and capped rather than refused, because throwing away the bytes over a
cosmetic field would be the wrong trade. Renaming, where the label *is* the request,
validates strictly instead.
