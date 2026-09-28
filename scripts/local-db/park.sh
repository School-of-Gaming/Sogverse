#!/usr/bin/env bash
#
# `park` — stop this checkout's stack, keeping its data.
#
#   park.sh <checkout-path> <project-id> <port-base> <cli-version>
#
# `supabase stop` without `--no-backup` leaves the data volumes in place, which
# is the whole difference between this and `down`: parking frees the memory
# (656 MB a stack) in about 15 seconds and `up` brings the same data back in
# about 30, replaying nothing. So several features can sit waiting for review
# at no cost, and WSL's shared 12 GB cap is not spent on stacks nobody is
# looking at.
#
# .env.local is deliberately left pointing at the parked stack: parking is a
# pause, and the next `up` is expected.
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

if [ ! -f "$state/meta" ]; then
  echo "This checkout has no stack. Nothing to park."
  report_running
  exit 0
fi

if ! stack_is_running "$project"; then
  echo "Already parked."
  report_running
  exit 0
fi

ensure_cli "$cli_version"
cli=$(cli_bin "$cli_version")

"$cli" stop --workdir "$work" --yes

echo "Parked. The data is kept; \`npm run db -- up\` brings it back in about half a minute."
echo ".env.local still points at this stack."

report_running
