# Slack Integration

> **Status: proposed, not yet built.** This is a high-level design for sending messages
> from the web app to a Slack channel. It follows the same pattern as the existing
> [WhatsApp](whatsapp-automated-flow.md) and [Discord](discord-bot.md) integrations —
> a lib helper holds the API client, a server-side route holds the secret, and (optionally)
> a service + React Query hook drives it from the UI. No new abstraction is needed.

## Goal

Post a message to a Slack channel from Sogverse — e.g. notify an internal channel when
something happens in the app (a purchase, a sign-up), or let an admin send a message from
the dashboard.

## How It Works

1. A trigger fires — either a server-side event (e.g. inside a Stripe webhook handler) or an
   admin action in the UI
2. The code calls `sendSlackMessage(channel, text)` in `src/lib/slack.ts`
3. The helper POSTs to Slack's Web API (`chat.postMessage`) with the bot token from env
4. Slack posts the message to the channel and returns the message timestamp (`ts`)

The bot token never leaves the server. For UI-triggered sends, the browser calls our own
`/api/admin/slack/send` route (gated by `requireRole`), which calls the helper — the secret
stays server-side.

## Trigger Shapes

The trigger determines how much you build:

| Trigger | What you build |
|---|---|
| **Server-side event** (notify a channel when X happens) | Just the lib helper + env var. Call `sendSlackMessage()` from where the event already lives, wrapped in `after()` so a Slack hiccup never blocks the response. |
| **Admin action in the UI** | Lib helper + `/api/admin/slack/send` route + service/hook + env var. |
| **Two-way (Slack calls back)** — slash commands, buttons | Add a signature-verified events route modeled on `discord/interactions/route.ts`, plus `SLACK_SIGNING_SECRET`. Out of scope for simple sending. |

## Proposed Files

| File | Purpose |
|---|---|
| `src/lib/slack.ts` | Slack Web API client — reads `SLACK_BOT_TOKEN`, exposes `sendSlackMessage(channel, text)` |
| `src/app/api/admin/slack/send/route.ts` | Admin-only send endpoint — `requireRole("admin")`, validate body, call the helper *(only for UI-triggered sends)* |
| `src/services/slack/slack.service.ts` | `fetch()` wrapper to the route above *(only for UI-triggered sends)* |
| `src/services/slack/slack.queries.ts` | React Query `useMutation` hook *(only for UI-triggered sends)* |

## Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `SLACK_BOT_TOKEN` | `.env.local` + Vercel | Bot User OAuth Token (`xoxb-…`); authorizes API calls |
| `SLACK_DEFAULT_CHANNEL` | `.env.local` + Vercel | Optional default channel ID (e.g. `C0XXXXXXX`) |

Add the token to Vercel with `vercel env add --sensitive` on Preview/Production (Vercel
rejects `--sensitive` on Development).

## Slack Setup

Done once in the Slack admin UI ([api.slack.com/apps](https://api.slack.com/apps)):

1. Create a Slack app for the workspace
2. Add the **Bot Token Scope** `chat:write` (add `chat:write.public` to post to public channels
   the bot hasn't been invited to)
3. Install the app to the workspace — this mints the `xoxb-` token. **Installation may require a
   workspace admin's approval** depending on the workspace's app-management settings; you build
   the app yourself, but an admin may need to approve the install once.
4. Invite the bot to the target channel (`/invite @yourbot`), or use its channel ID

Creating the app and posting to a channel need no admin role — only the install step may be
gated by an admin approval.

## Implementation Notes

- **Slack signals failure in the body, not the HTTP status.** `chat.postMessage` returns
  HTTP 200 with `{ "ok": false, "error": "..." }` on logical failures (bad channel, missing
  scope). Check `data.ok`, not `res.ok` — this differs from WhatsApp/Daily, which use HTTP
  status codes.
- **Fire-and-forget on server-side events.** Wrap `sendSlackMessage()` in `after()` so a Slack
  outage can't fail the user's request.
- **Audit trail (optional).** The WhatsApp integration logs every outbound message to a
  `whatsapp_messages` table. Mirror it with a `slack_messages` table if you want a record of
  what Sogverse posted; skippable for fire-and-forget notifications.

## Reference Sketch

```typescript
// src/lib/slack.ts
const SLACK_API = "https://slack.com/api/chat.postMessage";

function getToken(): string {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("Missing SLACK_BOT_TOKEN environment variable");
  return token;
}

export async function sendSlackMessage(channel: string, text: string) {
  const res = await fetch(SLACK_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ channel, text }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error ?? "Unknown Slack API error");
  return { ts: data.ts as string };
}
```
