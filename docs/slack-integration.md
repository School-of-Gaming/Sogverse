# Slack Integration

Two separate things live under this heading, and only the first exists:

1. **Purchase notifications to the internal staff channel** — live, and **no Sogverse code
   runs in the path**. A Stripe Dashboard Workflow reads Checkout Session metadata and the
   Stripe app for Slack posts the message. Sogverse's only contribution is writing the
   metadata when it creates the session.
2. **Sogverse sending a Slack message itself** (an admin composing one from the dashboard,
   an app event notifying a channel) — **not built.** A design sketch is at the bottom.

If you are here because purchase notifications need changing, everything you want is in
part 1 and most of it is in the Stripe Dashboard, not in this repo. Do not build the
app-side helper to get them.

---

## 1. Purchase notifications — Stripe Workflow → Slack

### Shape of the mechanism

- A **Stripe Dashboard Workflow** triggers on a Stripe event, optionally retrieves related
  Stripe objects, and posts a templated message through the first-party **Stripe Workflows
  for Slack** app.
- Stripe owns the message. There is no route, no bot token, and no Slack secret anywhere in
  Sogverse for this path.
- **Sogverse's half of the contract is metadata on the Checkout Session** — everything the
  message says that Stripe does not already know comes from there.

### One-time setup

1. Install **Stripe Workflows for Slack** from the Stripe App Marketplace.
2. Connect the Slack workspace in the app's settings.
3. `/invite @Stripe` into the target channel — the app only lists channels it is a member
   of, so the workflow's Slack action cannot see the channel until this is done. The action
   then picks it from a dropdown.

**The workflow that posts to the staff channel is live-mode only.** A test-mode copy pointed
at the same channel would post every staging and local development checkout to it.

To iterate on a workflow, build a test-mode or sandbox copy pointed at a **scratch channel**,
and repoint to the staff channel only once the message reads correctly. Two ways to feed it:

- `stripe trigger checkout.session.completed` with `--add
  checkout_session:metadata[key]=value` for each key — fast, no deploy, and the right loop for
  wording and for settling the unverified mechanics below. A synthetic fixture does not fill
  `customer_details`, so name and email render empty here.
- A real test-mode checkout against a running build — slower, and the only test that proves the
  metadata keys the code actually writes match the names the template reads.

Account limits: 50 active workflows, 50 total. Workflows have drafts, versioning, and
per-run observability in the Dashboard — a failed run is diagnosable there.

### Why there is no raw Stripe → Slack webhook

- Stripe delivers raw event JSON; a Slack **incoming webhook** accepts only a
  `{"text": …}` / Block Kit body and rejects anything else. Pointing a Stripe webhook
  endpoint at a `hooks.slack.com` URL therefore cannot produce a readable message — nothing
  sits in between to reshape the payload.
- Formatting requires something that owns the payload: a Stripe Workflow (no code) or one of
  our own routes (code). We chose the workflow.
- **An incoming-webhook URL is a bearer secret** — anyone holding it can post to the
  channel. Never commit one, and never paste one into a doc, a test, or a comment.

### Trigger

- **Use `checkout.session.completed`.** It fires once money has moved, and it covers both
  subscription purchases (clubs) and one-off purchases (camps, events).
- **Do not use `customer.subscription.created`.** It fires before payment is confirmed, and
  one-off purchases create no subscription at all, so they would never appear.
- **Filter to Sogverse with a trigger condition requiring `metadata.productId` to be
  present.** The Stripe account also carries subscriptions from a legacy billing migration,
  hand-created subscriptions, and an older storefront; an account-level trigger fires for
  all of them. That metadata key is what marks a purchase as ours.

### What a Stripe event payload can and cannot tell you

This is the part most likely to be re-learned the hard way.

- **Event payloads carry ids, not names, and never expand references.** A Checkout Session
  gives you `cus_…` and (for subscriptions) `sub_…` — no customer name, no product name.
- **`line_items` is absent from a Checkout Session payload.** There is consequently no
  Stripe product id anywhere in the event and no way to build a Stripe product link
  directly from it. A workflow can reach one indirectly by retrieving the subscription
  (clubs) or the invoice (one-off purchases) and reading the price's product.
- **`customer_details.name` and `customer_details.email` *are* on the session** — Checkout
  collects them for Stripe Tax — so a customer name and email need no retrieve step.
- Anything a message says must therefore be one of three things: a field on the trigger
  object, something reachable via a `Retrieve a …` workflow step, or a value written into
  metadata at creation time.

### The metadata contract

The Checkout Session's metadata is the interface between Sogverse and the workflow. Some
keys are load-bearing for our own code — the products webhook and the paid-confirmation page
read `purchaseShape`, `customerId`, `participantId`, `productId` and `currency` by name.

These five exist **only** for the Slack workflow and have **no reader in this repo, by
design**:

| Key | Contents |
|---|---|
| `productName` | The product's name, resolved at the **default locale** |
| `productType` | Labels the message; can also drive trigger conditions |
| `adminProductUrl` | Complete absolute URL to the product in the admin dashboard |
| `adminUserUrl` | Complete absolute URL to the purchasing customer in the admin dashboard |
| `shopProductUrl` | Complete absolute URL to the product's public shop page |

