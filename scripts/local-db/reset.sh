#!/usr/bin/env bash
#
# `reset` — rebuild the running stack's database in place from the checkout's
# migrations and the rich seed.
#
#   reset.sh <checkout-path> <project-id> <candidate-blocks> <cli-version>
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
cli_version=$4

take_lock "$project"

work=$(shadow_workdir "$project")

if ! stack_is_running "$project"; then
  echo "This checkout's stack is not running. \`npm run db -- up\` first." >&2
  report_running
  exit 1
fi

ensure_cli "$cli_version"
cli=$(cli_bin "$cli_version")

# The CLI's reset replays the migrations and whichever seed the workdir's
# config.toml names, which for a stack must be none: the rich seed goes on
# below, and it refuses a database that already holds seed.sql's accounts.
set_shadow_seed "$work" false

step "Rebuilding the database from the migrations"
"$cli" db reset --workdir "$work" --local --yes

step "Applying supabase/rich-seed.sql"
# Against a database that is once again empty of accounts, which is the only
# state the rich seed's own guard accepts.
apply_rich_seed "$checkout" "$project"

# The pictures go back on too: `db reset` empties the catalogue table with the
# rest of the database, so every product would come back on its placeholder.
# The upload half is a no-op for bytes the bucket still holds — an object named
# for its own sha256 cannot be stale — and the API URL and key are read here the
# same way `up` reads them.
step "Uploading the rich seed's pictures"
"$cli" status --workdir "$work" -o env > "$work/status.env"
api_url=$(status_value "$work/status.env" API_URL)
service_key=$(status_value "$work/status.env" SERVICE_ROLE_KEY)
rm -f "$work/status.env"

if [ -z "$api_url" ] || [ -z "$service_key" ]; then
  echo "supabase status did not report a URL and a service-role key, so the product images were not applied." >&2
  report_running
  exit 1
fi

bash "$here/rich-images.sh" "$checkout" "$project" "$api_url" "$service_key"

say "Database rebuilt from $(ls "$checkout/supabase/migrations" | wc -l) migrations, the rich seed and its pictures."

report_running
