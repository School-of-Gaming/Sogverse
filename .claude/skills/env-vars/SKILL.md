---
name: env-vars
description: Add, change or rotate an environment variable — its lines in .env.local and .env.local.example (including a staging/production pair of values), the owner pasting the secret, copying it into a worktree, Vercel (preview, production, development) through the CLI, and a GitHub Actions secret when CI reads it. Also the first hypothesis when an integration starts answering Invalid API key after an env change.
---

# Environment variables

A variable reaches four places, in this order, and a session never types a secret
into any of them: the owner pastes it once, into the main checkout's `.env.local`, and
every other copy is piped from there.

## 1. The two lines

Write the variable's line into both files yourself, rather than asking the owner to:

- `.env.local` **in the main checkout** — the line with an **empty** value, beside the
  variables it belongs with.
- `.env.local.example` **on the branch whose code reads the variable** — the worktree's
  copy when the work is in one — with a placeholder value and a comment saying what the
  variable is, where it comes from (which dashboard, which permissions or scopes) and
  anything an operator must set up beside it. It is tracked, so it lands with the code:
  written into the main checkout, it would put on `dev` a variable nothing reads yet and
  collide with the branch at merge. `.env.local` is gitignored, so nothing lands there.

When a variable is retired, delete its lines from both `.env.local` files and its
comment with them, so no orphaned heading is left behind.

### When staging and production have different values

Many variables have one value everywhere. Where staging and production each have their
own (two apps, two accounts, two keys), the repo convention is:

- **The unsuffixed name holds the staging value** — it is what the code reads, and what
  the local server and Vercel Preview run on.
- **`<NAME>_PRODUCTION` holds the production value**, in `.env.local` only, so a checkout
  has it for the Vercel Production write (and for live checks). The code never reads the
  suffixed name.
- Both lines go into both files, the `_PRODUCTION` one directly under its pair, and the
  example's comment says which is which.
- **A pair is the owner's call, not a default.** Ask whether staging gets its own value;
  where it does not, the variable is a single line everywhere.

**Why:** the running local server must never point at production, and one name in the
code keeps every environment's wiring identical — the difference lives only in which
value Vercel holds. The Discord, Slack, Meta and Lynx variables are the existing
instances.

**Why `.env.local` in the main checkout, even from a worktree:** a worktree's `.env.local`
is a copy that dies at teardown, so a value pasted only there is lost. A session working in a worktree
writes the main checkout's files by absolute path; an agent launched inside a worktree
cannot write there at all, so it hands the lines to the session that launched it.

## 2. The owner pastes the value

Open the main checkout's `.env.local` for the owner in their default text editor, then
say which lines to fill — for a pair, which value goes on the unsuffixed line and which
on `_PRODUCTION` — and wait for them to say they have saved. Don't edit the file while
it is open there: a session's write and their save would overwrite each other, so a
change needed meanwhile is described for them to make.

**Why:** a secret written by a session passes through its transcript, and a value typed
into chat is in it for good. The owner pastes it straight from the provider's dashboard
into the file.

Then check the line is filled **without printing the value** — the length is enough:

```bash
grep '^KEY=' .env.local | sed 's/^[^=]*=//' | tr -d '\n\r' | wc -c
```

## 3. A worktree gets the new lines, never the whole file

If the work is in a worktree, copy **only the new lines** from the main checkout's
`.env.local` into the worktree's, replacing their empty placeholders there, without the
value passing through the transcript:

```bash
v=$(grep '^KEY=' .env.local | sed 's/^[^=]*=//' | tr -d '\n\r')
sed -i "s|^KEY=.*|KEY=$v|" .claude/worktrees/<name>/.env.local
```

A worktree session's isolation guard refuses the `$(…)`, so it runs as a single Bash call
from the main checkout — after the session has left the worktree, or by the session that
launched it.

**Why not the whole file:** `npm run db -- up` rewrites three Supabase values in a
worktree's `.env.local` to point at its local stack (`supabase/CLAUDE.md`); copying the
main checkout's file over it silently points the worktree's dev server back at staging.

A dev server reads `.env.local` only at start, so restart one you started (never one you
did not) to pick the value up.

## 4. Vercel — piped through the CLI, never the UI

