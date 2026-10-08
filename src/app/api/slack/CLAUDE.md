# Slack app

The endpoint of Sogverse's own Slack app, which posts the substitution requests to the
admins' channel (`src/lib/substitution-notifications/`, which also holds the app's setup),
and the linking of an admin's Slack account to their Sogverse account.

## One route for the command and the buttons

`/api/slack/interactions` is both the slash command's URL and the interactivity URL. It
tells them apart by the form body — a `command` field is the command, a `payload` field an
interaction — and acknowledges anything it cannot place without acting on it.

- **Slack's signature is the whole gate.** The request carries no session; nothing is
  parsed before the HMAC over the raw body verifies, and a timestamp more than five minutes
  off is refused, signature or not, so a captured request cannot be replayed.
- **Every answer is an empty 200 within Slack's three seconds**, and the work runs after
  it, answering through the request's `response_url` — ephemeral, so only the person who
  acted sees it. A success needs no reply: the channel's message changing is the answer.
- **Any command name is the link command.** Staging's app calls it `/link-staging` and
  prod's `/link`, so both fit in one workspace, and the app has no other command.

## Accept acts as the linked admin

An Accept press approves the offer as the admin the presser's Slack account is linked to —
the most recently linked admin account, resolved in the database from the signed payload's
Slack user id — through the same approval body the web's dialog uses, then syncs the request
in-process. **An unlinked presser is answered link-first**: the reply carries a fresh link
button and nothing is approved. A refusal is read out as one of the web dialog's four
refusals, in English, naming nobody — the press carries only an offer id.

## Linking

Copied from Discord's linking (`src/app/api/discord/`), admins only. The command mints a
one-time token, stores only its SHA-256, and replies with a button to `/link-slack`, which
gates itself and spends nothing on render; its confirm POSTs to `/api/slack/link`, which
spends the token on the admin's own session. A token lasts ten minutes and works once. The
link carries one capability: a press on Accept acts as that admin.
