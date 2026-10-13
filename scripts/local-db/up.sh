#!/usr/bin/env bash
#
# `up` — bring this checkout's local Supabase stack up and point the checkout's
# dev server at it.
#
#   up.sh <checkout-path> <project-id> <candidate-blocks> <cli-version> [--no-rich-seed]
#
# Arguments are bare words on purpose; see lib.sh for what the boundary mangles.
# The candidate blocks are the port blocks Windows can bind (lib.sh,
# `allocate_block`); only a stack's first start reads them.
#
# The first `up` creates the database, which is when the migrations are applied
# and when this stack's seed goes on — supabase/rich-seed.sql and its product
# images, or seed.sql. Every later `up` is a resume of a parked stack: the
# containers and their volumes are still there, so nothing is replayed and the
# data from before is intact.
#
# `--no-rich-seed` builds a stack on seed.sql alone — no rich catalogue and no
# images. That is what the DB tests want, because their whole-table claims are
# written against seed.sql's fixtures and nothing else. A stack gets one seed or
# the other and never both: a rich stack is created with the CLI's own
# `[db.seed]` switched off, so seed.sql's fixtures cannot turn up in the lists a
# human is here to look at. The choice is RECORDED rather than re-read from the
# flag: a resume takes no flags of its own, and a stack that was built without
# the rich seed must not acquire one the next time somebody types `up`.
set -euo pipefail
here=$(dirname "$0")
. "$here/lib.sh"

checkout=$1
project=$2
candidate_blocks=$3
cli_version=$4
rich_seed_flag=${5:-}

take_lock "$project"

env_file="$checkout/.env.local"
if [ ! -f "$env_file" ]; then
  echo "This checkout has no .env.local, so there is nothing to point at a stack." >&2
  exit 1
fi

state=$(stack_state_dir "$project")

if stack_is_running "$project"; then
  api_url="http://127.0.0.1:$(record_value "$state/meta" api_port)"
  echo "Already up: $api_url"
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

cleanup() {
  status=$?
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
    stop_stack "$cli" "$work" "$project"
    # Whatever the CLI left of the rest of the service set. `stop_stack`
    # guarantees only the database is gone, and the two directories below are
    # about to go with it — leaving nothing on disk that describes a container
    # still holding this checkout's ports.
    leftovers=$(stack_containers_all "$project")
    if [ -n "$leftovers" ]; then
      # Word splitting is what turns the name list into arguments here.
      # shellcheck disable=SC2086
      docker rm -f $leftovers >/dev/null 2>&1 || true
    fi
    rm -rf "$work" "$state"
    echo "up failed; the half-built stack has been removed and .env.local left as it was." >&2
  elif stack_is_running "$project"; then
    # A resume that got the containers back and then failed. The stack is real
    # and holding memory, so say so rather than leaving it to be discovered by
    # `list` — and nothing here stops it, because stopping a stack that came
    # back intact is not this script's call to make.
    echo "up failed after the stack was already back; the stack is still up and .env.local has" >&2
    echo "been left as it was. \`npm run db -- park\` or \`npm run db -- down\` it." >&2
  else
    echo "up failed; the parked stack and its data were left alone and .env.local left as it was." >&2
  fi
  # On every failure path, so the keep-alive matches what is actually running.
  # Without it a late failure on a resume would leave a stack up with the Node
  # side never told, and the distro free to go out from under it.
  report_running
  exit "$status"
}
trap cleanup EXIT INT TERM

mkdir -p "$state"

# Which seed this stack gets, settled BEFORE the workdir is built, because the
# choice shapes the config the CLI creates the database from: a rich stack has
# `[db.seed]` off so seed.sql never runs on it, and a --no-rich-seed stack has
# it on and that is the whole of its data. A first start takes the flag and
# records it; every later run reads the record back, and a flag that disagrees
# with it is answered further down. The flag cannot take the rich seed back off
# a stack that already has it, which is what the second condition says.
#
# The choice is written down as exactly ONE of the two markers, here, before
# the database exists — never both and never neither, because `reset` and every
# later `up` read a stack's seed off them and have nothing else to read it off.
# `rich-seed-applied` therefore records the CHOICE rather than a completed seed
# step; whether the seeding still has to run is `first_start` below.
if [ "$rich_seed_flag" = "--no-rich-seed" ] && [ ! -f "$state/rich-seed-applied" ]; then
  : > "$state/rich-seed-skipped"
fi

