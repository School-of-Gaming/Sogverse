#!/usr/bin/env bash
#
# `up` — bring this checkout's local Supabase stack up and point the checkout's
# dev server at it.
#
#   up.sh <checkout-path> <project-id> <candidate-blocks> <cli-version>
#
# Arguments are bare words on purpose; see lib.sh for what the boundary mangles.
# The candidate blocks are the port blocks Windows can bind (lib.sh,
# `allocate_block`); only a stack's first start reads them.
#
# The first `up` creates the database, which is when the migrations are applied
# and when supabase/rich-seed.sql and its product images go on. A stack is
# created with the CLI's own `[db.seed]` switched off, so seed.sql's fixtures —
# the DB tests', which get a database of their own — are never in the lists a
# human is here to look at. Every later `up` is a resume of a parked stack: the
# containers and their volumes are still there, so nothing is replayed and the
# data from before is intact.
set -euo pipefail
here=$(dirname "$0")
. "$here/lib.sh"

checkout=$1
project=$2
candidate_blocks=$3
cli_version=$4

take_lock "$project"

env_file="$checkout/.env.local"
if [ ! -f "$env_file" ]; then
  echo "This checkout has no .env.local, so there is nothing to point at a stack." >&2
  exit 1
fi

state=$(stack_state_dir "$project")

# Up only counts as up when the record's `cli=` line says the build finished. A
# first start killed part-way leaves containers running and a record without
# it; that stack has no seed and .env.local was never repointed, and is rebuilt
# below rather than reported.
if stack_is_running "$project" && [ -f "$state/meta" ] && [ -n "$(record_value "$state/meta" cli)" ]; then
  api_url="http://127.0.0.1:$(record_value "$state/meta" api_port)"
  say "Already up at $api_url"
  printf '::localdb api_url=%s\n' "$api_url"
  report_running
  exit 0
fi

ensure_cli "$cli_version"
cli=$(cli_bin "$cli_version")

# A stack that has never been created yet. Worth knowing because the two cases
# fail differently: a first start that dies leaves half a stack nobody asked
# for and is cleaned away, where a resume that dies leaves a parked stack with
# real data in it, which is not ours to throw out.
#
# The record exists from the moment the stack's port block is taken, before
# anything starts, so it is the `cli=` line — written once the stack is fully
# built — that says the build finished. A record without it is a first start
# that was killed before it could clean up after itself, and is one again.
first_start=0
if [ ! -f "$state/meta" ] || [ -z "$(record_value "$state/meta" cli)" ]; then
  first_start=1
fi

# Set before anything is written, so a first start that fails at any step —
# taking its port block included — leaves nothing behind. The workdir's path is
# fixed by the project id whether or not it has been built yet.
work=$(shadow_workdir "$project")

# A signal hands cleanup its own status: the status of whatever command was
# interrupted can be 0, which would read as success and skip the cleanup.
cleanup() {
  status=$?
  if [ -n "${1:-}" ]; then
    status=$1
  fi
  trap - EXIT INT TERM HUP
  set +e
  if [ "$status" -eq 0 ]; then
    exit 0
  fi
  # Non-fatal: a restore that fails says so itself, and it must not stop the
  # report at the end of this function, which is what decides whether the
  # distro is held open for a stack that is still running.
  if [ -f "$state/env-aside" ]; then
    restore_env_aside "$env_file" "$state/env-aside" || true
  fi
  if [ "$first_start" -eq 1 ]; then
    # `remove_project` takes whatever of the service set the stop left, with
    # the volumes, the network and the workdir, so the record goes last and
    # nothing is left holding this checkout's ports without one.
    stop_stack "$cli" "$work" "$project"
    remove_project "$project"
    rm -rf "$state"
    say "The half-built stack has been removed and .env.local left as it was."
  elif stack_is_running "$project"; then
    # A resume that got the containers back and then failed. The stack is real
    # and holding memory, so say so rather than leaving it to be discovered by
    # `list` — and nothing here stops it, because stopping a stack that came
    # back intact is not this script's call to make.
    say "The stack is back up but .env.local has been left as it was;"
    say "\`npm run db -- park\` or \`npm run db -- down\` it."
  else
    say "The parked stack and its data were left alone, and .env.local as it was."
  fi
  # On every failure path, so the keep-alive matches what is actually running.
  # Without it a late failure on a resume would leave a stack up with the Node
  # side never told, and the distro free to go out from under it.
  report_running
  exit "$status"
}
# SIGPIPE is ignored and HUP trapped for the reason lib.sh's `transient_db`
# gives: a Node side killed, or a terminal closed, must still end this run
# through its cleanup.
trap '' PIPE
trap cleanup EXIT
trap 'cleanup 130' INT
trap 'cleanup 143' TERM
trap 'cleanup 129' HUP

