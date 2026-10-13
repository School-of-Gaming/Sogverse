#!/usr/bin/env bash
#
# `test` — a throwaway database for the DB tests, held for as long as the Node
# side is running them, and removed afterwards.
#
#   test-db.sh <checkout-path> <project-id> <candidate-blocks> <cli-version>
#
# Arguments are bare words on purpose; see lib.sh for what the boundary mangles.
# The id is the tests' own, distinct from the checkout's stack's and from
# `generate`'s, so the tests run beside a stack that is serving a preview.
#
# The database is migrations/ plus supabase/seed.sql and nothing else — the
# fixtures the tests' whole-table claims are written against, and what CI's DB
# job builds — on the service set a stack runs, which has the auth, REST and
# storage layers the tests reach.
#
# The tests themselves are not run here: node_modules and the vitest binary
# live on the Windows side. So this file hands back the URL and keys on
# sentinel lines, says `ready`, and waits on its stdin; the Node side closes
# that when vitest is done, and the cleanup trap removes the database. A Node
# side that dies closes it too, so the database goes either way — and a run
# killed outright leaves a claim the next allocation reaps (lib.sh).
set -euo pipefail
here=$(dirname "$0")
. "$here/lib.sh"

checkout=$1
project=$2
candidate_blocks=$3
cli_version=$4

transient_db "$checkout" "$project" "$candidate_blocks" "$cli_version" true "$STACK_EXCLUDE"

# From the CLI rather than the well-known local defaults, so a CLI whose
# defaults move cannot have the tests presenting a key the database no longer
# honours.
step "Reading the database's URL and keys"
"$cli" status --workdir "$work" -o env > "$work/status.env" < /dev/null
api_url=$(status_value "$work/status.env" API_URL)
anon_key=$(status_value "$work/status.env" ANON_KEY)
service_key=$(status_value "$work/status.env" SERVICE_ROLE_KEY)
rm -f "$work/status.env"

if [ -z "$api_url" ] || [ -z "$anon_key" ] || [ -z "$service_key" ]; then
  echo "supabase status did not report a URL and both keys." >&2
  exit 1
fi

printf '::localdb api_url=%s\n' "$api_url"
printf '::localdb anon_key=%s\n' "$anon_key"
printf '::localdb service_key=%s\n' "$service_key"
printf '::localdb ready\n'

# Until the Node side says the tests are done, by a line or by closing stdin.
read -r _ || true
step "Removing the throwaway database"
