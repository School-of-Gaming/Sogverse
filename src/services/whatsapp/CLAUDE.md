# WhatsApp Integration

WhatsApp Business (Meta Cloud API) integration. Two halves: an **admin inbox** (what's built today — view conversations, reply by hand) and a **planned automated conversation flow** (mostly unbuilt — documented at the bottom so the data model and intent are not lost).

**Rule: Treat the automated flow (welcome buttons, AI assistant, `/gedu` lookup, substitution fan-out) as a design target, not current behavior.** None of it is wired up yet. The webhook persists inbound messages and an admin replies manually. Do not assume any auto-reply, routing, or `/human` handling exists — grep before claiming it does.

## Current Architecture

The pieces, by responsibility:

- **Graph API client** (`src/lib/whatsapp.ts`) — `sendWhatsAppMessage(to, payload)`. Posts to the Meta Graph API and returns `{ messageId }`. Supports three outbound shapes: `text`, `button` (interactive reply buttons), `list` (interactive list). Only `text` is used today; `button`/`list` exist for the planned flow. Throws on a non-OK Graph response.
- **Inbound webhook** (`src/app/api/webhooks/whatsapp/route.ts`) — `GET` answers Meta's verification challenge; `POST` receives inbound messages and delivery-status updates, persisting them. This is the only thing that creates contacts/messages from the customer side.
- **Admin send route** (`src/app/api/admin/whatsapp/send/route.ts`) — `admin`-only POST. Sends a text message via the Graph client, then records the outbound message + upserts the contact.
- **Read service** (this dir, `whatsapp.service.ts`) — `getContacts()` / `getMessages(phone)`. Read-only; follows the service-layer pattern (injected `AppSupabaseClient`, reads via `.from()`). All writes go through the two API routes above, never this class.
- **Query hooks** (`whatsapp.queries.ts`) — `useWhatsAppContacts`, `useWhatsAppMessages(phone)`, `useSendWhatsAppMessage`. `whatsappKeys` is the cache-key factory.
- **Contracts** (`whatsapp.contracts.ts`) — `sendWhatsAppResponse` (the `{ messageId }` shape of the send route).
- **Admin UI** (`src/app/(dashboard)/admin/whatsapp/page.tsx`) — the inbox screen.

### Data Model

Two tables, aliased in `src/types/index.ts`:

- `whatsapp_contacts` — one row per phone number (`phone` is the conflict key), with `wa_name` and `last_message_at`. Upserted by both the inbound webhook and the admin send route.
- `whatsapp_messages` — one row per message, keyed by Meta's `id`. Carries `direction` (`WHATSAPP_DIRECTION`: inbound/outbound), `status` (`WHATSAPP_MESSAGE_STATUS`: pending/sent/delivered/read/failed/received), `body`, `message_type`, `raw_payload` (full inbound JSON), `status_error`.

Use the `WHATSAPP_DIRECTION` / `WHATSAPP_MESSAGE_STATUS` const objects for these values — never bare string literals.

## Conventions & Gotchas

**Rule: The inbound webhook must never respond non-2xx for a payload it can't parse.** Meta disables endpoints that error persistently. The webhook acknowledges (`{ received: true }`, 200) even on an unexpected envelope, logging the shape mismatch instead of failing. Per-item parse failures are logged and skipped, not thrown. Keep payload schemas deliberately lenient: validate only the fields actually read, strip unknowns, and degrade optional sub-objects to `undefined` (`.catch(undefined)`) rather than failing the whole item. The full message is preserved in `raw_payload` regardless.

**Rule: Verify the inbound `POST` HMAC before parsing the body.** Meta signs requests with `X-Hub-Signature-256` (HMAC-SHA256 over the raw body, keyed by `WHATSAPP_APP_SECRET`). Compare with `crypto.timingSafeEqual`, reject mismatches with 401. Only because this check passed is it safe to `JSON.parse` the body without a try/catch — it is guaranteed to be the exact bytes Meta sent.

**Rule: Inbound persistence is upsert, not insert.** Meta retries deliveries on transient failures, so duplicate message IDs are expected — upsert on `id` (messages) and `phone` (contacts) to stay idempotent. The admin send route inserts (the `messageId` is fresh from the Graph response).

**Rule: After a successful outbound send, do not fail the request on a DB write error.** The message is already delivered to Meta by then; failing would mislead the admin. The send route records the message/contact best-effort and still returns `{ messageId }`. (A DB failure there is near-impossible — service role, no RLS, no token expiry.)

**Rule: Surface the 24-hour-window failure in plain language.** WhatsApp forbids business-initiated free-form replies more than 24h after the customer's last message. When a delivery status comes back `failed` with Meta error `131047` (or a title mentioning "re-engage"), store a support-friendly `status_error` explaining the customer must message first — not Meta's raw title.

**Rule: Don't add phone-number format validation on the send path.** `to` always comes from an existing `whatsapp_contacts` row created by the inbound webhook, so it is already a known-valid WhatsApp number.

**Status flow:** outbound starts `pending`, then delivery-status webhooks advance it `sent → delivered → read` (or `failed`). Inbound messages are stored as `received`. The webhook only applies status updates for IDs it already tracks.

## Configuration

Env vars (in `.env.local`): `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` (Graph API), `WHATSAPP_VERIFY_TOKEN` (challenge), `WHATSAPP_APP_SECRET` (HMAC). The Graph client pins an API version in its URL — bump deliberately.

## Planned Automated Flow (not yet built)

Design intent for the eventual bot. Captured so the data model and UX direction survive; **none of this runs today.**

- **Welcome.** New conversation → bilingual (FI/EN) welcome with language-select buttons. After selection, all messages are in the chosen language.
- **Public/parent path.** Greets with an AI assistant; `/human` at any point hands off to a live agent.
- **Gedu path (`/gedu`, unadvertised).** Language select → phone-number lookup against Gedu accounts. If not found, a "no account" message. If found, a menu: Help (a "Gedu Guru" AI) or Substitute request.
- **Substitution flow.** Gedu picks a reason (illness / personal / other) → schedule lookup → list-select the session needing cover → confirmation. Then fan-out: notify admins, and notify each eligible Gedu (in their preferred language) with accept/decline buttons. A Gedu who accepts → admin gets a "confirmed availability, select?" prompt. Admin selects one → that Gedu is notified + human takeover; others who confirmed are told the spot is filled.

When building any of this, lean on the existing `button`/`list` payload shapes in `src/lib/whatsapp.ts` and route decisions off the inbound webhook (interactive replies arrive as `button_reply` / `list_reply` with a `title`). Honor the i18n locale-vs-spoken-language and per-locale-translation rules from the root `CLAUDE.md`.
