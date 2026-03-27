# Gedu Guru FAQ Bot

Gedu Guru is an AI assistant for game educators (gedus), powered by Gemini and delivered via Discord slash commands.

## How It Works

1. A gedu types `/geduguru` or `/happinappi` in Discord with a question
2. Discord POSTs to `/api/discord/interactions` on our Vercel deployment
3. The route verifies the request signature, defers a response ("thinking..."), then uses `after()` to keep the function alive
4. `src/lib/gemini.ts` uploads the markdown docs from `src/data/gedu-docs/` to Gemini's File API (cached in memory per function instance) and sends the question with the system prompt
5. The answer (with the original question in bold) is PATCHed back to Discord

## Key Files

| File | Purpose |
|---|---|
| `src/app/api/discord/interactions/route.ts` | Discord interactions endpoint — signature verification, defer, follow-up |
| `src/lib/gemini.ts` | Gemini client — uploads docs, sends questions, returns answers |
| `src/data/gedu-docs/` | Markdown documents that Gedu Guru uses as knowledge base |
| `scripts/register-discord-command.ts` | One-time script to register slash commands with Discord |

## Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `DISCORD_APPLICATION_ID` | `.env.local` + Vercel | Discord app ID |
| `DISCORD_PUBLIC_KEY` | `.env.local` + Vercel | Used to verify incoming Discord requests |
| `DISCORD_BOT_TOKEN` | `.env.local` + Vercel | Used to PATCH follow-up responses back to Discord |
| `GEMINI_API_KEY` | `.env.local` + Vercel | Google AI Studio API key (pay-as-you-go billing) |

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
