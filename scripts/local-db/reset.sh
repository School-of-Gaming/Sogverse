#!/usr/bin/env bash
#
# `reset` — rebuild the running stack's database in place from the checkout's
# migrations and both seeds.
#
#   reset.sh <checkout-path> <project-id> <port-base> <cli-version>
#
# This is the answer to an EDITED migration, which cannot be applied on top of
# itself: the database is dropped and replayed, which takes about a minute. A
# migration that is merely NEW is `migrate` instead, which costs seconds and
# keeps the data.
#
# The containers, the ports and .env.local are untouched, so the dev server
# needs no restart — and resetting one stack leaves every other one alone.
set -euo pipefail
here=$(dirname "$0")
. "$here/lib.sh"

checkout=$1
project=$2
port_base=$3
cli_version=$4

take_lock "$project"

state=$(stack_state_dir "$project")
work=$(shadow_workdir "$project")

if ! stack_is_running "$project"; then
  echo "This checkout's stack is not running. \`npm run db -- up\` first." >&2
  report_running
  exit 1
fi

ensure_cli "$cli_version"
cli=$(cli_bin "$cli_version")

# The CLI's reset replays the migrations and seed.sql. The rich seed is not
# named in config.toml and no reset knows about it, so it goes back on by hand
# — against a database that is once again fresh, which is the only state its
# own guard accepts.
"$cli" db reset --workdir "$work" --local --yes

echo "Applying supabase/rich-seed.sql…"
apply_rich_seed "$checkout" "$project"
: > "$state/rich-seed-applied"

echo "Database rebuilt from $(ls "$checkout/supabase/migrations" | wc -l) migrations, seed.sql and the rich seed."

report_running
