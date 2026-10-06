# Discord Bot

Slash-command webhook for the Sogverse Discord bot. Powers two AI assistants (Gedu Guru, Happinappi, via Gemini), Minecraft Education account password resets (via Microsoft Graph / Azure AD), the linking of a Gedu's or an admin's Discord account to their Sogverse account, and a linked Gedu asking for a substitute for a session they cannot make (`/sub`).

## Request Flow

1. User runs a slash command in Discord. Discord POSTs to `/api/discord/interactions` (this directory's `route.ts`).
2. The route verifies the Ed25519 signature against `DISCORD_PUBLIC_KEY` (rejects 401 on failure), then parses the payload.
3. `PING` interactions get an immediate `PONG`.
4. `APPLICATION_COMMAND` interactions return a **deferred** response immediately, then do the slow work in `after()` and PATCH the final answer back to `…/webhooks/{appId}/{token}/messages/@original` with `Authorization: Bot {DISCORD_BOT_TOKEN}`.

5. `MESSAGE_COMPONENT` (a press on a button or select) and `MODAL_SUBMIT` interactions are `/sub`'s later steps. A session pick is answered with a `MODAL` at once, since a modal can be neither deferred nor sent late. Anything that reads or writes finishes in `after()` by PATCHing the same `@original`, which for a component interaction is the message the control sits on. Its immediate answer is `UPDATE_MESSAGE` redrawing that message, from the payload's own copy, with every control greyed out, so a second tap cannot start a second run racing the first to `@original`; a payload with no usable message gets a plain `DEFERRED_UPDATE_MESSAGE`. A PATCH that never lands therefore leaves the message greyed out with no error line, and that is accepted *(owner, 2026-10-05)*: it is rare, and running `/sub` again recovers.

**Rule: Every command must return the deferred response synchronously and finish in `after()`.** Discord hard-times-out interactions at 3 seconds; cold starts plus Gemini/Graph calls blow past that. The handler returns `DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE` and the real reply lands later via PATCH. Never do the AI/Graph call inline before responding. The same holds for a control press that touches the database; the only synchronous answers are the ones that read nothing (`/sub`'s request modal and the admin preview's line). So the modal is built from what the press itself carries: the copy's locale from the select's `custom_id`, and the session's line from the picked option on the pressed message.

**Rule: Parse the Discord payload leniently.** Only validate the slice actually used (interaction type, token, the caller's Discord locale, command name, first option value, a control's `custom_id` and picked values, a modal's fields, the pressed message's components and flags, and the calling user's id and username). Unknown fields and new option value types Discord adds must not break the webhook — keep the schema permissive (`z.unknown()` for option values, `.optional()` liberally). Missing command/message/token falls back to a harmless `PONG`, not an error; a control press the route cannot place is acknowledged with `DEFERRED_UPDATE_MESSAGE` and nothing else.

## Commands

The first command option's value is the only argument read. Dispatch is by command name:

- `/geduguru` (`kysymys`) → `askGeduGuru` — answers from uploaded FAQ docs, in Finnish.
- `/happinappi` (`viesti`) → `askHappinappi`.
- `/reset-password` (`usernames`, space/comma separated) → Graph password reset, one result line per username.
- `/link` (no option) → a one-time URL that links the caller's Discord account to a Gedu's or an admin's Sogverse account. See Account Linking below.
- `/sub` (no option) → the "Can't make a session?" flow, entirely in Discord. See `/sub` below.

AI command answers are wrapped as `**{question}**\n\n{answer}`. On a Gemini error, a Finnish fallback message is sent (do not surface raw errors to users).

**Rule: Discord caps message content at 2000 chars — truncate before PATCHing** (slice to 1997 + `...`). The server remembers nothing between interactions: each command is standalone, and `/sub`'s steps carry what was picked in their controls' `custom_id`s.

## Account Linking

A Gedu or an admin links their Discord account so School of Gaming can reach them there and they can use the bot. The confirm page's copy names both generically, never a list of commands, so it does not go stale as the bot grows, and it warns to link only an account that is one's own. No sign-in changes, and the link opens no session. **It does carry one capability: a Discord account linked to a Gedu can file a substitution request as that Gedu through `/sub`, and nothing else.** The bot reaches the database only through functions granted to the service role alone, each of which resolves the Gedu from the Discord id in Discord's signed payload — the most recently linked Gedu account when there are several — and refuses an id with no Gedu linked. A Sogverse account has at most one link (a new one replaces it); one Discord account may be linked to several Sogverse accounts.

1. `/link` mints a random token and stores **only its SHA-256** with the service-role client, beside the caller's Discord id and username. The raw token exists only in the reply, so the table never holds anything usable.
2. The reply is **ephemeral** from the deferred response onward (the flag on the deferred response decides who sees the reply that replaces it) and carries the URL on a link button rather than in its text, so it is neither shown to the channel nor unfurled. The button opens `/link-discord?token=…` on a bare path, which the proxy sends on to the reader's locale with the query intact, and says the link lasts 10 minutes and works once. A failure sends a short English line, never the cause.
3. `/link-discord` is public to the proxy, because its login bounce keeps only the pathname and would drop the token; the page gates itself — signed out to login with the token kept on the redirect (the post-auth allowlist admits this page exactly), a parent or gamer refused with no button.
4. **A GET never spends the token.** The page only renders the question; the confirm button POSTs to `/api/discord/link`, so a preview bot or a mail scanner opening the URL leaves it good. Past its role gate, the page reads the token's Discord username with the service-role client (read-only) and names that account in the question, so a Gedu sent a link someone else minted sees it is not theirs before linking it; an unknown, used or expired token gets its dead-link card with no button.
5. The route calls `consume_discord_link_token` on the caller's own session, never the service role. The function is the boundary: it hashes the raw token itself, refuses every role but Gedu and admin, deletes the row so it works once, refuses an expired one, and replaces the caller's link. The route turns an unknown or used token and an expired one into two codes the page explains by sending the reader back to `/link`.

The command is unauthenticated on the Sogverse side — anyone in a server with the bot can run it — and that is safe because a token links nothing until a signed-in Gedu or admin spends it.

## `/sub` — asking for a substitute from Discord

The web's "Can't make a session?" picker and reason form, as one ephemeral Components V2 message that each step edits in place. The messages are built as data in `src/lib/discord-substitution-message.ts`, shared with the admin preview below — a new step joins the preview's set in the same change; the database half is `src/lib/discord-substitution.server.ts` (`src/services/session-substitution/CLAUDE.md` says why the wrappers exist and where a rule about filing belongs).

1. **Not linked** → `/link`'s own reply under one line saying a link is needed. Pressed on an older message instead, the line says to run `/link`: a components message cannot become a plain-text one.
2. **The session list** — one select holding the web picker's entries, soonest first, cut at Discord's 25 options: a session after the 25th is not reachable from Discord, and that is accepted (owner ruling). A session's day and time are written in the product's zone with its abbreviation (see below). No session → a line saying so, and nothing more.
3. **The request** — picking a session opens a pop-up holding everything left to say: the session, the web form's line on who sees a reason, the reason (a required select of the web form's two categories, nothing chosen to begin with) and the optional note (the web's field and length bound). A submission without a valid reason files nothing; dismissing the pop-up leaves the list to pick from again.
4. **The outcome** — submitting greys the list's controls out and files; the list's message then becomes the bot's own confirmation line (the web's points at a card the reader is not looking at), or the refusal line the web's failure mapper picks, with the way back to the list.

**The header carries the logo** — the favicon, as a thumbnail beside the brand line on every step — at this environment's own `NEXT_PUBLIC_SITE_URL`, which Discord has to fetch. Where it cannot (unset, malformed or loopback, by the mail logo's `sendableImageOrigin()` rule) the header goes without it rather than with a broken image, so a send from a dev machine shows no logo.