```bash
grep "^KEY=" .env.local | sed 's/^[^=]*=//' | tr -d '\n\r' | vercel env add KEY <env> [--sensitive]
```

Run once per environment that needs it (`preview`, `production`, `development`), from the
main checkout. A variable with a staging/production pair is written under the
**unsuffixed name** in every environment, with the value read from the matching line:

```bash
grep "^KEY=" .env.local | sed 's/^[^=]*=//' | tr -d '\n\r' | vercel env add KEY preview --sensitive
grep "^KEY_PRODUCTION=" .env.local | sed 's/^[^=]*=//' | tr -d '\n\r' | vercel env add KEY production --sensitive
```

`KEY_PRODUCTION` itself is never added to Vercel.

**Why:** on 2026-05-28 ~15 env vars were re-uploaded through the UI to flip them to
Sensitive and four ended up with garbage appended — two got a literal LF at the end, two
got the two-character text `\n` (backslash + n). The service-role-key damage surfaced as a
400 "Invalid API key" from an admin route. The mixed corruption pattern points at pasting
from a place that displayed the value with a trailing newline; the UI accepted both
without warning.

### `--sensitive`: Preview and Production yes, Development never

For a real secret (API keys, tokens, signing secrets, service-role keys — anything not
`NEXT_PUBLIC_*` or a pure identifier), add `--sensitive`. **Vercel rejects it when the
target is `development`** ("You cannot set a Sensitive Environment Variable's target to
development") — dev values are designed to be pulled to local disk via `vercel env pull`,
which is incompatible with never-readable-back. For dev, add without the flag (the
Encrypted tier).

**Why:** the standard Encrypted tier leaves the value readable by anyone with project
access. Every non-public secret was flipped to Sensitive on 2026-05-28 to harden against
a future compromised Vercel account. Public vars (`NEXT_PUBLIC_*`) and identifiers
(`*_CLIENT_ID`, `*_TENANT_ID`, list ids, public verification keys) stay Encrypted — they
are meant to be readable.

Migrating an existing var to sensitive without rotating it:
`vercel env pull .vercel/.env.X --environment=X --yes` → strip the surrounding quotes →
`vercel env rm NAME X --yes` → `printf '%s' "$value" | vercel env add NAME X --sensitive`
→ delete the pulled file.

### A redeploy follows

**Vercel does NOT auto-redeploy when env vars change** — the next deployment picks them
up. After `vercel env add`/`rm`, push a commit (`git commit --allow-empty` on the target
branch is enough) or use the dashboard's Redeploy; until then the live build keeps the old
values. A variable a branch's code needs is usually added before that branch lands, so the
landing push is the redeploy.

## 5. GitHub — only when CI reads it

CI reads a variable only where `.github/workflows/ci.yml` names it, as
`${{ secrets.NAME }}` (a secret) or `${{ vars.NAME }}` (a readable value). A variable
that only the deployed app reads needs nothing here; one a CI job needs (the smoke build,
the database jobs) is added to the workflow's `env:` and set on the repository:

```bash
grep "^KEY=" .env.local | sed 's/^[^=]*=//' | tr -d '\n\r' | gh secret set KEY --repo School-of-Gaming/Sogverse
```

`gh variable set` instead for a non-secret value. Setting either needs a `gh` account
with admin rights on the repository.

**Why piped, as with Vercel:** a GitHub secret cannot be read back either, so a damaged
value shows only as a failing job.

## Verify

- `.env.local` line filled: the length check in step 2, in the main checkout and in any
  worktree.
- Vercel: `vercel env ls` lists the variable in each environment it was added to. A
  Sensitive value cannot be read back; the only after-the-fact check is a runtime
  diagnostic — a temporary admin-only GET route returning
  `{ length, firstThree, lastThree, lastCharCode }` per `process.env[KEY]`, compared
  against `.env.local`. Deploy it after any bulk env change, check Preview and
  Production, delete it after.
- GitHub: `gh secret list --repo School-of-Gaming/Sogverse` lists it; the job that reads
  it passes.

If an integration suddenly returns "Invalid API key" / "Unauthorized" right after an env
change, the first hypothesis is whitespace damage — not a key rotation, not permissions.
