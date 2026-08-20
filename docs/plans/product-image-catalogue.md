# Product image catalogue (v1): shared images admins pick, upload, replace and remove

## Problem

A product's picture is a text column (`products.image_path`) holding a storage key. The file
rides along in the product's multipart POST, the two admin product routes
(`src/app/api/admin/products/create/` and `.../[id]/update/`) mint a fresh random UUID path
per upload, and the update route deletes the previous object whenever a product's path
changes. Images are not entities: there is nothing to browse or reuse, and nothing knows that
two products share a picture.

Admins reuse pictures constantly — an approved set of a few dozen game illustrations covers
the whole shop — and the only way to reuse one today is to upload it again. The prod bucket
(audited 2026-08-19) held 104 referenced objects that were only **44 distinct images** by
byte content; one PNG is stored 23 times and another 22 times. Every copy is a distinct URL,
so browser, optimizer and unfurl caches do the work once per copy instead of once.

## Scale

- ~110 products, 107 carrying an image (prod, 2026-08-20: 105 PNG + 2 JPG; no SVG, WebP or
  AVIF in either environment). ~44 distinct images by bytes; recount at cleanup time.
  Staging: 17 references over 15 paths.
- Admins expect to hold an *approved collection* of roughly 100 images with ~20 in use at a
  time. A handful of admins; uploads are occasional.
- Largest referenced object today is under 1 MB.

## Intent, and the mindset the plan is written in

**Admins own a catalogue.** From the create/edit product page they pick an image already in
it or upload a new one; they can rename, replace or remove an image; and because an image
can be linked to many products, replacing or removing one must make its reach visible at
the moment of the action. Nothing in the system may be an image an admin cannot see.

**This is a v1 foundation, built from what we know now** (`docs/plans/CLAUDE.md`, "Scope").
Everything below is needed for that intent; refinements, optimisations and guesses about
later features are listed under "Follow-ups" and not built. The implementer makes judgment
calls as they learn and notes deviations here; owner decisions are marked as such.

## The decision

- Images are rows in `product_images`; products reference them by id. **Entries are
  immutable except for their label**: a row's bytes never change, so a path never changes.
- A stored object is named by the **sha256 of its bytes**. Uploading the same file twice
  yields the same object and the same row — that is the whole dedup mechanism — and the
  one-year optimizer cache in `next.config.ts`, which relies on a bucket URL's bytes never
  changing, becomes true by construction.
- **`products.image_path` stays the served column**, derived from the linked entry by one
  trigger on `products`. Every surface that paints a product picture keeps reading exactly
  what it reads now; nothing family-facing touches the catalogue table.
- **Replace means repoint**: find-or-create the entry for the new bytes, then one `UPDATE
  products SET image_id = new WHERE image_id = old`. Atomic, reaches every linked product,
  and the old entry simply remains, unlinked — which is what makes replace reversible.
- One catalogue dialog, opened from the product form: a grid of tiles beside a reference
  column; clicking a tile fills the column, an explicit button commits the pick, and the
  column carries rename / replace / remove with the linked-product list.
- The legacy duplicates are folded in by a hand-run, idempotent script **between the
  migration release and the app release**, so no legacy product exists when the new code
  ships.

### Data model — one migration, released on its own

Before numbering it, re-verify the version against remote history (`supabase/CLAUDE.md`); do
not dump or commit `supabase/schema.sql` on the branch.

- `product_images`:
  - `id uuid pk default gen_random_uuid()`
  - `label text not null check (length(label) between 1 and 120)` — defaults to the upload's
    filename stem, or `Image` if empty; the only mutable column.
  - `sha256 text not null unique` — identity.
  - `path text not null unique check (path <> '')` — object key in the existing public
    `product-images` bucket, `<sha256>.<ext>`, ext normalised from the same accept list the
    product routes use today (`jpg`, `png`, `webp`, `avif`, `svg`; nothing is re-encoded in
    v1, so nothing is dropped).
  - `created_at timestamptz not null default now()`.
  - Nothing else: no content type (derivable from the extension by the existing
    `EXT_TO_MIME` map), no size, no author, no `updated_at` — no surface reads them. Add one
    back when a surface asks.
  - RLS enabled; one policy, admin-only: `FOR ALL TO authenticated USING ((SELECT
    public.is_admin())) WITH CHECK ((SELECT public.is_admin()))`. `GRANT SELECT, INSERT,
    UPDATE, DELETE` to `authenticated` (the policy gates it) and `service_role`. Anon gets
    nothing on this table. (`products.image_id` itself is anon-readable like the rest of
    `products`; it is a UUID and that is fine.) Classified in the DB suite's authorization
    spine; write-IDOR case per `supabase/CLAUDE.md`.
