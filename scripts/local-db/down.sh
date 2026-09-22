#!/usr/bin/env bash
#
# `down` — remove this checkout's stack and its data, and put .env.local back.
#
#   down.sh <checkout-path> <project-id> <port-base> <cli-version>
#
# This is what landing a feature, or tearing its worktree down, runs. The data
# goes with it: a stack is built from the worktree's migrations and both seeds,
# so there is nothing in it that `up` cannot make again.
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
env_file="$checkout/.env.local"

ensure_cli "$cli_version"
cli=$(cli_bin "$cli_version")

if [ -z "$(stack_containers_all "$project")" ] && [ ! -d "$state" ] && [ ! -d "$work" ]; then
  echo "This checkout has no stack. Nothing to remove."
  report_running
  exit 0
fi

stop_stack "$cli" "$work" "$project"
# Whatever the CLI left behind of the rest of the service set. `stop_stack`
# guarantees only the database is gone, and a container holding this stack's
# ports would break the next `up`.
leftovers=$(stack_containers_all "$project")
if [ -n "$leftovers" ]; then
  # Word splitting is what turns the name list into arguments here.
  # shellcheck disable=SC2086
  docker rm -f $leftovers >/dev/null 2>&1 || true
fi

rm -rf "$work"

# The staging values go back before the state directory holding them does.
# Only the three keys `up` replaced are written; every other line of the file,
# including anything edited by hand since, is left exactly as it is.
restored=1
if [ -f "$state/env-aside" ] && [ -f "$env_file" ]; then
  restore_env_aside "$env_file" "$state/env-aside"
  restored=0
fi

rm -rf "$state"

if [ "$restored" -ne 0 ]; then
  echo "Stack removed, but the staging values set aside by \`up\` are gone, so .env.local" >&2
  echo "was left as it is. The main checkout's .env.local is the recovery copy: take" >&2
  echo "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY" >&2
  echo "from it. The script never touches that file." >&2
  report_running
  exit 1
fi

echo "Stack and its data removed; .env.local points at staging again. Restart the dev server."

report_running
