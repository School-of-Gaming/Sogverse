#!/usr/bin/env bash
#
# The keep-alive — the process the Node side holds for as long as any stack on
# this machine is running, so that WSL, and every container in it, outlives the
# terminal that started the stack.
#
#   keepalive.sh
#
# It runs in a console window of its own: the one thing on screen that says a
# local database is up. Closing that window ends this process, and with it the
# last WSL session unless something else holds one — then WSL shuts down and
# takes every local stack with it. So the window carries a banner that says
# so, instead of sitting empty and inviting exactly that.
#
# It takes no arguments. The stacks it names are every running one, whichever
# checkout they belong to, read the way `list` reads them; the text is a
# snapshot from the moment the window opened, and says so.
set -euo pipefail
here=$(dirname "$0")
# The library announces itself to the Node side when sourced; here there is no
# Node side listening, only a reader, so that line goes nowhere.
. "$here/lib.sh" >/dev/null

# The window's title, set through the terminal rather than by the launcher:
# wsl.exe gives this shell a terminal when its own output is a console, and
# this is the sequence every Windows console host honours.
printf '\033]0;Sogverse local database (WSL)\007'

cat <<'EOF'
Sogverse local database (WSL)

This window keeps WSL running while a local Supabase stack is up.
Closing it lets Windows shut WSL down, and every local stack with it,
unless something else is holding WSL open. Leave it open, or minimise it.

Running stacks when this window opened:
EOF

for meta in "$STACKS_DIR"/*/meta; do
  [ -f "$meta" ] || continue
  project=$(basename "$(dirname "$meta")")
  stack_is_running "$project" || continue
  checkout=$(awk -F= '$1 == "checkout" { print substr($0, 10); exit }' "$meta")
  api_port=$(awk -F= '$1 == "api_port" { print $2; exit }' "$meta")
  db_port=$(awk -F= '$1 == "db_port" { print $2; exit }' "$meta")
  printf '  %s\n    API http://127.0.0.1:%s   database port %s\n' "$checkout" "$api_port" "$db_port"
done

cat <<'EOF'

Stop a stack:   npm run db -- park   (from that checkout; this window closes
                                      with the last running stack)
See them all:   npm run db -- list
EOF

exec sleep infinity
