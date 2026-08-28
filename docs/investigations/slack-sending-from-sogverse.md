# Sending Slack messages from Sogverse

**Status: design sketch, not committed — nothing is built.** Extracted 2026-08-28 from
the Slack runbook (`../runbooks/slack-integration.md`), which covers the one Slack path
that *does* exist: purchase notifications via a Stripe Dashboard Workflow, with no
Sogverse code in the path. Building this sketch is **not** required for those. If this
is ever committed to, it becomes a `docs/plans/` plan and this file is deleted.

A design for the app posting to Slack itself — an admin composing a message from the
dashboard, or a server-side event notifying a channel.

It follows the same pattern as the existing
[WhatsApp](../../src/services/whatsapp/CLAUDE.md) and
[Discord](../../src/app/api/discord/CLAUDE.md) integrations — a lib helper holds the API
client, a server-side route holds the secret, and (optionally) a service + React Query hook
drives it from the UI. No new abstraction is needed.

The bot token never leaves the server. For UI-triggered sends the browser calls our own
admin-gated route, which calls the helper.

## How much you build depends on the trigger

| Trigger | What you build |
|---|---|
| **Server-side event** (notify a channel when X happens) | Just the lib helper + env var. Call it from where the event already lives, wrapped in `after()`. |
| **Admin action in the UI** | Lib helper + admin-only send route + service/hook + env var. |
| **Two-way (Slack calls back)** — slash commands, buttons | Add a signature-verified events route modeled on the Discord interactions route, plus `SLACK_SIGNING_SECRET`. Out of scope for simple sending. |

## Proposed files

| File | Purpose |
|---|---|
| `src/lib/slack.ts` | Slack Web API client — reads `SLACK_BOT_TOKEN`, exposes `sendSlackMessage(channel, text)` |
| `src/app/api/admin/slack/send/route.ts` | Admin-only send endpoint — `requireRole("admin")`, validate body, call the helper *(only for UI-triggered sends)* |
| `src/services/slack/slack.service.ts` | `fetch()` wrapper to the route above *(only for UI-triggered sends)* |
| `src/services/slack/slack.queries.ts` | React Query `useMutation` hook *(only for UI-triggered sends)* |

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `SLACK_BOT_TOKEN` | `.env.local` + Vercel | Bot User OAuth Token (`xoxb-…`); authorizes API calls |
| `SLACK_DEFAULT_CHANNEL` | `.env.local` + Vercel | Optional default channel ID (e.g. `C0XXXXXXX`) |

Add the token to Vercel with `vercel env add --sensitive` on Preview/Production (Vercel
rejects `--sensitive` on Development).

## Slack app setup

Done once at [api.slack.com/apps](https://api.slack.com/apps) — this is a **separate app**
from the Stripe Workflows for Slack app the runbook covers:

1. Create a Slack app for the workspace
2. Add the **Bot Token Scope** `chat:write` (add `chat:write.public` to post to public
   channels the bot hasn't been invited to)
3. Install the app to the workspace — this mints the `xoxb-` token. **Installation may
   require a workspace admin's approval** depending on the workspace's app-management
   settings.
4. Invite the bot to the target channel (`/invite @yourbot`), or use its channel ID

Creating the app and posting to a channel need no admin role — only the install step may be
gated by an admin approval.

## Implementation notes

- **Slack signals failure in the response body, not the HTTP status.** `chat.postMessage`
  returns HTTP 200 with `{ "ok": false, "error": "..." }` on logical failures (bad channel,
  missing scope). Check the body's `ok` flag, not the response status — this differs from
  WhatsApp/Daily, which use HTTP status codes.
- **Fire-and-forget on server-side events.** Wrap the send in `after()` so a Slack outage
  can't fail the user's request.
- **Audit trail (optional).** The WhatsApp integration logs every outbound message to its
  own table. Mirror that if you want a record of what Sogverse posted; skippable for
  fire-and-forget notifications.

## Reference sketch

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