- `products.image_id uuid null references product_images(id) on delete set null`, indexed.
  `ON DELETE SET NULL` is the removal semantics.
- **One trigger, `BEFORE INSERT OR UPDATE ON products`, no column list**, function with
  `SET search_path TO ''`, `REVOKE ALL … FROM PUBLIC; GRANT ALL … TO service_role` like the
  existing `validate_products_location`:
  - `NEW.image_id IS NOT NULL` → `NEW.image_path := (SELECT path FROM product_images WHERE id
    = NEW.image_id)`.
  - `NEW.image_id IS NULL AND OLD.image_id IS NOT NULL` (an unlink) → `NEW.image_path :=
    NULL`.
  - otherwise leave `image_path` alone.
  No column list on purpose: the update RPC assigns `image_path = p_image_path` on every
  call, and with the trigger running on every products write that assignment is **inert for
  any linked product** — the app has no writer of `image_path` the trigger does not govern.
  It also means a stale deployment that still writes paths directly cannot make a linked
  product drift. Cost: one indexed single-row lookup per products write on a ~110-row,
  low-write table.
  DB tests: the FK's `SET NULL` fires the trigger (referential actions are ordinary
  updates — the test makes that a fact); `image_path` agrees with the link after each of
  link, relink, unlink, entry delete, and an RPC call that passes a stale `p_image_path`.
- **No RPC changes.** The routes write `image_id` in a second statement after the RPC, the
  image-last shape the create route already uses.

**Deviations (step 1, as built — migration `00196_product_images_are_a_catalogue`)**

- **The trigger raises rather than assigning NULL when the lookup finds nothing.** The
  plan's `NEW.image_path := (SELECT path …)` has one failure mode worth closing: the FK
  already guarantees the row exists, so an empty result can *only* mean the writer could
  not see it through the table's admin-only RLS — and silently blanking a picture is the
  worst available answer to that. The function raises with the FK's own SQLSTATE instead,
  which is also what `validate_products_location` does for a location it cannot resolve.
  It is unreachable for every writer that exists (all of them are admins or hold
  BYPASSRLS; the migration header names them one by one), which is precisely why it can
  be loud.
- **The trigger function is SECURITY INVOKER**, matching `validate_products_location`
  rather than reaching for DEFINER. Verified on staging: `update_product` is owned by
  `postgres` (BYPASSRLS), `create_product` runs as the signed-in admin, `service_role`
  holds BYPASSRLS, the routes' own statements run on an admin session, and no non-admin
  can write `products` at all. DEFINER would buy no reachability and add an escalation
  surface.
- **Names**: function `apply_product_image_path()`, trigger `trg_products_apply_image_path`
  (sorts between the two existing BEFORE triggers on `products`, neither of which touches
  `image_path`), index `idx_products_image_id` (plain, not partial — the cleanup script
  asks `image_id IS NULL`). DB tests: `tests/db/product-images-trigger.test.ts`.

### Release order — and its mechanism

The CI header is explicit that the migrations job and Vercel promotion race, so a migration
and the code that needs it are never in one release. And the cleanup has to run **before**
the app: the new form loads a product with no entry as `image_id: null`, always writes it
back, and the trigger would null a legacy picture on the product's first ordinary edit.
Running the cleanup first means no legacy product exists when the new code ships, and
`image_id: null` has one meaning.

1. **Migration branch** (`feat/product-image-catalogue-schema`): the migration and its DB
   tests only. Merge to `dev`, release to `main` via `/pr-dev-to-main`. Purely additive;
   the running app is indifferent to it.
2. **Cleanup** on staging (from the feature branch, inspected through its preview), then on
   prod with the owner present. Prod runs the *old* code against relinked rows during this
   window; the old update route deletes the superseded object on an image change, and after
   relink that object may be shared — so the window is short, scheduled, and admins are
   told not to change product images inside it.