# A first start that never finished — killed before its trap could run —
# leaves containers, running or stopped, and volumes that `supabase start`
# would reuse, handing back a database with no seed. Its slate is cleared so the
# build starts afresh; the record and any .env.local values it set aside stay,
# so the stack keeps its block and `down` can still restore the originals.
if [ "$first_start" -eq 1 ]; then
  if [ -f "$state/meta" ]; then
    say "A first start that never finished was found; building it afresh."
  fi
  remove_project "$project"
fi

mkdir -p "$state"

# The stack's port block: taken now if it has none, and otherwise read back
# from its record and never worked out again, so a stack keeps its ports — and
# the URLs built on them — for its whole life.
step "Choosing ports"
if [ -f "$state/meta" ]; then
  port_base=$(record_port_base "$state/meta")
else
  port_base=$(allocate_block "$state/meta" "$candidate_blocks" "checkout=$checkout")
fi
echo "Ports $port_base-$((port_base + 99))"

work=$(ensure_shadow "$checkout" "$project" "$port_base" false)

api_port=$(shadow_api_port "$work")
db_port=$(shadow_db_port "$work")

# The record, complete but for the `cli=` line that marks a finished build, so
# `list` can name a stack's checkout and port while its first start is running.
write_meta() {
  {
    printf 'checkout=%s\n' "$checkout"
    printf 'port_base=%s\n' "$port_base"
    printf 'api_port=%s\n' "$api_port"
    printf 'db_port=%s\n' "$db_port"
    if [ -n "${1:-}" ]; then
      printf 'cli=%s\n' "$1"
    fi
  } > "$state/meta.new"
  mv "$state/meta.new" "$state/meta"
}
if [ "$first_start" -eq 1 ]; then
  write_meta
fi

if [ "$first_start" -eq 1 ]; then
  step "Starting the stack and applying the migrations"
else
  step "Resuming the parked stack"
fi
"$cli" start --workdir "$work" -x "$STACK_EXCLUDE"

# The URL and keys come from the CLI rather than from the well-known local
# defaults, so that a CLI whose defaults move cannot leave .env.local holding a
# key the stack no longer honours. Read before the seeding below rather than
# after it, because the image step uploads through the same API with the same
# service-role key.
step "Reading the stack's URL and keys"
"$cli" status --workdir "$work" -o env > "$work/status.env"
api_url=$(status_value "$work/status.env" API_URL)
anon_key=$(status_value "$work/status.env" ANON_KEY)
service_key=$(status_value "$work/status.env" SERVICE_ROLE_KEY)
rm -f "$work/status.env"

if [ -z "$api_url" ] || [ -z "$anon_key" ] || [ -z "$service_key" ]; then
  echo "supabase status did not report a URL and both keys; leaving .env.local alone." >&2
  exit 1
fi

# The rich seed refuses a database that has any account in it, so it runs on
# the start that created the database and never on a resume. After a `reset`,
# which empties the database, `reset` runs it itself.
if [ "$first_start" -eq 1 ]; then
  step "Applying supabase/rich-seed.sql"
  apply_rich_seed "$checkout" "$project"
  step "Uploading the rich seed's pictures"
  bash "$here/rich-images.sh" "$checkout" "$project" "$api_url" "$service_key"
fi

step "Pointing .env.local at the stack"
if [ ! -f "$state/env-aside" ]; then
  capture_env_aside "$env_file" "$state/env-aside"
fi

set_env_line "$env_file" NEXT_PUBLIC_SUPABASE_URL "NEXT_PUBLIC_SUPABASE_URL=$api_url"
set_env_line "$env_file" NEXT_PUBLIC_SUPABASE_ANON_KEY "NEXT_PUBLIC_SUPABASE_ANON_KEY=$anon_key"
set_env_line "$env_file" SUPABASE_SERVICE_ROLE_KEY "SUPABASE_SERVICE_ROLE_KEY=$service_key"

write_meta "$cli_version"

echo "memory: $(stack_memory_mib "$project") MiB"

say "Stack up at $api_url"
say "  .env.local   its three Supabase values point here now; restart the dev server."
say "  sign in      admin@example.com, parent@example.com (PIN 1111) or gedu@example.com,"
say "               password \"password\"; every other seeded account is testpassword123."
say "  database     postgresql://postgres:postgres@127.0.0.1:$db_port/postgres"
printf '::localdb api_url=%s\n' "$api_url"

report_running
