#!/usr/bin/env bash
#
# `claimed` — the port blocks already spoken for, asked by the Node side before
# it probes which blocks Windows can bind. Not a command a reader runs.
#
#   claimed.sh <checkout-path> <project-id> <candidate-blocks> <cli-version>
#
# The arguments are the calling checkout's and are not used.
#
# Read-only: it prints every stack record's block and every LIVE throwaway
# claim's, as one comma-separated `claimed=` sentinel, and changes nothing. A
# claim whose run is gone is left out — its block is probed like any other, and
# the next allocation reaps it.
#
# The ports lock is held while the claims' locks are tested, because testing
# one takes it for an instant: outside the lock, a run taking its own claim at
# that instant would find it held and refuse. Runs take their claims under the
# ports lock, so inside it the two never meet.
set -euo pipefail
here=$(dirname "$0")
. "$here/lib.sh"

hold_ports_lock

blocks=""
for record in "$STACKS_DIR"/*/meta; do
  [ -f "$record" ] || continue
  blocks="$blocks,$(record_port_base "$record")"
done
for record in "$TRANSIENT_DIR"/*; do
  [ -f "$record" ] || continue
  if ! flock -n "$record" true 2>/dev/null; then
    blocks="$blocks,$(record_port_base "$record")"
  fi
done

printf '::localdb claimed=%s\n' "${blocks#,}"