3. **Feature branch** (`feat/product-image-catalogue`): everything else. Merge, release.
4. **Roll forward, never back.** A Vercel rollback past release 3 puts the old
   object-deleting routes live against shared objects. Written in the release PR.

### Routes and service

`src/services/product-images/` in the three-file pattern; `productImageKeys.all / .list()`.
Usage is derived from a products read and lives under the products keys. All routes
`posture: "role-gated"`, `roles: "admin"`, in the route-posture registry with an
`adminClient` reason for the storage calls. Errors follow the neighbouring product routes
(`discloseErrorMessages`, admin-facing English shown verbatim); the client maps 413/415 to
translated copy and shows everything else as received.

- `POST /api/admin/product-images` — multipart, one file, **4 MB cap** (Vercel's body limit
  is ~4.5 MB; the client checks size before posting). sha256 the bytes → a row with that
  hash → `{ status: "existing", image }`; else upload to `<sha256>.<ext>` with `upsert:
  false` and `cacheControl: "31536000"` (an "already exists" response is success — same
  bytes), insert the row → `{ status: "added", image }`. A unique-violation on the insert
  re-selects and returns `existing`. Optional `label` field (replace passes the old label).
- `POST /api/admin/product-images/[id]/replace` — multipart, one file. Find-or-create the
  entry for the new bytes exactly as above (label inherited from the entry being replaced if
  created); if it is the same entry, return it unchanged; otherwise `UPDATE products SET
  image_id = :new WHERE image_id = :old` through the session client (admins have full
  products access) — one statement, every linked product follows, the trigger writes each
  path. Returns `{ image: new, relinked: n }`. The old entry stays, unlinked. A failure
  between the two steps leaves a new unused entry — visible and harmless.
- `PATCH /api/admin/product-images/[id]` — JSON `{ label }`.
- `DELETE /api/admin/product-images/[id]` — reads the linked count, deletes the row (FK
  unlinks, trigger nulls each path), removes the object, returns `{ unlinked }`. Hard delete
  of row and object, **owner decision**: an object with no row is the orphan state this
  design excludes; re-uploading the file recreates the entry byte for byte.
- **Reads need no routes.** The catalogue is one read of `product_images` through the
  injected client via the existing page walker (`src/lib/supabase/paging.ts`), ordered
  `created_at desc, id desc`. Usage — counts per entry and the list per entry — is one read
  of `products(id, product_type, is_visible, image_id)` with the default-locale name
  embedded, computed in JS. Both reads live inside the dialog body and exist only while it
  is open.

Integration tests: upload `added` / `existing` / 413 / 415; replace same-entry no-op /
success with relinked count / label inheritance; delete's unlinked count; rename; both
product routes writing `image_id` post-RPC and touching no storage.

### The product routes

- `file` and `clear_image` go away; the body carries `image_id: string | null` (required,
  nullable). Both routes become JSON with a body schema on the primitive; registry kinds
  change. After the RPC each runs `.update({ image_id })`. **If that second statement fails**,
  both routes return the create route's existing soft-warning shape (product saved, image
  not applied, retry from the edit page) — never a bare 200 — and that is where the
  "catalogue entry no longer exists" copy lives, since the FK violation arises there, not in
  the RPC. The update route's existing-path read-back and storage code are deleted.
- The service's create/update inputs carry `image_id`. **Form state carries `image_id`
  only**; the card's label and picture are derived — from the admin product detail query's
  embed `product_images(label, path)` at load, and from the dialog's list query after any
  change inside it — so a rename or replace inside the dialog can never leave the card
  stale. After a replace of the product's own entry, the dialog sets the form's `image_id`
  to the new entry.
- **Cloning a product copies `image_id`.** The clone helper's comment says clones must not
  share a file because editing one would clobber the other — the defect this removes. Its
  unit test inverts.
- The update route's integration tests that pin upload ordering, UUID paths and
  superseded-blob deletion are deleted. `image_path` fixtures elsewhere are unchanged.

### UX