**Session times are in the product's zone, not the reader's — a sanctioned exception to the app's viewer-timezone rule (owner ruling, 2026-10-05).** Discord never tells a bot the reader's zone, Sogverse stores none for anyone, and Discord's own `<t:…>` timestamps, which do render in the reader's zone, cannot appear inside a select option and would show no zone name where they can. So the time is the product's own wall clock with its short zone name beside it: the one answer that is right, and visibly so, for every reader.

**The copy** is next-intl's, in the Gedu's own app locale, else the one nearest their Discord client's language, else the default. Lines the web already says are read from the web's own keys; only the bot's own lines live under `discordSub`.

**State lives in `custom_id`s, never in the server:** `sub:l` (show the list, the refusal's way back), `sub:s:<locale>` (the session select; the picked value is `<groupId>:<date>`, and the locale is the copy's, because the modal it opens is answered without a read), `sub:n:<groupId>:<date>` (the modal's submit; the reason and the note arrive as its fields). **A custom_id says what was picked, never who may act**: every step re-resolves the presser from the payload's Discord id, and the database re-derives the Gedu on every read and write.

## Test DMs from the admin testing page

The admin testing page has a Discord tool that DMs a chosen template to a linked account through `/api/admin/send-test-discord-message`, to prove the bot can reach someone: plain text, or **a `/sub` preview** in the locale the admin picks — every message the command can draw, sent as one set of DMs in the order a gedu meets them, from the command's own builders over sample sessions, with a fixed `preview` token in the not-linked answer's link so nothing is minted and the page shows its dead-link card. The set is built entirely by the sending server, so it is how a change to the messages' look is checked from a dev machine: a press on a sent message is answered by whichever deployment the Discord app's endpoint points at, never by the machine that sent it. Every control carries the `subpreview:` prefix, and a press on one answers an ephemeral "this is a preview" line and touches nothing. The request pop-up is the one step not in the set, since a modal cannot be DMed and only opens in answer to a press. It sends as **this environment's own bot** (`DISCORD_BOT_TOKEN`), so a send from local or staging comes from the staging app's bot, not prod's. The client names the recipient by Sogverse profile; the route reads the Discord id from that profile's link on the admin's own session. **A bot can only DM someone it shares a server with** (and who has not closed DMs from server members): anyone else gets Discord's 50007 "Cannot send messages to this user", which the tool shows verbatim rather than as a generic failure.

## Registering Commands

Commands are registered out-of-band, not in this route and not via the Discord UI:

```bash
npx tsx scripts/register-discord-command.ts                # the staging app
npx tsx scripts/register-discord-command.ts --production   # the prod app
```

This is a **bulk `PUT`** — the script's command list becomes the complete command set. Commands belong to an application, so a change is registered on each app separately: staging first, prod once the change has shipped there.

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

- `DISCORD_APPLICATION_ID`, `DISCORD_PUBLIC_KEY` (signature verification), `DISCORD_BOT_TOKEN` (PATCHing follow-ups). Staging and prod are **two separate Discord applications**: Vercel Preview and `.env.local` hold the staging app's values, Vercel Production holds the prod app's, and `.env.local` also keeps the prod set as `DISCORD_*_PRODUCTION` for the Production writes and for registering prod's commands. The local server never reads those.
- `GEMINI_API_KEY` — Google AI Studio key, pay-as-you-go (billed under the "Sogverse Gedu Assistant" project at aistudio.google.com/billing).
- `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` (the expiring secret above).

## Discord Portal Setup

Each app is set up the same way, pointed at its own deployment:

- General Information → Interactions Endpoint URL: `https://sogverse.sog.gg/api/discord/interactions` for prod, `https://sogverse-staging.sog.gg/api/discord/interactions` for staging. Discord verifies the URL on save with a request signed by that app's key, so the deployment must already hold the app's `DISCORD_PUBLIC_KEY` — set the env vars and redeploy first, then save the URL.
- Bot → Message Content Intent: enabled.
- Invite via OAuth2 URL with `bot` scope + `Send Messages` and `Read Message History` permissions.
