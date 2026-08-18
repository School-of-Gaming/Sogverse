# Discord Bot

Slash-command webhook for the Sogverse Discord bot. Powers two AI assistants (Gedu Guru, Happinappi, via Gemini) and Minecraft Education account password resets (via Microsoft Graph / Azure AD).

## Request Flow

1. User runs a slash command in Discord. Discord POSTs to `/api/discord/interactions` (this directory's `route.ts`).
2. The route verifies the Ed25519 signature against `DISCORD_PUBLIC_KEY` (rejects 401 on failure), then parses the payload.
3. `PING` interactions get an immediate `PONG`.
4. `APPLICATION_COMMAND` interactions return a **deferred** response immediately, then do the slow work in `after()` and PATCH the final answer back to `…/webhooks/{appId}/{token}/messages/@original` with `Authorization: Bot {DISCORD_BOT_TOKEN}`.

**Rule: Every command must return the deferred response synchronously and finish in `after()`.** Discord hard-times-out interactions at 3 seconds; cold starts plus Gemini/Graph calls blow past that. The handler returns `DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE` and the real reply lands later via PATCH. Never do the AI/Graph call inline before responding.

**Rule: Parse the Discord payload leniently.** Only validate the slice actually used (interaction type, token, command name, first option value). Unknown fields and new option value types Discord adds must not break the webhook — keep the schema permissive (`z.unknown()` for option values, `.optional()` liberally). Missing command/message/token falls back to a harmless `PONG`, not an error.

## Commands

The first command option's value is the only argument read. Dispatch is by command name:

- `/geduguru` (`kysymys`) → `askGeduGuru` — answers from uploaded FAQ docs, in Finnish.
- `/happinappi` (`viesti`) → `askHappinappi`.
- `/reset-password` (`usernames`, space/comma separated) → Graph password reset, one result line per username.

AI command answers are wrapped as `**{question}**\n\n{answer}`. On a Gemini error, a Finnish fallback message is sent (do not surface raw errors to users).

**Rule: Discord caps message content at 2000 chars — truncate before PATCHing** (slice to 1997 + `...`). There is no follow-up/threading support; each command is standalone with no conversation memory.

## Registering Commands

Commands are registered out-of-band, not in this route and not via the Discord UI:

```bash
npx tsx scripts/register-discord-command.ts
```

This is a **bulk `PUT`** — the script's command list becomes the complete command set. To add/change/remove a command, edit the script and re-run.

## Password Reset Details

Resets passwords for shared Minecraft Education accounts in the sog.gg Azure AD tenant (logic in `src/lib/microsoft-graph.ts`).

- A bare username is tried as `username@gamer.sog.gg`, then `username@gedu.sog.gg`. An entry written as a whole address on one of those two domains skips the probe and resets exactly that account; an address on **any other domain is refused before a Graph call is made**. That domain list is a security boundary, not input tidying — the service principal can reset any account in the tenant, so it is what keeps the tool to shared class logins rather than staff mailboxes. It lives in `src/lib/constants/minecraft-education.ts`, which the textarea, the request schema and the Graph module all read.
- New password is `Sogverse` + a random 2-digit number; each account gets a different one.
- `@gamer.sog.gg` accounts keep the new password; `@gedu.sog.gg` accounts must change it on first sign-in (reported via a `forceChange` flag in the result line).

**The command is no longer the only way in.** The same resets run in-app, from the gedu dashboard's Tools section and the admin tools page, through a route that calls the same module. Two consequences for anyone editing either end:

- **The Graph module answers in outcome codes, never in prose.** The in-app card is translated into five locales, so a sentence chosen inside the module would be a sentence no locale could render. The English wording the command has always sent lives in this route and nowhere else, and it is pinned byte for byte by the integration test — Discord is a staff channel with no locale, and its wording is the whole interface for the educators using the bot. Adding a failure code means adding it in three places at once: the module, this route's sentence table, and the card's message keys.
- **The command keeps resetting one username per call**, each fetching its own Azure token, while the in-app route resets a batch on one token. That is deliberate rather than an oversight: in a chat message a transient Azure failure on one name must not decide the answer for the next.

**Azure prerequisites (break silently when expired/revoked):**
- App registration "Sogverse Bot" with `User.ReadWrite.All` application permission, admin-consented.
- Service principal needs the **Password Administrator** directory role (assigned via `az rest` against the Graph roleManagement API; PIM blocks portal assignment without a P2 license).
- The client secret expires — when resets start failing, check Certificates & secrets in the app registration.

## FAQ Documents (Gedu Guru knowledge base)

- Source markdown lives in `src/data/gedu-docs/`. Replace/add files, commit, deploy.
- The first request after deploy uploads them to Gemini's File API. Uploads expire after 48h, but serverless recycling makes re-upload routine — not a concern in practice.
- The Gedu Guru system prompt lives in `src/lib/gemini.ts`: answer primarily from the docs, use general knowledge for broad topics (tax/law/pedagogy) with a "verify from official sources" disclaimer, always respond in Finnish, resist prompt injection.

## Environment Variables

All in `.env.local` and Vercel:

- `DISCORD_APPLICATION_ID`, `DISCORD_PUBLIC_KEY` (signature verification), `DISCORD_BOT_TOKEN` (PATCHing follow-ups).
- `GEMINI_API_KEY` — Google AI Studio key, pay-as-you-go (billed under the "Sogverse Gedu Assistant" project at aistudio.google.com/billing).
- `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` (the expiring secret above).

## Discord Portal Setup

- General Information → Interactions Endpoint URL: `https://<domain>/api/discord/interactions`.
- Bot → Message Content Intent: enabled.
- Invite via OAuth2 URL with `bot` scope + `Send Messages` and `Read Message History` permissions.