**The catalogue dialog**, opened by *Change image* on the product form. The shared `Dialog`
caps width in two places (portal wrapper and `DialogContent`), so it gains a `size` prop —
`"default"` is today's `max-w-lg`, `"wide"` is `max-w-4xl` — applied to both through
context; every existing caller unchanged. (No body-scroll lock: that changes every dialog
and shifts the page under the scrollbar; if the grid's own scroll container proves
insufficient, it is a separate change.) The content is a fixed-height flex column
(`h-[min(80vh,720px)]`): an **Upload** button in the header, then two thirds grid / one
third reference column.

- **Tiles**: the shared product banner at thumbnail size (an owner rule: every surface
  paints a product picture through that one 3:2 frame), label, and a usage badge in a
  reserved slot so the count landing moves nothing. Clicking a tile fills the column.
- **The column** is always present, with an empty state ("Select an image"). Filled, it
  shows: the large preview; the primary button **Use this picture** (sets the form's
  `image_id`, closes); the label with inline rename; **the products using it** — name, type,
  and a live-in-shop signal, each a link, in a bounded `overflow-y-auto` list; and two
  buttons, **Replace picture** and **Remove from catalogue**. The just-uploaded entry is
  selected into the column, including when the upload answers `existing`.
- **The confirm dialogs** for Replace and Remove are one local component on the shared
  `Dialog` (the shared confirm closes itself on confirm and cannot hold a committing
  state); a dialog above the catalogue dialog is deliberate and the `Dialog` depth register
  handles it. Title names the verb and the label. When N linked products > 0: one line of
  consequence — *Replace*: "All N products below will show the new picture." / *Remove*:
  "All N products below will have no picture until you choose another." — then the list in
  a bounded scroll region, then a **pinned footer** whose button carries the count:
  "Replace on N products" / "Remove from N products". The count under the cursor is the
  safeguard; no checkbox. N = 0: a plain confirm. Replace's dialog holds the file input, so
  the list is read before the file is picked. A local `committing` flag holds the button;
  success invalidates the catalogue list and the **products list keys only** — never the
  admin product detail key, because the product form seeds its state once from that query
  and a refetch must not reset a half-filled form (a constraint to keep, not an accident).
- **Loading**: both reads are small, indexed, bounded — category 2; the fixed-size grid
  renders nothing until rows land, tiles keep a fixed frame. Confirm on staging that the
  products read with its translation embed lands in a frame or two; if not, the badge slot
  already reserves the space.

**On the product form**, replacing the current picker: a card showing the selected entry in
the banner frame and its label. Actions: **Change image** (opens the dialog) and **Remove
from this product** (sets `image_id` null; touches nothing else; never warns). The card is
also a drop target with a choose-file button: a dropped file uploads immediately (the hint
copy says so) and **selects the result for this product only** — a drop is never a shared
action; a reserved one-line slot under the card shows the outcome, and the triggering
button shows a busy state meanwhile. No usage count on the card: no action there is shared,
and the count would cost a products read on every edit-page open.

**Copy** in every locale (Klingon in character), no emoji, via the i18n scripts. **Style
guide**: one section for the dialog with fixture entries — empty column / tile selected with
usage / confirm at N = 0 and N = 22 side by side — fixture UUIDs hardcoded.

### The cleanup (operator-run, between the two releases)

A script under `scripts/`, `npx tsx` with `@/` aliases, dry-run by default, `--apply` to
write. Target is named explicitly: `--project-ref <ref>` must match the host of the resolved
Supabase URL (shell-set keys override `.env.local`, as the existing backfill script does),
and a prod ref additionally requires `--live`. Service-role client.

**Link pass** — per distinct non-null `products.image_path` that is not already a catalogue
path: download → sha256 → if no row, copy the bytes to `<sha256>.<ext>` and insert the row
(label = default-locale name of the earliest-created product using it) → set `image_id` on
every product with that path (the trigger rewrites `image_path`). A legacy object that no
longer exists is reported and, on `--apply`, that product's `image_path` is nulled. A
*catalogue* path whose object is missing is reported and the run **refuses** — that state
means something deleted a shared object. Idempotent; re-running changes nothing. Expect every
imaged product row to be touched once (new URL, `updated_at` bumped; the optimizer cache goes
cold for the shop once).

**`--backup`** — downloads every object to a dated local folder with a manifest of byte
lengths, re-reads each file and verifies its size, and aborts loudly on any mismatch. The
bucket is the only copy of these pictures.

