---
name: hotfix-to-main
description: Cherry-pick specific dev commits onto a hotfix branch and PR them to main, ahead of a full release.
---

Ship a *subset* of `dev` to `main` ahead of the next full release. This is the operation `/pr-dev-to-main` explicitly does not do: branch off `origin/main`, cherry-pick the named commits, verify, PR. It deliberately leaves twin commits behind (the originals stay on `dev`), and that's fine — the next full release run detects them at its Step 2 divergence gate and filters them out. The job of this command is to do the transplant safely and to not break that self-healing loop.

Two invariants everything below serves:

1. **Subjects must survive verbatim.** The release command's twin filter matches main-only commits against dev commits *by subject*. Never reword a subject during cherry-pick, and the merge into `main` must preserve it too (Step 5).
2. **`dev` is never reset after a hotfix.** It still holds the originals plus everything you held back. The post-release `dev := main` reset belongs to full releases only.

## Step 1 — Inputs & preflight

1. Confirm we are in the Sogverse repo and on a clean working tree. If not clean: stop and tell the user. Do not stash.
2. `git fetch origin` (always — `origin/main` and `origin/dev` must be fresh).
3. The arguments are the dev commits to ship (hashes, or descriptions clear enough to identify them). If none were given, show `git log origin/main..origin/dev --no-merges --oneline` and ask the user which to ship.
4. Validate every candidate commit:
   - It is reachable from `origin/dev` (`git merge-base --is-ancestor <sha> origin/dev`).
   - It is not already on `main` by content: `git cherry origin/main <sha>^..<sha>` — a `-` row means an equivalent change already landed; drop it from the list and tell the user.

## Step 2 — Branch & cherry-pick

1. `git checkout -b hotfix/<slug> origin/main` — slug derived from the commit subject (e.g. `hotfix/checkout-promo-codes`). If the branch exists, append `-2`, `-3`, etc.
2. Cherry-pick the commits in **chronological order (oldest first)** in one command: `git cherry-pick <hash1> <hash2> ...`. Do not edit messages — subjects must stay verbatim (invariant 1).
3. If a conflict appears, **stop. Do not auto-resolve.** A hotfix conflict usually means the fix textually depends on dev commits you are not bringing along. Surface the conflicting commit and ask the user to choose:
   - **Include the dependency** — abort, add the missing commit(s) to the list, restart Step 2. The hotfix grows; make sure the user actually wants the dependency on prod.
   - **Resolve by hand** — only when the overlap is trivial and the resolution is obvious.
   - **Abandon the cherry-pick** — write the fix fresh against `main` on this branch instead. Give the new commit the *same subject* as the dev original so the twin filter still pairs them.

## Step 3 — Verify (mandatory gate)

Run `npm run lint`, `npm run type-check`, and the tests covering the changed code (`npx vitest run <files>`). **Any failure is a hard stop — do not push.**

This gate is mandatory here, unlike the release command's optional check, because the commit is being transplanted onto an older codebase it was never tested against. A clean cherry-pick only proves there was no *textual* conflict; the commit can still depend semantically on something that exists only on `dev` (a helper added two commits earlier, a renamed type, a regenerated database type). CI on the PR is the backstop, but failures should be caught before anything is pushed.

## Step 4 — Push & draft the PR

1. `git push -u origin hotfix/<slug>`.
2. Draft and show the user before opening:
   - **Title:** `Hotfix: <what it fixes/enables>`. Keep under 70 chars.
   - **Summary:** what the change does and why it can't wait for the next release, plus the cherry-picked dev hashes.
   - **Test plan:** CI green, plus 1-3 hand-verifiable items on prod after deploy.
   - **Merge note:** state that the PR must be merged as a **merge commit** (see Step 5 for why), and that **`dev` must NOT be reset** after merging.
3. Open with `gh pr create --base main --head hotfix/<slug>`.

## Step 5 — Remind about the merge & cleanup

After the PR URL is returned, remind the user:

- **Merge it as a merge commit.** A merge commit lands the cherry-picked commit on `main` with its subject intact, which is what lets the next release's twin filter pair it with the dev original. A squash merge titled after the *PR* puts a subject on `main` that matches nothing on `dev` — the next release would then try to re-pick the original, hit an empty/already-applied cherry-pick, and stop to ask a confused human. (If the user insists on squashing, the squash message's first line must be the original commit subject verbatim. GitHub's default for a single-commit PR is the commit's own message, so the default is usually right — but say it explicitly.)
- **Do not reset `dev`.** Invariant 2. The twins this leaves on `main` are expected; the next `/pr-dev-to-main` run self-heals via its divergent path.
- The hotfix branch needs no manual deletion — `/cleanup-branches` matches by content against `dev`, and the originals are already there.

Finally, `git checkout dev` so the working tree is left where day-to-day work happens.

## Notes

- The only writes are the hotfix branch and the PR. No force-pushes, no writes to `dev` or `main`.
- A multi-commit hotfix is supported but suspect — the more commits, the more likely one drags a semantic dependency along. If the list grows past 2-3, ask whether a full release (`/pr-dev-to-main`) is the better move.
- If the fix doesn't exist on `dev` yet, this command doesn't apply in reverse — land it on `dev` first, then hotfix it over. Writing a fix on the hotfix branch only (Step 2's abandon option aside) would make `main` carry a change `dev` lacks, and the next release's twin filter has no pair for it.
