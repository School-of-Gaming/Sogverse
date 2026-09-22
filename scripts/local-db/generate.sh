#!/usr/bin/env bash
#
# `generate` — build a database from the checkout's migrations, write
# src/types/database.types.ts from it, and take the database away again.
#
#   generate.sh <checkout-path> <project-id> <port-base> <cli-version>
#
# Arguments are bare words on purpose; see lib.sh for what the boundary mangles.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

checkout=$1
project=$2
port_base=$3
cli_version=$4

ensure_cli "$cli_version"
cli=$(cli_bin "$cli_version")
work=$(build_shadow "$checkout" "$project" "$port_base")

# The database is removed whatever happens, including a failure part-way
# through the start, so a crashed run never leaves a container behind holding
# this checkout's ports.
cleanup() {
  status=$?
  stop_stack "$cli" "$work" "$project"
  rm -rf "$work"
  exit "$status"
}
trap cleanup EXIT INT TERM

# Database container only. The names below are the ones the CLI's own warning
# prints — its help text lists a different set, and an invalid name is ignored
# with a warning rather than an error, so the service would quietly start
# anyway. This is every valid name except `db`.
"$cli" start --workdir "$work" -x \
  edge-runtime,gotrue,imgproxy,kong,logflare,mailpit,postgres-meta,postgrest,realtime,storage-api,studio,supavisor,vector

db_port=$(shadow_db_port "$work")

# Pointed at the database URL, not `--local`: the `--local` form fails in the
# pinned CLI with a password authentication error against a database that
# accepts the same credentials directly. `--schema public` is load-bearing —
# without it a local database's exposed-schema list brings back a
# `graphql_public` block that has no business in the committed file.
#
# The file is written from in here rather than handed back across the boundary,
# so no Windows shell text handling ever touches it.
"$cli" gen types typescript \
  --db-url "postgresql://postgres:postgres@127.0.0.1:$db_port/postgres" \
  --schema public > "$work/database.types.ts"

if [ ! -s "$work/database.types.ts" ]; then
  echo "Type generation produced an empty file; leaving the committed one alone." >&2
  exit 1
fi

cp "$work/database.types.ts" "$checkout/src/types/database.types.ts"
echo "Wrote src/types/database.types.ts from a database built off $(ls "$checkout/supabase/migrations" | wc -l) migrations."
