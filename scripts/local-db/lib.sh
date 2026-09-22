#!/usr/bin/env bash
# Shared helpers for the local-database commands. Sourced by a command script,
# never run on its own.
#
# Everything here runs inside the WSL distro. It is a file rather than shell
# text passed across the boundary on purpose: crossing from a Windows shell
# into the distro mangles `~`, rooted Linux paths, inline environment
# assignments and anything carrying `$` or nested quotes, so the boundary
# carries only a file path and a few bare words.

# PATH and HOME are set here rather than inherited. The distro inherits the
# Windows PATH, so a bare `node` or `npm` inside it resolves to the Windows
# install, and the assignment splits on the space in "Program Files"; HOME
# arrives as the Windows one with its backslashes eaten ("C:UsersKyle").
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
HOME=$(getent passwd "$(id -u)" | cut -d: -f6)
export HOME

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
  echo "Installing Supabase CLI v$cli_version into the distro…" >&2
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

# config.toml, rewritten: its own project id and every port shifted, which is
# all it takes for two checkouts' stacks to coexist. migrations/ and the seed
# are symlinked back to the checkout — the CLI follows symlinks for both — so
# the copy holds exactly one rewritten file and can be thrown away.
build_shadow() {
  shadow_checkout=$1
  shadow_project=$2
  shadow_base=$3
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

  printf '%s\n' '' '[db.seed]' 'enabled = false' >> "$shadow_work/supabase/config.toml"

  printf '%s' "$shadow_work"
}

# The database port, read back out of the rewritten config rather than
# recomputed, so the shift arithmetic has exactly one home.
shadow_db_port() {
  awk '
    /^\[/ { section = $0 }
    section == "[db]" && /^[[:space:]]*port[[:space:]]*=/ {
      split($0, kv, "=")
      print kv[2] + 0
      exit
    }
  ' "$1/supabase/config.toml"
}

# A failed stack is restarted, never "fixed" by restarting WSL: the distro is
# shared with the owner's other long-running work, which a shutdown destroys.
# There is no `wsl --shutdown` or `wsl --terminate` anywhere in this script, and
# there must not be. If Docker itself is wedged, restart the Docker service.
stop_stack() {
  "$1" stop --workdir "$2" --no-backup >/dev/null 2>&1 || true
  docker rm -f "supabase_db_$3" >/dev/null 2>&1 || true
}
