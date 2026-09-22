#!/usr/bin/env bash
#
# `test-db` — hand the Node side everything the DB tests need to reach a stack,
# and refuse a stack they must not be run against.
#
#   test-db.sh <project-id> <cli-version>
#
# No checkout path: a stack already records the checkout it belongs to, and this
# file reads it back rather than being told, so that the --stack escape hatch
# cannot assert a stack is something it is not.
#
# Arguments are bare words on purpose; see lib.sh for what the boundary mangles.
#
# This file changes nothing: it reads the stack's state, asks the CLI for the
# URL and keys, and prints them back on sentinel lines. The test run itself is
# not here, because node_modules and the vitest binary live on the Windows side
# — see scripts/test-db-local.mjs, which is the half that runs them.
set -euo pipefail
here=$(dirname "$0")
. "$here/lib.sh"

project=$1
cli_version=$2

# Held for the few seconds this file takes and released with it, so the stack
# cannot be read half-way through an `up` or a `reset` that is rebuilding it.
# The vitest run afterwards is outside the lock — nothing it does changes the
# stack's identity, ports or keys.
take_lock "$project"

state=$(stack_state_dir "$project")
work=$(shadow_workdir "$project")

if [ ! -f "$state/meta" ]; then
  echo "There is no stack called $project on this machine." >&2
  echo "Bring this checkout's stack up with \`npm run db -- up --no-rich-seed\`, or see what is" >&2
  echo "already here with \`npm run db -- list\`." >&2
  exit 1
fi

if ! stack_is_running "$project"; then
  echo "$project's stack is parked, not running. \`npm run db -- up\` brings it back in about 30s." >&2
  exit 1
fi

# The rich seed is disqualifying, not merely untidy: the DB tests' whole-table
# claims are written against seed.sql's minimal fixtures alone, and the rich
# catalogue on top of them fails those sweeps for reasons that are not bugs.
#
# Two signals, because they fail differently. The marker is what `up` writes
# when it applies the seed, so it is the answer for a stack this tooling built;
# the row is the database's own answer, and it is the one that catches a rich
# seed applied to a stack by hand. Either is enough to refuse.
rich_seed=
if [ -f "$state/rich-seed-applied" ]; then
  rich_seed="the stack records that \`up\` applied it"
else
  # Assigned rather than piped into a test: under `pipefail` a reader that had
  # already seen enough would leave the pipeline holding the writer's SIGPIPE
  # status, and the answer would come back "no rich seed" because of how the
  # question was asked.
  rich_rows=$(docker exec "supabase_db_$project" psql -U postgres -d postgres -tAc \
    "SELECT 1 FROM auth.users WHERE id = '11111111-1111-4111-8111-000000000001'" 2>/dev/null || true)
  if [ -n "$rich_rows" ]; then
    rich_seed="its accounts are in auth.users"
  fi
fi

if [ -n "$rich_seed" ]; then
  echo "$project carries supabase/rich-seed.sql ($rich_seed)." >&2
  echo "The DB tests' whole-table claims are written against supabase/seed.sql alone, so a" >&2
  echo "stack holding the rich catalogue fails them for reasons that are not bugs. Rebuild" >&2
  echo "the stack without it:" >&2
  echo "  npm run db -- down" >&2
  echo "  npm run db -- up --no-rich-seed" >&2
  exit 1
fi

ensure_cli "$cli_version"
cli=$(cli_bin "$cli_version")

# From the CLI rather than the well-known local defaults, for the reason `up`
# reads them the same way: a CLI whose defaults move would otherwise have the
# tests presenting a key the stack no longer honours.
#
# Its stderr is held back rather than forwarded: `status` narrates the workdir
# it used and every service the stack was started without, none of which is
# about this run — and a reader who asked for a test run should see test output.
# It is printed if the command fails, which is when it says something.
if ! "$cli" status --workdir "$work" -o env > "$work/status.env" 2> "$work/status.err"; then
  cat "$work/status.err" >&2
  rm -f "$work/status.env" "$work/status.err"
  echo "supabase status failed for $project." >&2
  exit 1
fi
rm -f "$work/status.err"
api_url=$(status_value "$work/status.env" API_URL)
anon_key=$(status_value "$work/status.env" ANON_KEY)
service_key=$(status_value "$work/status.env" SERVICE_ROLE_KEY)
rm -f "$work/status.env"

if [ -z "$api_url" ] || [ -z "$anon_key" ] || [ -z "$service_key" ]; then
  echo "supabase status did not report a URL and both keys for $project." >&2
  exit 1
fi

stack_checkout=$(awk -F= '$1 == "checkout" { print substr($0, 10); exit }' "$state/meta")

printf '::localdb checkout=%s\n' "$stack_checkout"
printf '::localdb api_url=%s\n' "$api_url"
printf '::localdb anon_key=%s\n' "$anon_key"
printf '::localdb service_key=%s\n' "$service_key"
