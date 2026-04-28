# bedrock-portal — deploying code changes

How to ship a code change in `services/bedrock-portal/` to the live GCE box. The service runs compiled JS from `dist/`, so source edits have no effect until rebuilt and the systemd unit is restarted.

Prereqs: change is committed and pushed to `origin/dev`. `dist/` is gitignored and rebuilt on the box, so don't rebuild locally before pushing.

## Remote one-shot via `gcloud` (preferred — and what Claude Code should use)

This path doesn't need an interactive SSH session, so it's the right form for an agent to run end-to-end. From your laptop, in any working directory:

```bash
gcloud compute ssh kyle_hutchinson@bedrock-portal --zone=us-central1-a --command='
  set -e
  export PATH="$HOME/.local/bin:$PATH"
  cd ~/Sogverse
  # Stash any dirty working tree rather than discarding — drift is recoverable
  # via `git stash list` if you guessed wrong about it being safe to overwrite.
  if ! git diff --quiet || ! git diff --cached --quiet; then
    git stash push -m "pre-deploy-$(date +%F)"
  fi
  git pull --ff-only
  # `npm install` only if package.json deps changed — skip otherwise; it
  # rewrites the lockfile in ways that produce noisy diffs vs. what you
  # committed locally on a different platform.
  npm run build --workspace=sogverse-bedrock-portal
  systemctl --user restart bedrock-portal
  sleep 6   # give the new process time to log "session live"
  journalctl --user -u bedrock-portal -n 30 --no-pager
'
```

Verify the tail ends with the new pid logging:

```
[portal] session live — redirecting joins to en.mc.sog.gg:19132
[portal] started as "Sogverse" | joinability=FriendsOnly
```

If you instead see `SIGTERM received, stopping session…` as the last line and no fresh `session live`, the new process hasn't logged yet — re-run just the journalctl tail (`gcloud compute ssh kyle_hutchinson@bedrock-portal --zone=us-central1-a --command='journalctl --user -u bedrock-portal --since "1 minute ago" --no-pager'`).

## Things that will trip you up if you skip them

- **SSH user must be `kyle_hutchinson@`.** Without the `user@` prefix, gcloud uses your local OS username (e.g. `Kyle@` on Windows) and `cd ~/Sogverse` lands in the wrong home directory. The repo lives at `/home/kyle_hutchinson/Sogverse`.
- **`gcloud auth login` is interactive and cannot run inside Claude Code's non-interactive shell.** If gcloud says `Reauthentication failed. cannot prompt during non-interactive execution`, ask the user to run `gcloud auth login` themselves (in Claude Code, the `!gcloud auth login` prompt prefix). Once they do, retry the deploy command.
- **`PATH` must include `$HOME/.local/bin`.** Node 20 is installed user-local on the box, not system-wide — without that export, `npm` and `node` aren't on PATH inside the SSH command.
- **`--ff-only` is intentional.** The deploy should never silently merge — if `dev` has diverged from the box's HEAD, that's a signal to investigate, not paper over.
- **The systemd unit is `bedrock-portal` and runs as `--user kyle_hutchinson`.** No `sudo`, no system-wide systemctl. Linger is enabled (`/var/lib/systemd/linger/kyle_hutchinson`) so it survives SSH disconnect and reboot.

## Already SSH'd in interactively

If you're already in a real SSH session on the box (e.g. you ran `gcloud compute ssh kyle_hutchinson@bedrock-portal --zone=us-central1-a` with no `--command`):

```bash
cd ~/Sogverse
git pull
npm install                                              # only if deps changed
npm run build --workspace=sogverse-bedrock-portal        # tsc → dist/
systemctl --user restart bedrock-portal
journalctl --user -u bedrock-portal -n 30                # confirm "session live"
```

Same expected log line. Same caveats about `--ff-only` and `npm install` apply.

## If something goes wrong

- **`git pull` refused — "Your local changes to the following files would be overwritten by merge"** → the box has a dirty working tree. The one-shot block above stashes automatically, but if you're SSH'd in, run `git stash push -m "pre-deploy-$(date +%F)"` then retry. Never `git checkout .` or `git reset --hard` without first reading the diff (`git --no-pager diff`) — past dirty-tree contents have turned out to be edits that already exist as proper commits in `origin/dev`, but verify before discarding.
- **`tsc` fails** → fix and re-push. The old `dist/` is still in place and the running service hasn't been touched yet (the `set -e` aborts before `systemctl restart`).
- **Service won't start after restart** → check `systemctl --user status bedrock-portal` and `journalctl --user -u bedrock-portal -n 100 --no-pager` for the crash. Most common cause is a missing/expired Microsoft refresh token in `.auth-cache/` — see "Re-authenticating the alt account" in `README.md`.
- **You discover unstashed work in the stash list afterwards** → `git stash list` shows entries with the `pre-deploy-YYYY-MM-DD` label. Inspect with `git stash show -p stash@{N}` and either `git stash pop` to restore or `git stash drop stash@{N}` to discard once you're sure.