**`--delete-legacy`** — refuses without a verified manifest matching the current bucket
listing, refuses while any product's `image_path` is not a catalogue path, refuses on any
dangling catalogue path, ignores objects newer than 24 hours, requires the project ref typed
back, prints what it will remove, then removes every object no `product_images.path`
references.

Run: link pass on staging → inspect via the feature branch preview → link pass on prod →
(release the app) → later, at leisure: `--backup`, then `--delete-legacy`, on both. After the
app is live, relabel the heavily shared images through the dialog (≈44 renames).

### Follow-through

- **`TODO.md`**: rewrite the "Resize Product Images at Upload" item around content-addressed
  originals being the masters a rendition step derives from; add the owner-proposed **gedu
  session-report photos** item with what this work learned; add the follow-ups below.
- Colocated `src/services/product-images/CLAUDE.md`, short: objects are named by content
  hash and never overwritten; entries are immutable except for label; `image_path` is
  trigger-derived and never written by app code; replace is a repoint; the products-key
  invalidation and the never-invalidate-detail rule.
- `next.config.ts` `minimumCacheTTL` comment (cites UUID-per-upload); `docs/products-
  architecture.md` where it describes the image path surviving an edit via read-back
  (now: via the trigger).
- Aliases in `src/types/index.ts` after regenerating types.

### Follow-ups (recorded in `TODO.md`, deliberately not built)

- A standalone `/admin/product-images` page (the same composition in a page shell) for
  curating without opening a product; bulk remove of unused entries; filter chips; search.
- **Renditions**: a capped WebP served beside the kept original (moved private), which
  unblocks AVIF and shrinks `og:image`; adds a path per entry, changes no identity. Needs
  direct-to-storage upload once originals exceed 4 MB. Decide with the gedu-photo feature's
  real inputs (HEIC, a feed-sized rendition, retention, metadata stripping as safeguarding).
- Multi-file upload with per-file outcomes. Provisional labels for cleanup-generated names.
- Remove-while-in-use offering "give these products this picture instead".
- The sheet lazy-mount fix (gedu/participant pickers fetch on page mount). A `Dialog`
  scroll lock with gutter compensation, if a tall dialog needs it.
- `og:image` width/height once dimensions are known. Drop `p_image_path` from the RPCs.
- An FK from `image_path` to `product_images(path)` once no legacy path exists, which would
  let Postgres own the invariant.

## Rejected alternatives

- **Master + rendition pipeline, signed direct upload, prepare/finalize, pending/ready rows,
  orphan-prune backstop** (the first draft). A performance project riding on a UX feature;
  the bills it claimed to cut are under 0.4% of an already-paid allowance; content-addressed
  originals are masters already.
- **Reading the catalogue table from family surfaces** (embed, transitional fallback, anon
  policy, a second migration to drop `image_path`). The derived column removes the window.
- **Changing the product RPCs** (a transitional flag, `COALESCE`/`CASE`, DROP+CREATE).
  Writing `image_id` post-RPC is the existing pattern; the trigger makes the RPC's own
  `image_path` assignment inert.
- **Cleanup after the app release.** The new form would null every legacy picture on first
  edit, or the contract would need a third state. Cleanup first is simpler and safer.
- **Mutable entries with a second trigger fanning a new path out, and a "(previous)" row.**
  Two statements with no transaction between them; a crash orphaned bytes. Immutable entries
  and a one-statement repoint are atomic and delete the trigger, the merge error and the
  extra row.
- **A standalone page in v1.** The dialog is the feature; the page is the same composition
  later. **The "this product only / all N" question on a dropped file.** Unbuildable as
  specified (the drop creates the entry first) and it put the most destructive verb behind
  the most casual gesture. **A usage count on the form card.** Costs a products read per
  edit-page open to inform no action on that card.
- **Column-level grants; an anon read policy on `product_images`; a usage view; paged
  reads; an aggregate-embed spike; error-code mapping; `content_type`/`bytes`/`created_by`
  columns; a localised suffix baked into data; a concurrent-upload race test.** Each
  answered a requirement nobody stated.
- **An acknowledgement checkbox.** Gates the list it should make people read; the count on
  the button is the safeguard. **Blocking removal while in use.** Makes retiring a
  22-product picture a 22-step job. **A narrow sheet.** Two tiles across. **Uploading at
  product-save time.** An entry is an entity; drop-time creation gives the dedup answer
  immediately.
