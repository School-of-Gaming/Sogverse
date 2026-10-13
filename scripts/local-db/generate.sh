#!/usr/bin/env bash
#
# `generate` — build a database from the checkout's migrations, write
# src/types/database.types.ts and supabase/schema/ from it, and take the
# database away again.
#
#   generate.sh <checkout-path> <project-id> <candidate-blocks> <cli-version>
#
# Arguments are bare words on purpose; see lib.sh for what the boundary mangles.
# The id is `generate`'s own, distinct from the checkout's stack's, and the
# database is a throwaway one on a port block claimed only while this runs —
# lib.sh, `transient_db`.
#
# Both outputs are produced into the shadow workdir first and copied into the
# checkout only once both have succeeded, so a run that fails part-way never
# leaves the checkout holding one half of a schema.
set -euo pipefail
here=$(dirname "$0")
. "$here/lib.sh"

checkout=$1
project=$2
candidate_blocks=$3
cli_version=$4

# Where the new schema directory waits to be swapped in. It sits beside its
# target rather than in the distro so the swap is a rename on one filesystem,
# and the cleanup removes it however the run ends, so a failure leaves nothing
# untracked in the checkout.
staged="$checkout/supabase/.schema.new"
transient_paths=$staged

# Database container only. The names below are the ones the CLI's own warning
# prints — its help text lists a different set, and an invalid name is ignored
# with a warning rather than an error, so the service would quietly start
# anyway. This is every valid name except `db`.
transient_db "$checkout" "$project" "$candidate_blocks" "$cli_version" false \
  edge-runtime,gotrue,imgproxy,kong,logflare,mailpit,postgres-meta,postgrest,realtime,storage-api,studio,supavisor,vector

# Pointed at the database URL, not `--local`: the `--local` form fails with a
# password authentication error against a database that accepts the same
# credentials directly — observed on 2.106 and still on 2.117, where it connects
# to `db:5432` on the stack's own network rather than the port the workdir
# declares. `--schema public` is load-bearing —
# without it a local database's exposed-schema list brings back a
# `graphql_public` block that has no business in the committed file.
#
# The file is written from in here rather than handed back across the boundary,
# so no Windows shell text handling ever touches it. The same holds for the
# schema directory below: both generated artifacts are written by Linux tools
# and only ever copied, never piped through a Windows shell.
step "Generating database.types.ts"
"$cli" gen types typescript \
  --db-url "postgresql://postgres:postgres@127.0.0.1:$db_port/postgres" \
  --schema public > "$work/database.types.ts" < /dev/null

if [ ! -s "$work/database.types.ts" ]; then
  echo "Type generation produced an empty file; leaving the committed one alone." >&2
  exit 1
fi

# The schema directory. pg_dump runs INSIDE the database container so its
# client version always matches the server the CLI booted, and it is raw
# pg_dump rather than `supabase db dump`, which silently emits no CREATE
# TRIGGER at all. CI dumps with this same command against its own stack, so the
# two produce the same bytes.
#
# `set -o pipefail` is on from the top of this file, which this pipeline needs:
# without it the status would be grep's, and a pg_dump that died mid-stream
# would still "succeed" so long as one line reached the filter.
step "Dumping the schema into supabase/schema/"
docker exec "supabase_db_$project" pg_dump -U postgres -d postgres \
  --schema=public --schema-only --no-owner \
  | grep -vE '^[\](un)?restrict ' > "$work/schema.sql"

# --strict: an entry the splitter cannot attribute to an object is a rule the
# splitter is missing, so it fails the run rather than settling into
# misc/schema.sql behind a warning nobody reads. The directory is written
# either way, so the message can be read against the files it produced.
python3 "$here/split-schema.py" --strict "$work/schema" "$work/schema.sql"

# What the dump of `public` cannot see: the extensions, the trigger on
# auth.users, the policies on storage.objects, the bucket and cron rows, and the
# realtime publication's membership. Read out of the catalog of the same
# database the dump came from, and written into the same staging tree, so the
# swap below carries them with the rest. CI runs this identical script against
# its own stack.
python3 "$here/outside-public.py" "supabase_db_$project" "$work/schema/outside-public"

cp "$work/database.types.ts" "$checkout/src/types/database.types.ts"

# Replaced rather than written over: an object dropped by a migration has to
# lose its file, which an overlay would leave behind. The copy lands beside the
# target first and the swap is then a rename of a finished directory, so the
# window in which the checkout holds neither is a single rename long.
rm -rf "$staged"
cp -r "$work/schema" "$staged"
rm -rf "$checkout/supabase/schema"
mv "$staged" "$checkout/supabase/schema"

say "Wrote src/types/database.types.ts and supabase/schema/ from $(ls "$checkout/supabase/migrations" | wc -l) migrations."

report_running
