# Discord Bot

The Sogverse Discord bot handles slash commands via a Next.js API route webhook. It powers AI assistants (Gedu Guru, Happinappi) and Minecraft Education account management (password reset).

## How It Works

1. A user types a slash command in Discord
2. Discord POSTs to `/api/discord/interactions` on our Vercel deployment
3. The route verifies the request signature and dispatches by command name
4. AI commands (`/geduguru`, `/happinappi`) defer a response, call Gemini via `after()`, and PATCH the answer back
5. `/reset-password` defers a response, calls Microsoft Graph API to reset the password, and PATCHes the result back

## Key Files

| File | Purpose |
|---|---|
| `src/app/api/discord/interactions/route.ts` | Discord interactions endpoint — signature verification, dispatch, follow-up |
| `src/lib/gemini.ts` | Gemini client — uploads docs, sends questions, returns answers |
| `src/lib/microsoft-graph.ts` | Microsoft Graph client — Azure AD authentication, password reset |
| `src/data/gedu-docs/` | Markdown documents that Gedu Guru uses as knowledge base |
| `scripts/register-discord-command.ts` | One-time script to register slash commands with Discord |

## Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `DISCORD_APPLICATION_ID` | `.env.local` + Vercel | Discord app ID |
| `DISCORD_PUBLIC_KEY` | `.env.local` + Vercel | Used to verify incoming Discord requests |
| `DISCORD_BOT_TOKEN` | `.env.local` + Vercel | Used to PATCH follow-up responses back to Discord |
| `GEMINI_API_KEY` | `.env.local` + Vercel | Google AI Studio API key (pay-as-you-go billing) |
| `AZURE_TENANT_ID` | `.env.local` + Vercel | Azure AD tenant for sog.gg |
| `AZURE_CLIENT_ID` | `.env.local` + Vercel | App registration "Sogverse Bot" client ID |
| `AZURE_CLIENT_SECRET` | `.env.local` + Vercel | App registration client secret (expires — check Azure portal) |

## Discord Setup

The bot is configured in the [Discord Developer Portal](https://discord.com/developers/applications):

- **General Information** > **Interactions Endpoint URL**: Set to `https://<your-domain>/api/discord/interactions`
- **Bot** > **Message Content Intent**: Enabled
- The bot must be invited to the server via an OAuth2 URL with `bot` scope and `Send Messages` + `Read Message History` permissions

## Slash Commands

Commands are registered via the registration script, not through the Discord UI:

```bash
npx tsx scripts/register-discord-command.ts
```

This uses a bulk `PUT` — whatever commands are in the script become the full list. Edit the script and re-run to update.

Current commands:
- `/geduguru` — "Kysy kysymys Gedu Gurulta" (takes a `kysymys` parameter)
- `/happinappi` — "Paina Happinappia ja saat happea!" (takes a `viesti` parameter)
- `/reset-password` — Reset a Minecraft Education account password (takes a `username` parameter)

## Password Reset (`/reset-password`)

Resets the password for shared Minecraft Education accounts managed in Azure AD (sog.gg tenant).

**How it works:**
1. User provides a username (e.g. `sog5461`)
2. The bot tries `username@gamer.sog.gg`, then `username@gedu.sog.gg` — only these two domains are allowed
3. On success, replies with the full email and new password (e.g. `Sogverse42`)
4. Passwords are `Sogverse` + 2-digit number (00–99)
5. `@gamer.sog.gg` accounts keep the password as-is; `@gedu.sog.gg` accounts must change it on first sign-in

**Azure setup:**
- App registration "Sogverse Bot" in the sog.gg tenant with `User.ReadWrite.All` application permission (admin-consented)
- The service principal also needs the **Password Administrator** directory role (assigned via `az rest` against the Graph roleManagement API since PIM blocks portal assignment without a P2 license)
- The client secret has an expiry — check **Certificates & secrets** in the app registration when it stops working

## Updating FAQ Documents

1. Replace or add markdown files in `src/data/gedu-docs/`
2. Commit and deploy
3. The first request after deploy will upload the new files to Gemini's File API

Gemini file uploads expire after 48 hours, but Vercel serverless functions recycle frequently enough that this isn't an issue in practice.

## System Prompt

The system prompt (in `src/lib/gemini.ts`) instructs Gedu Guru to:
- Answer primarily from the uploaded documents
- Use general knowledge for broader topics (tax, law, pedagogy) with a disclaimer to verify from official sources
- Always respond in Finnish
- Resist prompt injection attempts

## Known Limitations

- **No conversation memory** — each slash command is standalone with no context from previous questions
- **2000 character Discord limit** — long answers are truncated
- **No follow-up support** — would require Discord threads and a persistent bot process (not serverless)

## Billing

Gemini API usage is billed through Google AI Studio (pay-as-you-go, Tier 1). The billing account and project are managed at [aistudio.google.com/billing](https://aistudio.google.com/billing) under the "Sogverse Gedu Assistant" project.
