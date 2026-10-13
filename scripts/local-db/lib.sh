#!/usr/bin/env bash
# Shared helpers for the local-database commands. Sourced by a command script,
# never run on its own.
#
# Everything here runs inside the WSL distro. It is a file rather than shell
# text passed across the boundary on purpose: crossing from a Windows shell
# into the distro mangles `~`, rooted Linux paths, inline environment
# assignments and anything carrying `$` or nested quotes, so the boundary
# carries only a file path and a few bare words.
#
# Every command script is handed the same four: the checkout, the project id,
# the candidate port blocks and the CLI version. The blocks are `-` for every
# command except `up`, `generate` and `test`, the three that can take one
# (`allocate_block` and `claim_transient_block` below).
#
# What a command prints is for the Node side, which writes all of it to the
# run's log and shows the reader only the lines `say` marks (below) — so a
# script echoes freely, and says only what the reader needs.

# PATH and HOME are set here rather than inherited. The distro inherits the
# Windows PATH, so a bare `node` or `npm` inside it resolves to the Windows
# install, and the assignment splits on the space in "Program Files"; HOME
# arrives as the Windows one with its backslashes eaten ("C:UsersKyle").
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
HOME=$(getent passwd "$(id -u)" | cut -d: -f6)
export HOME

# `gen types --db-url` makes no Management API call, but the CLI is a Bun binary
# that reads .env/.env.local out of the working directory — so in a checkout the
# real personal access token would answer for it. This non-credential, which beats
# the file, keeps it out of the run; CI's generate step pins the same value.
export SUPABASE_ACCESS_TOKEN=not-a-token-gen-types-makes-no-api-call

# Everything this script makes lives in the distro's own filesystem: the CLI,
# the shadow workdirs, the type-generation output. Nothing is written to the
# Windows side but the generated file itself, so the repo needs no ignore entry
# and the two sides' /tmp never have to agree.
STATE_DIR="$HOME/.cache/sogverse-local-db"

# The pinned CLI, installed per version so that moving the pin installs beside
# the old one instead of over it — there is no separate "reinstall when the pin
# moves" path to get wrong, and a rollback is already on disk.
cli_bin() {
  printf '%s/cli/%s/supabase' "$STATE_DIR" "$1"
}

ensure_cli() {
  cli_version=$1
  cli_dir="$STATE_DIR/cli/$cli_version"
  if [ -x "$cli_dir/supabase" ]; then
    return 0
  fi
  step "Installing Supabase CLI v$cli_version into the distro"
  cli_tmp=$(mktemp -d)
  curl -fsSL -o "$cli_tmp/cli.tar.gz" \
    "https://github.com/supabase/cli/releases/download/v$cli_version/supabase_linux_amd64.tar.gz"
  mkdir -p "$cli_dir"
  # Extract the whole tarball: the Linux release is two binaries that have to
  # sit together, and unpacking `supabase` alone fails at run time.
  tar -xzf "$cli_tmp/cli.tar.gz" -C "$cli_dir"
  rm -rf "$cli_tmp"
}

# The shadow workdir. The CLI is never pointed at the checkout's own supabase/
# directory: run there it leaves an untracked, ungitignored .branches/ behind,
# and it takes service versions from the linked project's pins in .temp/ —
# different images from its defaults, which is what CI builds with. A workdir
# that was never linked has no pins, so it gets the defaults.
shadow_workdir() {
  printf '%s/work/%s' "$STATE_DIR" "$1"
}

# Where a long-lived stack keeps what outlives its containers: which checkout
# it belongs to, the port block it was given, and the .env.local values it
# displaced. One directory per project id, beside
# the shadow workdirs in the distro — so `list` can describe every stack on the
# machine without asking any checkout anything, and tearing a worktree down
# leaves a state directory `list` can flag rather than a silent orphan.
STACKS_DIR="$STATE_DIR/stacks"

# Where a running throwaway database — `generate`'s, or the DB tests' — records
# the port block it holds: one claim file per identity, beside the stacks rather
# than among them, so `list` and the running count never mistake a throwaway
# database for a stack. `claim_transient_block` says how a claim outlives
# nothing but its run.
TRANSIENT_DIR="$STATE_DIR/transient"

