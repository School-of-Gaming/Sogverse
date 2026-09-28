#!/usr/bin/env bash
#
# `migrate` — apply migration files the running stack has not seen yet.
#
#   migrate.sh <checkout-path> <project-id> <port-base> <cli-version>
#
# Adding a migration to a feature that already has a stack up is the common
# case, and it does not need the database rebuilt: the new file goes on top in
# seconds and the data stays. Editing one does, which is `reset`.
#
# `--include-all` is load-bearing. Migration versions are timestamps assigned
# when a branch lands, so a file added on a branch can carry a version OLDER
# than something the stack has already applied; without the flag the CLI skips
# exactly those and reports success.
#
# That same flag is this command's limit. A file sorting below what the stack
# holds is applied ON TOP of it here, where a fresh database — CI's, staging's,
# anyone else's — replays it UNDERNEATH. Where the two sets touch one object the
# stack ends up with a schema nobody else will ever have, and nothing says so.
# So a `git merge origin/dev` that brings migrations with it wants `reset`, not
# `migrate`.
set -euo pipefail
here=$(dirname "$0")
. "$here/lib.sh"

checkout=$1
project=$2
port_base=$3
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

"$cli" migration up --workdir "$work" --local --include-all --yes

echo "Pending migrations applied. The data is unchanged; run \`npm run db -- reset\` instead if a"
echo "migration was EDITED rather than added, or if a merge from dev brought migrations with it."

report_running
