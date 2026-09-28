#!/usr/bin/env bash
#
# `list` — every stack on this machine, whichever checkout it belongs to.
#
#   list.sh <checkout-path> <project-id> <port-base> <cli-version>
#
# The arguments are the calling checkout's and are not used: a stack's state
# directory already records which checkout it belongs to, and the point of this
# command is to see the ones that are NOT yours — the memory they hold against
# WSL's shared 12 GB cap, and any whose worktree has been deleted out from
# under them.
#
# That last flag is the only orphan handling there is. Removing the stack is
# still `npm run db -- down` from the checkout, or, once the checkout is gone,
# a deliberate act by whoever reads this list.
set -euo pipefail
here=$(dirname "$0")
. "$here/lib.sh"

rows=0
for meta in "$STACKS_DIR"/*/meta; do
  [ -f "$meta" ] || continue
  project=$(basename "$(dirname "$meta")")

  checkout=$(awk -F= '$1 == "checkout" { print substr($0, 10); exit }' "$meta")
  api_port=$(awk -F= '$1 == "api_port" { print $2; exit }' "$meta")

  if stack_is_running "$project"; then
    state_word=running
    memory="$(stack_memory_mib "$project") MiB"
  else
    state_word=parked
    memory="-"
  fi

  gone=""
  if [ ! -d "$checkout" ]; then
    gone="  <- worktree is gone"
  fi

  if [ "$rows" -eq 0 ]; then
    printf '%-9s %-7s %-6s %s\n' STATE MEMORY PORT WORKTREE
  fi
  rows=$((rows + 1))
  printf '%-9s %-7s %-6s %s%s\n' "$state_word" "$memory" "$api_port" "$checkout" "$gone"
done

if [ "$rows" -eq 0 ]; then
  echo "No local stacks. \`npm run db -- up\` builds one for this checkout."
fi

report_running
