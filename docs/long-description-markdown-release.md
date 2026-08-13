# Releasing the markdown long description

A product's **long description** is the optional marketing blurb on the public
shop detail page. It used to be stored as a flat array of heading and paragraph
blocks holding plain text; it is now one authored markdown string, written in a
rich-text editor and rendered through the shared markdown renderer, which is
where its emphasis, levelled headings, real lists and links come from.

The migration that changes the column's type **clears its contents**, and the
copy is put back afterwards by hand. This page is how that is done.

## Why the copy is not converted by the migration

CI applies migrations to production **before** the new build is promoted. A
migration that converted the values in place would therefore leave converted
markdown sitting in front of the old reader on live public pages, for as long as
the promotion took. There is no ordering of a single release that avoids it.

Clearing the column instead sidesteps the problem entirely, because **an empty
long description is an ordinary, fully supported state**: the field is optional,
most products carry none, and the page omits the whole card when it is absent.
Old reader or new, a cleared row renders exactly as a product without a blurb
has always rendered.

The conversion itself is a tested TypeScript function that lives with the
application code, and the export script below is its only caller. Two test
suites are what make it trustworthy and are worth knowing about before trusting
a restore: one drives adversarial plain text through the conversion and the real
renderer, proving that copy which was plain does not silently acquire formatting
nobody typed; the other pushes converted copy through a real editor and back out
again, proving it survives the first unrelated save. Neither is optional
scaffolding — they are the argument that the restored copy is the copy that was
there before.

## Rehearsing it

The export script writes files and nothing else — it holds no statement that
writes to any database — so **running it against production ahead of the
release is itself the rehearsal**, and the safest one available: it is the only
way to find out that all of today's real copy passes the pre-flight before a
release is scheduled around it. Do that first, read the output, and throw the
files away.

Then take the export again immediately before the release. The rehearsal run is
a check, not the artefact; see the warning below about staleness.

Staging is not the place for this half. Its column has already been migrated and
cleared, so there is no block-shaped copy left there to export. What staging can
still rehearse is the other half — running a restore file through psql against
the migrated column — if you want to see the transaction and its assertion
behave before pointing them at production.

## The order of operations

1. **Export and convert, immediately before the release.**

   ```bash
   npx tsx scripts/export-long-descriptions.tsx --target=production ~/work/sog-prod-desc
   ```

   This only reads. It writes two files into the output directory: a snapshot of
   every row exactly as the database held it, and the restore SQL. It renders
   every converted value and refuses to write anything at all if one row's words
   or headings do not survive, so a clean run is also the go-ahead.

   **Write the output outside the repository.** `~/work/sog-prod-desc` is the
   agreed home and is a sibling of the checkout, so a directory of production
   marketing copy cannot be committed by accident. That folder also already
   holds a snapshot taken while this change was being built — useful as a second
   copy of what the field held before any of this, and not the file to restore
   from, because it predates every edit made since.

   Credentials come from `.env.local`, which the script reads itself; the target
   argument, not the environment, is what decides which database is opened.

2. **Release.** Merge to `main` as usual. CI applies the migration, which
   changes the column to `text` and clears it.

3. **Wait for the deployment to be promoted.** Do not run the restore before the
   new build is live. Between the migration landing and the promotion, the
   production site is running code that expects the old shape; restoring into
   that gap puts markdown in front of a reader that cannot render it.