- **Deleting the row but leaving the object on Remove; deferring `--delete-legacy`.** Both
  leave bytes with no row — the orphan state the owner asked to design out — and the owner
  asked for the legacy duplicates to be cleaned.
- **Tags / folders / crop tool / multi-image products.** Not in the intent.

## Steps

1. **Migration branch** off latest `dev` via `/worktree-flow`: table, policy, grants,
   `image_id`, the trigger and its function grants. Push to staging, regenerate types,
   aliases. DB tests as listed; spine classification; write-IDOR. Merge; **release**.
2. **Feature branch** off latest `dev` via `/worktree-flow`. Service, contracts, queries;
   the four routes; registry; integration tests.
3. Product routes to JSON with `image_id` post-RPC and the soft-warning failure shape;
   storage code removed; clone copies `image_id`; obsolete tests deleted; admin product
   detail query gains the `product_images(label, path)` embed.
4. `Dialog` size prop; the catalogue dialog (grid, column, Use this picture, rename,
   replace, remove, confirms with bounded list and pinned footer); the form card with
   drop-selects-this-product; style-guide section.
5. Messages in every locale via the i18n scripts; lint, type-check, tests clean; push for
   CI.
6. Cleanup script (link pass, `--backup`, `--delete-legacy`, target guards); dry-run then
   `--apply` on staging; inspect through the branch preview.
7. Docs and `TODO.md` edits; merge to `dev` with `--no-ff`; tear the worktree down. **Do not
   release yet.**
8. Operator: link pass on prod, owner present, inside a scheduled window. Then **release**
   the feature. Then relabel; later `--backup` and `--delete-legacy` on both. Delete this
   plan file when the feature release is out.

## Acceptance criteria

- Uploading the same file twice yields one row; the second upload answers `existing`.
- Two products select one entry; changing either product's picture leaves the other alone;
  cloning carries the image.
- Replacing an entry from the column relinks every product that used it in one statement
  and produces new URLs; no object is ever overwritten; the old entry remains, unlinked.
- Removing an entry in use shows the affected list and a count-bearing button that is on
  screen at N = 22; afterwards those products render the imageless state; row and object are
  gone.
- `products.image_path` equals the linked entry's path after every write, including an RPC
  call carrying a stale `p_image_path` (DB test); no family-facing read changed.
- Opening a product edit page without opening the dialog issues no catalogue list read and
  no products-usage read.
- The form's card reflects a rename or replace made inside the dialog without a reload.
- After the prod link pass: one row per distinct hash, every imaged product linked, every
  product's `image_path` a catalogue path. After `--delete-legacy`: a verified backup folder,
  no unreferenced object older than a day.
- Lint, type-check, unit/integration clean; CI DB suite green; registry and spine complete.

## Constraints discovered while deciding

- **Migrations and Vercel promotion race** (`.github/workflows/ci.yml` header): a migration
  and the code that needs it are separate releases, and `/pr-dev-to-main` releases all of
  `dev` — hence a migration branch released first.
- **The old update route deletes the superseded object on an image change.** While old code
  runs against relinked rows (the cleanup window, or a rollback), an image change can delete
  a shared object. The window is scheduled; rollback past the feature release is forbidden.
- **Vercel functions cap request bodies at ~4.5 MB**; the current 5 MB cap is above it.
- **Bytes at a bucket URL are immutable by contract** (the optimizer's one-year TTL floor).
  Hash-named objects, `upsert: false`, and immutable entries keep it by construction.
- **The public bucket has no `SELECT`/list policy on purpose**; the script uses the
  service-role client.
- **A trigger with no column list is what makes the RPC's `image_path` assignment inert**;
  a column-listed trigger would leave the RPC as an ungoverned writer.
- **`is_admin` is executable by `authenticated`, not `anon`**; fine, anon never reads the
  table.
- **The product form seeds its state once from the detail query**; invalidating that key
  would reset a half-filled form.
- **The shared `Dialog` caps width in two places; the shared confirm closes itself on
  confirm.**
- **Admins are trusted to act through the admin UI**: the dialogs are a UX safeguard; the
  FK and trigger are the schema's guarantee.