if [ -f "$state/rich-seed-skipped" ]; then
  cli_seed=true
else
  : > "$state/rich-seed-applied"
  cli_seed=false
fi

# The stack's port block: taken now if it has none, and otherwise read back
# from its record and never worked out again, so a stack keeps its ports — and
# the URLs built on them — for its whole life.
if [ -f "$state/meta" ]; then
  port_base=$(record_port_base "$state/meta")
else
  port_base=$(allocate_block "$state/meta" "$candidate_blocks" "checkout=$checkout")
fi
echo "Ports $port_base-$((port_base + 99))"

work=$(ensure_shadow "$checkout" "$project" "$port_base" "$cli_seed")

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

"$cli" start --workdir "$work" -x "$STACK_EXCLUDE"

# The URL and keys come from the CLI rather than from the well-known local
# defaults, so that a CLI whose defaults move cannot leave .env.local holding a
# key the stack no longer honours. Read before the seeding below rather than
# after it, because the image step uploads through the same API with the same
# service-role key.
"$cli" status --workdir "$work" -o env > "$work/status.env"
api_url=$(status_value "$work/status.env" API_URL)
anon_key=$(status_value "$work/status.env" ANON_KEY)
service_key=$(status_value "$work/status.env" SERVICE_ROLE_KEY)
rm -f "$work/status.env"

if [ -z "$api_url" ] || [ -z "$anon_key" ] || [ -z "$service_key" ]; then
  echo "supabase status did not report a URL and both keys; leaving .env.local alone." >&2
  exit 1
fi

# The rich seed refuses a database that has any account in it, so whether it
# still has to run is the FIRST START rather than the marker above — which
# records the choice and is already on disk by now. On a resume the seed must
# not run again; after a `reset`, which empties the database under a stack that
# keeps its marker, it must, and `reset` runs it itself.
rich_seed_state=skipped
if [ -f "$state/rich-seed-skipped" ]; then
  if [ "$rich_seed_flag" != "--no-rich-seed" ]; then
    echo "This stack was built with --no-rich-seed, so the rich seed stays off."
    echo "\`npm run db -- down\` and \`up\` without the flag to get it."
  fi
elif [ "$first_start" -eq 0 ]; then
  rich_seed_state=applied
  if [ "$rich_seed_flag" = "--no-rich-seed" ]; then
    echo "This stack already carries the rich seed; --no-rich-seed cannot take it back."
    echo "\`npm run db -- down\` and \`up --no-rich-seed\` to build one without it."
  fi
else
  echo "Applying supabase/rich-seed.sql…"
  apply_rich_seed "$checkout" "$project"
  bash "$here/rich-images.sh" "$checkout" "$project" "$api_url" "$service_key"
  rich_seed_state=applied
fi

if [ ! -f "$state/env-aside" ]; then
  capture_env_aside "$env_file" "$state/env-aside"
fi

set_env_line "$env_file" NEXT_PUBLIC_SUPABASE_URL "NEXT_PUBLIC_SUPABASE_URL=$api_url"
set_env_line "$env_file" NEXT_PUBLIC_SUPABASE_ANON_KEY "NEXT_PUBLIC_SUPABASE_ANON_KEY=$anon_key"
set_env_line "$env_file" SUPABASE_SERVICE_ROLE_KEY "SUPABASE_SERVICE_ROLE_KEY=$service_key"

write_meta "$cli_version"

echo
echo "Stack up at $api_url"
echo "  .env.local   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and"
echo "               SUPABASE_SERVICE_ROLE_KEY now point here. Everything else in the"
echo "               file, staging included, is untouched. Restart the dev server."
echo "  database     postgresql://postgres:postgres@127.0.0.1:$db_port/postgres"
if [ "$rich_seed_state" = "applied" ]; then
  echo "  data         supabase/rich-seed.sql alone, with product pictures and"
  echo "               Library covers in their buckets — seed.sql's fixtures are not on a rich"
  echo "               stack. Sign in as admin@example.com, parent@example.com"
  echo "               (PIN 1111) or gedu@example.com, password \"password\"; every"
  echo "               other seeded account is testpassword123."
else
  echo "  data         seed.sql only — no rich catalogue and no product images"
  echo "               (--no-rich-seed). Sign in as seed.sql's own fixtures."
fi
echo "  memory       $(stack_memory_mib "$project") MiB"
printf '::localdb api_url=%s\n' "$api_url"

report_running