# The trimmed service set, as exclusions. The app uses realtime and storage and
# reaches all of it through the gateway, so the set that stays is the database,
# auth, the REST layer, the gateway, realtime and storage; everything else is
# excluded. These names are the ones the CLI's own warning prints — its help
# text lists a different set, and an invalid name is ignored with a warning
# rather than an error, so an excluded service would quietly start anyway.
#
# It costs 656 MB idle against WSL's shared 12 GB cap, which is what makes a
# stack per worktree affordable. It has no mail catcher, so an auth email
# cannot be read on one; that is fine because both seeds create accounts
# directly.
STACK_EXCLUDE=edge-runtime,imgproxy,logflare,mailpit,postgres-meta,studio,supavisor,vector

# The three .env.local values a stack takes over: what the app reads to reach
# Supabase, and nothing else. The linked-project ref, the database password and
# the staging sign-in credentials deliberately stay put, because the CLI
# commands and the procedure skills in a worktree go on meaning staging.
ENV_KEYS="NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY"

stack_state_dir() {
  printf '%s/%s' "$STACKS_DIR" "$1"
}

# config.toml, rewritten: its own project id and every port shifted, which is
# all it takes for two checkouts' stacks to coexist. migrations/ and the seed
# are symlinked back to the checkout — the CLI follows symlinks for both — so
# the copy holds exactly one rewritten file and can be thrown away.
#
# The fourth argument is whether the CLI loads seed.sql when it creates the
# database. The two seeds never share one: the DB tests' database IS seed.sql
# and passes true, while a stack, which gets supabase/rich-seed.sql, passes
# false so that the fixtures are never there to be mistaken for the catalogue —
# as does `generate`, which wants a schema and would only be slowed down by
# rows.
build_shadow() {
  shadow_checkout=$1
  shadow_project=$2
  shadow_base=$3
  shadow_seed=$4
  shadow_work=$(shadow_workdir "$shadow_project")

  rm -rf "$shadow_work"
  mkdir -p "$shadow_work/supabase"

  awk -v id="$shadow_project" -v base="$shadow_base" '
    # Only the FIRST project_id is ours: the file carries three, one per
    # remote, and rewriting those would repoint the linked projects.
    !renamed && /^[[:space:]]*project_id[[:space:]]*=/ {
      print "project_id = \"" id "\""
      renamed = 1
      next
    }
    # Ports are rewritten by KEY, never by "the first number on the line" —
    # pop3_port has a digit in its name. The value is taken after the "=".
    /^[[:space:]]*(port|shadow_port|smtp_port|pop3_port)[[:space:]]*=/ {
      split($0, kv, "=")
      key = kv[1]
      gsub(/[[:space:]]/, "", key)
      shifted = base + (kv[2] + 0) % 100
      if (seen[shifted]) {
        print "config.toml ports collide once shifted: " key " and " seen[shifted] > "/dev/stderr"
        exit 1
      }
      seen[shifted] = key
      print key " = " shifted
      next
    }
    { print }
    END {
      if (!renamed) {
        print "config.toml has no project_id to rewrite" > "/dev/stderr"
        exit 1
      }
    }
  ' "$shadow_checkout/supabase/config.toml" > "$shadow_work/supabase/config.toml"

  ln -s "$shadow_checkout/supabase/migrations" "$shadow_work/supabase/migrations"
  ln -s "$shadow_checkout/supabase/seed.sql" "$shadow_work/supabase/seed.sql"

  printf '%s\n' '' '[db.seed]' "enabled = $shadow_seed" >> "$shadow_work/supabase/config.toml"

  printf '%s' "$shadow_work"
}

# The shadow workdir for a stack, built only if it is not already there. A
# parked stack is its named volumes and nothing else — `supabase stop` removes
# the containers — and `supabase start` creates fresh ones around those volumes
# from this workdir's config.toml. Keeping the workdir is what brings a stack
# back configured as it was created, whatever the checkout's config.toml says
# now; rebuilding it would quietly change a stack that already exists.
ensure_shadow() {
  ensure_work=$(shadow_workdir "$2")
  if [ ! -f "$ensure_work/supabase/config.toml" ]; then
    build_shadow "$1" "$2" "$3" "$4" >/dev/null
  fi
  printf '%s' "$ensure_work"
}