4. **Restore, once.**

   ```bash
   PGCLIENTENCODING=UTF8 PGPASSWORD='<SUPABASE_PROD_DB_PASSWORD>' psql \
     -h aws-1-eu-north-1.pooler.supabase.com -p 6543 \
     -U postgres.<SUPABASE_PROD_PROJECT_REF> -d postgres \
     -v ON_ERROR_STOP=1 -f ~/work/sog-prod-desc/long-descriptions.restore.sql
   ```

   The password and project ref are `SUPABASE_PROD_DB_PASSWORD` and
   `SUPABASE_PROD_PROJECT_REF` in `.env.local`. Read them into the command
   rather than pasting the values anywhere they persist. `PGCLIENTENCODING` is
   belt and braces: the file also sets the encoding inside its own transaction,
   because a Windows psql otherwise inherits the console codepage and non-ASCII
   copy (ä, ö, –) would land as mojibake the row counts cannot see.

   The file is one transaction and ends by asserting that **every exported row**
   came out carrying a description. A row the file's UPDATEs missed — deleted
   since the export, or its locale changed — rolls the whole thing back rather
   than leaving half the catalogue restored; a description someone wrote on a
   *different* product in the meantime does not trip it. That also makes a
   retry safe: on failure nothing was committed and the same file can simply be
   run again, and running it a second time after success rewrites the same
   values. Losing the copy is not on the table either way — the snapshot file
   keeps every original value outside the database until this step has
   verifiably succeeded.

5. **Verify.** Open two or three product pages that had a blurb and read them.
   Then check the shape of what landed:

   ```sql
   SELECT count(*) FILTER (WHERE long_description IS NOT NULL) AS with_blurb,
          count(*)                                            AS translations
     FROM public.product_translations;
   ```

   If a restored description reads wrong, the snapshot file holds the original
   value beside the markdown it became — compare those two before touching the
   database.

## The three things that are easy to get wrong

**The export has to be taken immediately before the release, not reused from an
earlier run.** It is a point-in-time copy. Any description an admin edits
between the export and the restore is lost when the restore overwrites it with
the older text — silently, because the restore has no way to know it is stale.
If a release slips, take the export again.

**Nobody edits product descriptions between the export and the restore.** Tell
the admins before starting. An edit in that window is overwritten by the
restore (the staleness above), and an edit made while the migration has landed
but the old build is still live is worse: the old form writes its block array
through the new column and the page renders the raw serialisation as text. The
window is minutes long — the fix is coordination, not code.

**Product pages show no long description between the migration landing and the
restore completing. That is expected, not an incident.** Pages render correctly
throughout — the card is simply absent, exactly as it is on the majority of
products that never had a blurb. Anyone watching the site during a release
should be told, so the gap is not reported as a fault and nobody reaches for a
rollback.

## Afterwards — the cleanup

Once production is restored and somebody has read a few of the pages, the block
shape has no remaining purpose anywhere. **Nothing here is dead code until that
has happened**, which is why it is a separate change on its own branch rather
than something folded into the release.

Delete, in one change:

- `src/lib/products/long-description-to-markdown.ts` — the conversion.
- `tests/unit/lib/products/long-description-to-markdown.test.tsx` and
  `tests/unit/lib/products/long-description-editor-round-trip.test.tsx` — the two
  suites that made the conversion trustworthy.
- `scripts/export-long-descriptions.tsx`, `scripts/lib/long-description-export.tsx`
  and `tests/unit/scripts/long-description-export.test.tsx` — the export.
- The block types and the helper that parses one, in `src/types/index.ts`, plus
  any fixture still built from blocks rather than from markdown. One of those
  fixtures feeds the product long-description **preview scene**, so this line
  carries a decision, not just a deletion: either inline the markdown the
  fixture converts to as a literal and keep the scene, or retire the scene and
  its registry entry with it. Decide before deleting rather than letting the
  compiler put the question to whoever drew the cleanup.
- This page.

The compiler and the linter find the remainder: delete the list above, then run
`npm run lint`, `npm run type-check` and `npm run test`, and follow what breaks.
Every remaining reference is something that should have gone with it.

Two things that are **not** part of the cleanup. The column is already `text`,
so no migration is involved — this change touches no database at all. And the
snapshot in `~/work/sog-prod-desc` is the last copy of the pre-markdown content;
keep or delete it as a deliberate decision, not as a side effect of tidying the
repository.
