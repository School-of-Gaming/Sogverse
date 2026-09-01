# Vercel environment variables

How to add or change env vars on Vercel without silently corrupting them. Both rules
below were paid for with a real outage-shaped incident.

## Never paste values into the Vercel UI — pipe via the CLI

```bash
grep "^KEY=" .env.local | sed 's/^[^=]*=//' | tr -d '\n\r' | vercel env add KEY <env> [--sensitive]
```

**Why:** on 2026-05-28 ~15 env vars were re-uploaded through the UI to flip them to
Sensitive and four ended up with garbage appended — two got a literal LF at the end,
two got the two-character text `\n` (backslash + n). The service-role-key damage
surfaced as a 400 "Invalid API key" from an admin route. The mixed corruption pattern
points at pasting from a place that displayed the value with a trailing newline; the UI
accepted both without warning.

Sensitive vars compound the risk: once stored they cannot be read back via dashboard,
CLI, or `vercel env pull`. The only after-the-fact check is a runtime diagnostic — a
temporary admin-only GET route returning `{ length, firstThree, lastThree,
lastCharCode }` per `process.env[KEY]`, compared against `.env.local`. Deploy it after
any bulk env change, verify every var on Preview AND Production, delete it after.

Two more traps:

- **Vercel does NOT auto-redeploy when env vars change** — the next deployment picks
  them up. After `vercel env rm`/`add`, push a commit (`git commit --allow-empty` on the
  target branch is enough) or use the dashboard's Redeploy. Until then the live build
  keeps the old values.
- If an integration suddenly returns "Invalid API key" / "Unauthorized" right after
  env-var changes, the first hypothesis is whitespace damage — not a key rotation, not
  permissions.

## `--sensitive`: Preview and Production yes, Development never

For a real secret (API keys, tokens, signing secrets, service-role keys — anything not
`NEXT_PUBLIC_*` or a pure identifier), use `vercel env add NAME ENV --sensitive`, value
piped via stdin. **Vercel rejects `--sensitive` when the target is `development`**
("You cannot set a Sensitive Environment Variable's target to development") — dev
values are designed to be pulled to local disk via `vercel env pull`, which is
incompatible with never-readable-back. For dev, add without the flag (the Encrypted
tier).

**Why:** the standard Encrypted tier leaves the value readable by anyone with project
access. Every non-public secret was flipped to Sensitive on 2026-05-28 to harden
against a future compromised Vercel account.

Migrating an existing var to sensitive without rotating it:
`vercel env pull .vercel/.env.X --environment=X --yes` → strip the surrounding quotes →
`vercel env rm NAME X --yes` → `printf '%s' "$value" | vercel env add NAME X
--sensitive` → delete the pulled file. Public vars (`NEXT_PUBLIC_*`) and identifiers
(`*_CLIENT_ID`, `*_TENANT_ID`, public verification keys) stay Encrypted — they are
meant to be readable.
