#!/usr/bin/env bash
#
# `reset` — rebuild the running stack's database in place from the checkout's
# migrations and this stack's seed.
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
#
# A reset rebuilds the stack it was given: one built with the rich seed gets it
# back, and one built with `up --no-rich-seed` stays on seed.sql alone. It takes
# no flag of its own, because "which seeds this stack has" is a property of the
# stack rather than of one command — `down` and `up` again to change it.
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

# The CLI's reset replays the migrations and whichever seed the workdir's
# config.toml names — which is seed.sql on a --no-rich-seed stack and nothing at
# all on a rich one. That line is written here from the stack's recorded choice
# and not merely trusted, because the workdir outlives the run that made it, and
# a rebuild that picked up the other seed would put the DB tests' fixtures into
# the lists this stack exists to show.
if [ -f "$state/rich-seed-skipped" ]; then
  set_shadow_seed "$work" true
else
  set_shadow_seed "$work" false
fi

"$cli" db reset --workdir "$work" --local --yes

migrations=$(ls "$checkout/supabase/migrations" | wc -l)

if [ -f "$state/rich-seed-skipped" ]; then
  echo "Database rebuilt from $migrations migrations and seed.sql (this stack was built with --no-rich-seed)."
  report_running
  exit 0
fi

echo "Applying supabase/rich-seed.sql…"
# Against a database that is once again empty of accounts, which is the only
# state the rich seed's own guard accepts.
apply_rich_seed "$checkout" "$project"
: > "$state/rich-seed-applied"

# The pictures go back on too: `db reset` empties the catalogue table with the
# rest of the database, so every product would come back on its placeholder.
# The upload half is a no-op for bytes the bucket still holds — an object named
# for its own sha256 cannot be stale — and the API URL and key are read here the
# same way `up` reads them.
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

echo "Database rebuilt from $migrations migrations, the rich seed and its product images."

report_running