**`productName` is at the default locale, never the buyer's** — the staff channel needs one
stable heading per product, and the buyer's locale would file the same club under different
names depending on who bought it. (The customer-facing subscription `description` is the
opposite case and stays in the buyer's locale.)

**Sogverse hands Stripe the finished link, not the ingredients.** A workflow message
template substitutes variables but cannot map a value onto a URL shape, so sending a product
*type* would mean re-implementing our admin-URL mapping by hand in the Dashboard, outside
the repo, where nothing can check it. The routing helper that maps a product type to its
admin URL is an exhaustive switch — a new product type fails to compile until the mapping is
extended — and preserving that tripwire is the whole reason the URL is built here.

**Absolute URLs in metadata derive their origin from `getOrigin(request)`,** never from the
raw `Host` header — the same rule that governs emailed links. Staff click these links, so a
spoofed origin is a phishing vector aimed at our own team.

**Accepted trade: these URLs freeze at purchase time.** Restructuring admin routes later
leaves the code correct while links in already-posted messages go stale. Acceptable because
such a message is read within minutes of the purchase.

### Message template mechanics

- Slack mrkdwn is supported: `*bold*`, `_italic_`, `~strike~`, inline and fenced code, block
  quotes, `:emoji:`, and lists. Line breaks are preserved.
- Hyperlinks are `<url|display text>`. Mentions use Slack ids, not display names.
- **`Include dashboard link` gives exactly one native Stripe deep link**, keyed to a single
  object id. Any further Stripe links must be written into the template by hand.

Two mechanics are **unverified** — confirm them in a sandbox before relying on either:

- whether a variable interpolates *inside* a URL string;
- the exact variable path the Dashboard's picker uses for metadata keys.

### Operational cautions

- **A duplicate payment posts an ordinary-looking success message.** When a family completes
  two checkouts for the same seat, our webhook cancels the duplicate subscription and
  records it for a manual refund — but the workflow triggers on session completion and posts
  a normal purchase message for it. Staff see two indistinguishable messages for one
  product.
- **The amount is what that session collected, not the product's price.** A club whose first
  charge is deferred to its start date collects nothing today, and a full-discount promotion
  code does the same — both render as a zero amount. A partial promotion or a proration
  shows a reduced figure rather than the list price.

### Metadata visibility

- **Metadata is never shown to customers** — absent from Checkout, receipts, invoices and
  the billing portal. It *is* visible to anyone with Stripe Dashboard access, and now to
  everyone in the Slack channel.
- The customer-visible sibling field is the object's `description`, which parents do read in
  the hosted billing portal.
- Put nothing sensitive in either.

---

## 2. Sending Slack messages from Sogverse — not built

> **Status: proposed.** A design for the app posting to Slack itself — an admin composing a
> message from the dashboard, or a server-side event notifying a channel. It is **not** how
> purchase notifications work (see part 1) and building it is not required for them.

It follows the same pattern as the existing
[WhatsApp](../src/services/whatsapp/CLAUDE.md) and
[Discord](../src/app/api/discord/CLAUDE.md) integrations — a lib helper holds the API
client, a server-side route holds the secret, and (optionally) a service + React Query hook
drives it from the UI. No new abstraction is needed.

The bot token never leaves the server. For UI-triggered sends the browser calls our own
admin-gated route, which calls the helper.

### How much you build depends on the trigger

| Trigger | What you build |
|---|---|
| **Server-side event** (notify a channel when X happens) | Just the lib helper + env var. Call it from where the event already lives, wrapped in `after()`. |
| **Admin action in the UI** | Lib helper + admin-only send route + service/hook + env var. |
| **Two-way (Slack calls back)** — slash commands, buttons | Add a signature-verified events route modeled on the Discord interactions route, plus `SLACK_SIGNING_SECRET`. Out of scope for simple sending. |

### Proposed files

| File | Purpose |
|---|---|
| `src/lib/slack.ts` | Slack Web API client — reads `SLACK_BOT_TOKEN`, exposes `sendSlackMessage(channel, text)` |
| `src/app/api/admin/slack/send/route.ts` | Admin-only send endpoint — `requireRole("admin")`, validate body, call the helper *(only for UI-triggered sends)* |
| `src/services/slack/slack.service.ts` | `fetch()` wrapper to the route above *(only for UI-triggered sends)* |
| `src/services/slack/slack.queries.ts` | React Query `useMutation` hook *(only for UI-triggered sends)* |

### Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `SLACK_BOT_TOKEN` | `.env.local` + Vercel | Bot User OAuth Token (`xoxb-…`); authorizes API calls |
| `SLACK_DEFAULT_CHANNEL` | `.env.local` + Vercel | Optional default channel ID (e.g. `C0XXXXXXX`) |

Add the token to Vercel with `vercel env add --sensitive` on Preview/Production (Vercel
rejects `--sensitive` on Development).

### Slack app setup

Done once at [api.slack.com/apps](https://api.slack.com/apps) — this is a **separate app**
from the Stripe Workflows for Slack app in part 1:

1. Create a Slack app for the workspace
2. Add the **Bot Token Scope** `chat:write` (add `chat:write.public` to post to public
   channels the bot hasn't been invited to)
3. Install the app to the workspace — this mints the `xoxb-` token. **Installation may
   require a workspace admin's approval** depending on the workspace's app-management
   settings.
4. Invite the bot to the target channel (`/invite @yourbot`), or use its channel ID

Creating the app and posting to a channel need no admin role — only the install step may be
gated by an admin approval.

### Implementation notes

- **Slack signals failure in the response body, not the HTTP status.** `chat.postMessage`
  returns HTTP 200 with `{ "ok": false, "error": "..." }` on logical failures (bad channel,
  missing scope). Check the body's `ok` flag, not the response status — this differs from
  WhatsApp/Daily, which use HTTP status codes.
- **Fire-and-forget on server-side events.** Wrap the send in `after()` so a Slack outage
  can't fail the user's request.
- **Audit trail (optional).** The WhatsApp integration logs every outbound message to its
  own table. Mirror that if you want a record of what Sogverse posted; skippable for
  fire-and-forget notifications.

### Reference sketch

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