# The `[db.seed]` switch inside a workdir that already exists. `build_shadow`
# writes the line once, when the stack is created; `reset` writes it off again
# before the CLI rebuilds the database, whatever config the workdir was created
# with, because a rebuild that loaded seed.sql's fixtures would leave the rich
# seed refusing a database that already holds accounts. Rewritten in place rather
# than by rebuilding the workdir: the containers were created against this
# config, so the rest of it must not move.
set_shadow_seed() {
  seed_config="$1/supabase/config.toml"
  awk -v want="$2" '
    /^\[/ { section = $0 }
    section == "[db.seed]" && /^[[:space:]]*enabled[[:space:]]*=/ {
      print "enabled = " want
      next
    }
    { print }
  ' "$seed_config" > "$seed_config.new"
  mv "$seed_config.new" "$seed_config"
}

# A port, read back out of the rewritten config rather than recomputed, so the
# shift arithmetic has exactly one home.
shadow_port() {
  awk -v want="[$2]" '
    /^\[/ { section = $0 }
    section == want && /^[[:space:]]*port[[:space:]]*=/ {
      split($0, kv, "=")
      print kv[2] + 0
      exit
    }
  ' "$1/supabase/config.toml"
}

shadow_db_port() {
  shadow_port "$1" db
}

shadow_api_port() {
  shadow_port "$1" api
}

# One value out of a record — a stack's meta, or a generate claim — or nothing.
record_value() {
  awk -v key="$2" 'index($0, key "=") == 1 { print substr($0, length(key) + 2); exit }' "$1"
}

# The first port of the block a record holds. A record with no `port_base` line
# names its block through its API port instead, which sits inside it.
record_port_base() {
  record_base=$(record_value "$1" port_base)
  if [ -z "$record_base" ]; then
    record_api=$(record_value "$1" api_port)
    case "$record_api" in
      '' | *[!0-9]*) return 0 ;;
    esac
    record_base=$((record_api / 100 * 100))
  fi
  printf '%s' "$record_base"
}

# Every block some record claims, space-separated: each stack's, parked or
# running, and each throwaway database's. A stack whose worktree is gone still
# claims its block, because its volumes are still there and `up` would bring it
# back on it.
claimed_blocks() {
  for claim in "$STACKS_DIR"/*/meta "$TRANSIENT_DIR"/*; do
    [ -f "$claim" ] || continue
    printf '%s ' "$(record_port_base "$claim")"
  done
}

# The machine-wide allocation lock, on fd 8: one lock for every checkout rather
# than the per-checkout one, because two checkouts' first starts at the same
# moment would otherwise both read the records, both see the same block free,
# and both take it. It waits rather than refusing, since it is held only while
# a block is chosen and recorded.
hold_ports_lock() {
  mkdir -p "$STATE_DIR"
  exec 8>"$STATE_DIR/ports.lock"
  if ! flock -w 60 8; then
    echo "Timed out waiting for another local-database command to finish choosing its ports." >&2
    return 1
  fi
}

release_ports_lock() {
  exec 8>&-
}

# Every container, volume and network the CLI made for one project id, and its
# shadow workdir. The CLI names them all `supabase_<thing>_<id>`, and an id
# holds no underscore, so `_<id>` as an exact suffix matches that id's and no
# other's — never a substring, which would take a stack's throwaway neighbours
# with it.
remove_project() {
  remove_containers=$(stack_containers_all "$1")
  remove_volumes=$(docker volume ls -q 2>/dev/null | grep -E "_$1\$" || true)
  remove_networks=$(docker network ls --format '{{.Name}}' 2>/dev/null | grep -E "_$1\$" || true)
  # Word splitting is what turns each name list into arguments here.
  # shellcheck disable=SC2086
  {
    [ -z "$remove_containers" ] || docker rm -f $remove_containers
    [ -z "$remove_volumes" ] || docker volume rm -f $remove_volumes
    [ -z "$remove_networks" ] || docker network rm $remove_networks
  } >/dev/null 2>&1 || true
  rm -rf "$(shadow_workdir "$1")"
}

# A throwaway database's claim whose run is gone. A run holds a lock on its own
# claim file for as long as it lives (`claim_transient_block`), and the kernel
# drops that lock however the run ends — SIGKILL included — so a claim whose
# lock can be taken is one nothing holds. Its leftovers go before its claim
# does, so the block is free of containers by the time anyone is handed it.
#
# Only ever called with the ports lock held. A run takes its claim's lock under
# that same lock, so it cannot slip in between this finding a claim free and
# removing it.
reap_stale_claims() {
  for reap_claim in "$TRANSIENT_DIR"/*; do
    [ -f "$reap_claim" ] || continue
    if flock -n "$reap_claim" true 2>/dev/null; then
      echo "Reaping $(basename "$reap_claim")'s claim; its run is gone." >&2
      remove_project "$(basename "$reap_claim")"
      rm -f "$reap_claim"
    fi
  done
}

# The first candidate no record claims. The candidates are the blocks the Node
# side found Windows could bind, as one comma-separated word (`-` for none).
pick_block() {
  pick_claimed=" $(claimed_blocks)"
  for pick_base in $(printf '%s' "$1" | tr ',' ' '); do
    case "$pick_base" in
      '' | *[!0-9]*) continue ;;
    esac
    case "$pick_claimed" in
      *" $pick_base "*) continue ;;
    esac
    printf '%s' "$pick_base"
    return 0
  done
  echo "No free port block in 20000-23999: every one is claimed by a stack or cannot be bound" >&2
  echo "on Windows right now. \`npm run db -- list\` shows the stacks; \`down\` one that is done." >&2
  return 1
}

# A port block for a stack that has none, recorded.
#
#   allocate_block <record-file> <candidates> [line…]
#
# The block is written into <record-file> as `port_base=`, followed by any
# further lines given, and printed. The record is written before anything
# starts on the ports, so a second allocation can never be handed the same
# block. Run in a command substitution, so the ports lock is released when the
# allocation returns.
allocate_block() {
  alloc_record=$1
  alloc_candidates=$2
  shift 2
  hold_ports_lock || return 1
  reap_stale_claims
  alloc_base=$(pick_block "$alloc_candidates") || return 1
  mkdir -p "$(dirname "$alloc_record")"
  {
    printf 'port_base=%s\n' "$alloc_base"
    for alloc_line in "$@"; do
      printf '%s\n' "$alloc_line"
    done
  } > "$alloc_record"
  printf '%s' "$alloc_base"
}

# A port block for a throwaway database, held for exactly as long as this run.
#
#   claim_transient_block <project-id> <candidates>   # sets port_base
#
# The claim is a file under TRANSIENT_DIR that this run keeps open, with a lock
# on it, on fd 7 until it exits — which is what lets `reap_stale_claims` tell a
# claim whose run was killed from a live one without anyone having to clean up
# after a SIGKILL. The run's own cleanup removes the file; if it never got to,
# the next allocation anywhere on the machine does, after removing what the
# dead run left running on the block.
#
# The block is always picked afresh from this run's candidates, and written
# over whatever claim this identity left behind. The file is opened and locked
# under the ports lock, so a reaper never sees it unlocked in between.
claim_transient_block() {
  claim_file="$TRANSIENT_DIR/$1"
  hold_ports_lock || return 1
  mkdir -p "$TRANSIENT_DIR"
  # Appending, so a claim another run holds is not emptied before the lock
  # below finds it held.
  exec 7>>"$claim_file"
  if ! flock -n 7; then
    release_ports_lock
    echo "Another run holds $1's port claim." >&2
    return 1
  fi
  # Only now is the file this run's to remove.
  claim=$claim_file
  reap_stale_claims
  if ! port_base=$(pick_block "$2"); then
    release_ports_lock
    return 1
  fi
  printf 'port_base=%s\n' "$port_base" > "$claim"
  release_ports_lock
}

# A throwaway database, built for one run and removed when it ends.
#
#   transient_db <checkout> <project-id> <candidates> <cli-version> <seed> <excluded-services>
#
# `generate` and the DB tests both run on one. It sets `cli`, `work`,
# `port_base` and `db_port`, and installs the trap that removes the database,
# its workdir, its claim and any path in `transient_paths` however the run ends.
# The database goes before the claim, so a block is never free while a
# container still holds it.
#
# The slate is cleared first, every run. A run killed without its trap leaves
# this id's containers behind with their volumes, and `supabase start` reuses
# an existing container rather than building a new one — and migrations apply
# when a database is created, not when it is restarted, so the reused one would
# hand back the PREVIOUS run's schema with a zero exit.
#
# SIGPIPE is ignored so that a reader who has gone away — the Node side killed —
# turns the next write into a failed command, which ends the run through its
# trap, rather than into a signal that ends it without one. Every CLI call reads
# /dev/null: a prompt that waited on stdin would hang a run nobody is watching.
transient_paths=""
transient_db() {
  transient_project=$2
  trap '' PIPE
  # The lock before the trap: a run refused because another holds this id must
  # leave that run's database alone.
  take_lock "$transient_project"
  trap transient_cleanup EXIT INT TERM HUP
  ensure_cli "$4"
  cli=$(cli_bin "$4")

  step "Choosing ports"
  claim_transient_block "$transient_project" "$3"
  echo "Ports $port_base-$((port_base + 99)), until this run ends"

  remove_project "$transient_project"
  work=$(build_shadow "$1" "$transient_project" "$port_base" "$5")

  step "Starting a throwaway database"
  "$cli" start --workdir "$work" -x "$6" < /dev/null
  db_port=$(shadow_db_port "$work")
}

transient_cleanup() {
  transient_status=$?
  trap - EXIT INT TERM HUP
  set +e
  remove_project "$transient_project"
  # Word splitting is what turns the path list into arguments here.
  # shellcheck disable=SC2086
  rm -rf $transient_paths "${claim:-}"
  exit "$transient_status"
}

# Is this stack's database container up? Matched exactly rather than through
# `docker ps --filter name=`, whose match is a substring: the filter form would
# report a stack running because the `generate` database beside it is.
stack_is_running() {
  docker ps --format '{{.Names}}' 2>/dev/null | grep -qxF "supabase_db_$1"
}

# Every container of one stack. The CLI names them `supabase_<service>_<id>`,
# so the id is an exact suffix match — again, never a substring.
stack_containers() {
  docker ps --format '{{.Names}}' 2>/dev/null | grep -E "_$1\$" || true
}

stack_containers_all() {
  docker ps -a --format '{{.Names}}' 2>/dev/null | grep -E "_$1\$" || true
}

# Resident memory of a stack's running containers, in MiB. Only running ones
# have any: a parked stack is volumes on disk and nothing else, which is the
# point of parking.
stack_memory_mib() {
  mem_names=$(stack_containers "$1")
  if [ -z "$mem_names" ]; then
    printf '0'
    return 0
  fi
  # Word splitting is what turns the name list into arguments here.
  # shellcheck disable=SC2086
  docker stats --no-stream --format '{{.MemUsage}}' $mem_names 2>/dev/null | awk '
    {
      value = $1 + 0
      if (index($1, "GiB")) value *= 1024
      else if (index($1, "KiB")) value /= 1024
      total += value
    }
    END { printf "%.0f", total }
  '
}

# How many of this machine's stacks are running, over every checkout. The Node
# side reads this off the sentinel line below and holds the distro keep-alive
# while it is above zero, so a stack never depends on a terminal staying open.
running_stack_count() {
  count_running=0
  for count_meta in "$STACKS_DIR"/*/meta; do
    [ -f "$count_meta" ] || continue
    if stack_is_running "$(basename "$(dirname "$count_meta")")"; then
      count_running=$((count_running + 1))
    fi
  done
  printf '%s' "$count_running"
}

# The one line every command hands back to the Node side rather than to the
# reader. The prefix is what keeps it off the screen.
report_running() {
  printf '::localdb running=%s\n' "$(running_stack_count)"
}

# A line for the reader. Everything else a command prints goes to the run's log
# alone, so this is how a command says what the reader needs: on success, the
# whole of what they see.
say() {
  printf '::localdb say %s\n' "$*"
}

# The step a command is on. Written into the log as a heading, and named to the
# reader if the run fails, so a failure says where it happened.
step() {
  printf '::localdb step %s\n' "$*"
}

# One key's whole line in .env.local, replaced, with every other byte of the
# file left exactly as it was — a worktree's .env.local is sometimes edited on
# purpose and this file has no business tidying it.
#
# The replacement travels through the environment rather than `awk -v`, which
# processes backslash escapes in the value it is given. The file is rewritten
# through its existing inode (`cat >`) rather than replaced by a rename, so
# whatever Windows-side permissions it carries survive.
set_env_line() {
  env_file=$1
  env_key=$2
  env_tmp="$env_file.localdb.tmp"

  LOCALDB_LINE=$3 awk -v key="$env_key" '
    index($0, key "=") == 1 { seen++; if (seen == 1) { print ENVIRON["LOCALDB_LINE"]; next } }
    { print }
    END {
      if (!seen) {
        print "No " key " line in .env.local to replace." > "/dev/stderr"
        exit 1
      }
      # Rewriting the first of several would be worse than rewriting none: a
      # dotenv reader takes the LAST assignment, so the file would go on
      # meaning the old value while this reported success.
      if (seen > 1) {
        print ".env.local has " seen " " key " lines. The last one is the one that counts when the file is read, so remove the duplicates before running this again." > "/dev/stderr"
        exit 1
      }
    }
  ' "$env_file" > "$env_tmp"

  cat "$env_tmp" > "$env_file"
  rm -f "$env_tmp"
}

# The staging values, set aside verbatim so `down` can put them back. Written
# once per stack and never overwritten: a second `up` would otherwise set the
# stack's own values aside as if they were the originals.
capture_env_aside() {
  : > "$2"
  chmod 600 "$2"
  for aside_key in $ENV_KEYS; do
    aside_line=$(grep -m1 "^$aside_key=" "$1" || true)
    if [ -z "$aside_line" ]; then
      echo "No $aside_key line in .env.local; this checkout is not configured for Supabase." >&2
      rm -f "$2"
      return 1
    fi
    printf '%s\n' "$aside_line" >> "$2"
  done
}

restore_env_aside() {
  while IFS= read -r restore_line; do
    [ -n "$restore_line" ] || continue
    set_env_line "$1" "${restore_line%%=*}" "$restore_line"
  done < "$2"
}

# The rich seed, applied through the database container's own psql so the
# client version always matches the server. It guards itself against a second
# application, so the caller decides when it runs: on the start that created
# the database, and again after a reset, never on a resume.
apply_rich_seed() {
  docker exec -i "supabase_db_$2" \
    psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$1/supabase/rich-seed.sql" >/dev/null
}

# One value out of `supabase status -o env`, unquoted.
status_value() {
  awk -v key="$2" '
    index($0, key "=") == 1 {
      value = substr($0, length(key) + 2)
      gsub(/^"|"$/, "", value)
      print value
      exit
    }
  ' "$1"
}

# One command at a time per project id. Two runs share the id, the ports, the
# shadow workdir and the state directory, so a second would tear the first's
# database down underneath it. The lock is held for the life of the script and
# released by the kernel however it ends, so a killed run leaves nothing to
# unlock by hand.
take_lock() {
  if ! command -v flock >/dev/null 2>&1; then
    echo "flock is missing from this distro; it ships in util-linux (sudo apt-get install util-linux)." >&2
    # Not 1: nothing has been read or changed, so this is "the command could not
    # run" rather than an outcome. The variable is defined below this function
    # and set by the time anything calls it.
    exit "$EXIT_COULD_NOT_RUN"
  fi
  mkdir -p "$STATE_DIR"
  exec 9>"$STATE_DIR/$1.lock"
  if ! flock -n 9; then
    echo "Another local-database command is running for this checkout ($1). Wait for it to finish." >&2
    exit 1
  fi
}

# A failed stack is restarted, never "fixed" by restarting WSL: the distro is
# shared with the owner's other long-running work, which a shutdown destroys.
# There is no `wsl --shutdown` or `wsl --terminate` anywhere in this script, and
# there must not be. If Docker itself is wedged, restart the Docker service.
stop_stack() {
  # `--yes` is not decoration: this runs with stdin closed, so a stop that asks
  # anything fails instead of answering, and the force-remove below would then
  # be the only thing that happened — the database gone and every other service
  # of the stack left holding its ports.
  "$1" stop --workdir "$2" --no-backup --yes >/dev/null 2>&1 || true
  docker rm -f "supabase_db_$3" >/dev/null 2>&1 || true
}

# The exit status a command uses to say it could not run at all: wsl.exe would
# not spawn, the distro never answered, or the script stopped before it had read
# anything about the stack. Nothing was inspected and nothing was changed, so a
# caller that has to decide whether to carry on — the worktree teardown script
# is the one that does — may carry on past it, where any other non-zero status
# is an outcome and stops it. The Node side maps this onto its own exit code;
# see local-db.mjs.
EXIT_COULD_NOT_RUN=2

# The first thing the Node side hears from inside the distro, emitted when this
# file is sourced: wsl.exe started bash and bash found the command script. The
# absence of it is what tells the Node side that nothing ran, which no exit
# status can — wsl.exe's own failures and bash's share the small numbers.
printf '::localdb started\n'
