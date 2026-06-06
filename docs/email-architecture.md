# Email Architecture

Brevo-powered transactional email system with code-owned HTML templates, role-based notifications, and an admin testing UI.

## Overview

All transactional emails are sent via the **Brevo API** (`src/lib/brevo.ts`). Supabase's built-in SMTP is configured with the same Brevo credentials for auth emails (signup confirmation, magic link). Templates are code-owned HTML with a shared dark-themed layout, built from TypeScript functions and rendered server-side. A template registry provides a single source of truth for all templates, powering both production sending and the admin testing page.

**Sender identity:** All emails are sent from `sogverse@sog.gg` (verified in Brevo). Three sender display names are translated per-locale via the `email` namespace keys `senderAuth`, `senderFeedback`, and `senderEnrollment` (e.g. English: "Sogverse Team", Finnish: "Sogverse-tiimi").

## Component Map

```
Brevo API wrapper
└── src/lib/brevo.ts              — sendTransactionalEmail() (single entry point for all sends)

Email templates (src/lib/email-templates/)
├── layout.ts                     — wrapInLayout(): branded dark-theme HTML shell (table-based, inline CSS)
├── utils.ts                      — escapeHtml(), paragraph(), heading(), styledName(), styledProductName()
├── registry.ts                   — templateRegistry: all template definitions (fields, Zod schemas, builders)
├── password-reset.ts             — buildPasswordResetEmail(resetLink)
├── gedu-invite.ts                — buildGeduInviteEmail(setupLink)
├── feedback.ts                   — buildFeedbackEmail(opts)
├── group-changes.ts              — Group management notifications (6 variants)
└── enrollment-changes.ts         — Enrollment/unenrollment notifications (4 variants)

Notification orchestrators
├── src/lib/enrollment-notifications.ts  — sendEnrollmentNotifications(), sendUnenrollmentNotifications()
└── src/app/api/admin/products/[id]/groups/apply/route.ts  — Group change notifications (inline)

API routes
├── /api/auth/forgot-password     — Sends password reset email via Brevo
├── /api/admin/create-gedu        — Sends gedu invite email via Brevo
├── /api/feedback                 — Sends feedback email to admins via Brevo
├── /api/enrollments              — Triggers enrollment notifications (POST)
├── /api/enrollments/[id]         — Triggers unenrollment notifications (DELETE)
├── /api/admin/products/[id]/groups/apply  — Triggers group change notifications (POST)
└── /api/admin/send-test-email    — Admin-only: send custom or template-based test emails

Testing UI
└── /admin/testing                — Email tool with template picker, param fields, and custom mode

Constants
├── SENDER_EMAIL                  — "sogverse@sog.gg" (src/lib/constants/index.ts)
└── Sender display names          — email namespace keys: senderAuth, senderFeedback, senderEnrollment (messages/*.json)
```

## Email Template System

### Shared layout

All templates use `wrapInLayout()` which produces a table-based HTML email with:
- Dark theme matching the app (`DARK_THEME` color constants)
- Hero gradient header with SOGverse logo
- Card container for content
- Copyright footer

**Gmail Android quirks** addressed in the layout's `<style>` block:
- Gradient is class-based because Gmail Android rewrites inline `linear-gradient()` into `url(linear-gradient(...))` which breaks it
- Brand text colors use `background-clip:text` via `u + .body` Gmail-only selector because Gmail Android dark mode shifts the `color` property but preserves gradients

### Template registry

`src/lib/email-templates/registry.ts` is the single source of truth for all templates. Each entry defines:
- `label` — display name for the testing UI dropdown
- `fields` — form fields rendered in the testing UI (text inputs or selects)
- `schema` — Zod schema for API-side param validation
- `build(params)` — returns the HTML email body
- `subject(params)` — returns the subject line
- `fromName` — sender display name
- `resolveParams?` — optional transform from UI field values to API params (e.g., Minecraft status → username + uuid)

### Template inventory

| Template Key | Label | Recipients | Triggered by |
|---|---|---|---|
| `passwordReset` | Password Reset | User | `POST /api/auth/forgot-password` |
| `geduInvite` | Gedu Invite | New gedu | `POST /api/admin/create-gedu` |
| `feedback` | Feedback | All admins | `POST /api/feedback` |
| `groupAdded` | Group Added (Gedu) | Gedu | Group commit (new group) |
| `groupDeleted` | Group Deleted (Gedu) | Gedu | Group commit (delete group) |
| `groupReassignedOldGedu` | Group Reassigned (Old Gedu) | Old gedu | Group commit (reassign) |
| `groupReassignedNewGedu` | Group Reassigned (New Gedu) | New gedu | Group commit (reassign) |
| `groupReassignedParent` | Group Reassigned (Parent) | Parent | Group commit (reassign, per enrolled gamer) |
| `gamerMovedParent` | Gamer Moved (Parent) | Parent | Group commit (move gamer) |
| `gamerMovedOldGedu` | Gamer Moved (Old Gedu) | Old gedu | Group commit (move gamer) |
| `gamerMovedNewGedu` | Gamer Moved (New Gedu) | New gedu | Group commit (move gamer) |
| `enrollmentParent` | Enrollment (Parent) | Parent (BCC admins) | `POST /api/enrollments` |
| `enrollmentGedu` | Enrollment (Gedu) | Gedu (CC admins) | `POST /api/enrollments` |
| `unenrollmentParent` | Unenrollment (Parent) | Parent (BCC admins) | `DELETE /api/enrollments/[id]` |
| `unenrollmentGedu` | Unenrollment (Gedu) | Gedu (CC admins) | `DELETE /api/enrollments/[id]` |

### CC/BCC conventions

- **Enrollment/unenrollment emails:** Parent emails BCC admins (hidden from parent). Gedu emails CC admins (visible as collaborators).
- **Group change emails:** Sent directly to affected gedus and parents, no CC/BCC.
- **Feedback emails:** Sent to all admin email addresses.

## Notification Data Flow

### Enrollment notifications (`src/lib/enrollment-notifications.ts`)

1. API route (`POST /api/enrollments` or `DELETE /api/enrollments/[id]`) completes the database operation
2. Calls `sendEnrollmentNotifications()` or `sendUnenrollmentNotifications()` with `{ customerId, gamerId, groupId }`
3. `fetchNotificationData()` queries profiles, group/product/gedu info, Minecraft account, and admin emails in parallel via the admin client
4. Sends parent and gedu emails via `Promise.allSettled()` — failures are logged but don't fail the API response

### Group change notifications (inline in `/api/admin/products/[id]/groups/apply`)

1. The apply route receives both `batch` (group mutations) and `notify` (notification payloads) from the client
2. After the `apply_group_changes` RPC succeeds, the route resolves gedu/gamer/parent profiles from the database
3. Sends emails for each change type (added, deleted, reassigned, moved) via `Promise.allSettled()`
4. Notification failures don't fail the commit

## Admin Testing Page

`/admin/testing` provides an email testing tool with two modes:

**Template mode:** Select any template from the registry dropdown. The UI renders dynamic form fields based on the template's `fields` definition. Unfilled fields fall back to their placeholder values. Sends via `POST /api/admin/send-test-email` with `mode: "template"`.

**Custom mode:** Freeform email with sender name, subject, plain-text body (auto-escaped and `\n` → `<br/>`), and optional reply-to. Sends via `POST /api/admin/send-test-email` with `mode: "custom"`.

Both modes:
- Default the "To" field to the logged-in admin's email
- Support comma-separated recipient lists
- Show success/error banners with Brevo message IDs

The API route (`/api/admin/send-test-email`) validates requests with Zod (discriminated union on `mode`), validates template params against the registry's schema, and sends via `sendTransactionalEmail()`.

## Supabase Auth Emails

Supabase handles signup confirmation and magic link emails using its built-in email system. The SMTP transport is configured in the Supabase dashboard to use Brevo's SMTP credentials (same sender `sogverse@sog.gg`), so all emails flow through Brevo regardless of whether they're sent by our code or by Supabase Auth.

**Password reset** is the exception — it bypasses Supabase's built-in template entirely. The custom `POST /api/auth/forgot-password` route generates a PKCE recovery code via the admin client and sends a branded email via the Brevo API using `buildPasswordResetEmail()`.

**Signup confirmation** and **magic link** still use Supabase's built-in plain HTML templates (edited in the Supabase dashboard). These are the templates that item "Migrate auth email templates to Brevo visual editor" (below) would replace.

## Email Deliverability & DNS

### Email sending services

All three email senders are fully authenticated and passing SPF, DKIM, and DMARC as of 2026-02-25.

| Service | Purpose | SPF | DKIM | DMARC |
|---|---|---|---|---|
| **Google Workspace** | Team email (MX) | `include:_spf.google.com` | `google._domainkey` | pass |
| **Brevo** | Transactional email (Supabase auth + Brevo API) | `include:sendinblue.com` | `brevo1._domainkey`, `brevo2._domainkey` | pass |
| **Klaviyo** | Marketing email (sends from `email.sog.gg` subdomain) | via delegated NS | `mtd1` selector on `email.sog.gg` | pass |

### Klaviyo DNS setup

Klaviyo uses a dedicated sending subdomain (`email.sog.gg`) with NS delegation to `ns1-4.klaviyo.com`. Klaviyo manages SPF, DKIM, and bounce handling dynamically through their nameservers. The zone appears empty in static DNS queries — this is normal.

### Current DNS records

**SPF (TXT on `sog.gg`):**
```
v=spf1 a mx ip4:135.181.12.10 ip6:2a01:4f9:fff1:e:0:0:0:10 include:relay.mailchannels.net include:_spf.google.com include:sendinblue.com ~all
```

**DKIM:**
| Selector | Value |
|---|---|
| `google._domainkey.sog.gg` | RSA public key (Google Workspace) |
| `brevo1._domainkey.sog.gg` | CNAME → `b1.sog-gg.dkim.brevo.com` |
| `brevo2._domainkey.sog.gg` | CNAME → `b2.sog-gg.dkim.brevo.com` |
| `mtd1._domainkey.email.sog.gg` | Managed by Klaviyo (via NS delegation) |

**DMARC (CNAME on `_dmarc.sog.gg`):**
```
_dmarc.sog.gg → _dmarc.sog_gg._d.easydmarc.pro
```
Resolves to `v=DMARC1; p=none; rua=mailto:...@rua.easydmarc.eu; ...`

### Unknown SPF entries

| Entry | Identified as | Status |
|---|---|---|
| `ip4:135.181.12.10` / `ip6:2a01:4f9:fff1:e:...` | Nordname hosting server (`andoria.nordname.net`) | Investigate — may be leftover |
| `include:relay.mailchannels.net` | MailChannels relay (used by hosting providers) | Investigate — may be leftover |

If `sog.gg` has no server-side email sending from the hosting provider, these are likely leftovers and can be removed to tighten SPF.

### Verification commands

```bash
nslookup -type=TXT sog.gg 8.8.8.8            # SPF
nslookup -type=TXT _dmarc.sog.gg 8.8.8.8     # DMARC
nslookup -type=CNAME brevo1._domainkey.sog.gg 8.8.8.8  # Brevo DKIM
nslookup -type=TXT google._domainkey.sog.gg 8.8.8.8    # Google DKIM
nslookup -type=NS email.sog.gg 8.8.8.8       # Klaviyo subdomain
```

## Environment Variables

| Variable | Side | Purpose |
|---|---|---|
| `BREVO_API_KEY` | Server | Brevo API authentication for `sendTransactionalEmail()` |

Supabase SMTP credentials (same Brevo account) are configured in the Supabase dashboard, not in `.env.local`.

## Tests

| Test file | Type | What it covers |
|---|---|---|
| `tests/unit/lib/brevo.test.ts` | Unit | `sendTransactionalEmail()` request formatting |
| `tests/unit/email-templates/group-changes.test.ts` | Unit | Group change template HTML output |
| `tests/unit/email-templates/enrollment-changes.test.ts` | Unit | Enrollment/unenrollment template HTML output |
| `tests/unit/enrollment-notifications.test.ts` | Unit | Notification orchestrator (data fetching, email sending, error handling) |
| `tests/integration/api/send-test-email.test.ts` | Integration | Admin test email API route (auth, validation, both modes) |
| `tests/integration/api/feedback.test.ts` | Integration | Feedback email sending |
| `tests/integration/auth/forgot-password.test.ts` | Integration | Password reset email flow |
| `tests/integration/api/create-gedu.test.ts` | Integration | Gedu invite email sending |
| `tests/integration/api/groups-apply.test.ts` | Integration | Group change notification sending |
| `tests/integration/api/enrollments.test.ts` | Integration | Enrollment notification sending |
| `tests/integration/api/enrollments-unenroll.test.ts` | Integration | Unenrollment notification sending |

## Future Improvements

### Enforce DMARC

DMARC is currently `p=none` — receiving servers don't act on authentication failures, so anyone can spoof `@sog.gg` emails. All three legitimate senders (Google, Brevo, Klaviyo) already pass authentication, so enforcement is safe to proceed with.

**Action plan:**

1. **Set up accessible DMARC reporting.** Replace the EasyDMARC CNAME in Nordname with a direct TXT record sending reports to an email we control (or use a free viewer like Postmark DMARC).
2. **Audit unknown SPF senders (1-2 weeks).** Monitor reports to determine whether Nordname (`135.181.12.10`) and MailChannels are actively sending as `@sog.gg`. Remove from SPF if inactive.
3. **Enforce gradually.** `p=quarantine; pct=10` → `pct=50` → full `p=quarantine` (1 week between stages).
4. **Harden SPF (optional).** After full DMARC enforcement, change `~all` (softfail) to `-all` (hardfail).

### Custom email verification (non-blocking)

Supabase's "Confirm email" setting is disabled to keep signup frictionless (users can register and pay immediately). This means `email_confirmed_at` on `auth.users` is auto-set to `NOW()` on signup — always populated and useless for tracking real verification. `supabase.auth.resend({ type: 'signup' })` also does nothing when confirmation is disabled.

**Why not Supabase's built-in confirmation?** It's binary — either it blocks sign-in until verified, or it auto-confirms and never sends a verification email. There is no "send verification but allow unverified sign-in" option ([GitHub Issue #5113](https://github.com/supabase/supabase/issues/5113)). `config.toml` must stay at `enable_confirmations = false`.

**Approach — custom token + Brevo API:**

1. Add `email_verified BOOLEAN DEFAULT false` column to `profiles` table
2. Add `email_verification_token TEXT` and `email_verification_expires_at TIMESTAMPTZ` columns (or encode everything in a signed JWT to avoid extra columns)
3. After signup, generate a secure token and send a verification email via Brevo (reuse existing `sendTransactionalEmail()`)
4. Create `/api/auth/verify-email?token=xxx` route that validates the token, sets `email_verified = true`, and redirects to a success page
5. Create `/api/auth/resend-verification` route that generates a new token and sends another email
6. Update Settings page (`/settings`) to show verified/unverified status next to email, with a "Resend" button for unverified users
7. Update admin user detail page (`/admin/users/[id]`) to show verification badge (skip for gamer role — synthetic emails)
8. Gate specific features behind `email_verified` via RLS policies or service-layer checks (TBD which features)

**UI removed (was non-functional):** The verification UI and its backing API routes were removed because `email_confirmed_at` is always set (useless) and `supabase.auth.resend()` is a no-op with confirmation disabled. When implementing this feature, re-add:
- Settings page (`src/app/(dashboard)/settings/page.tsx`) — verified/unverified badge next to email field, with "Resend verification" button for unverified users. Read `profile.email_verified` instead of `user.email_confirmed_at`.
- Admin user detail page (`src/app/(dashboard)/admin/users/[id]/page.tsx`) — verification badge next to email in user summary card. Read `profile.email_verified` directly (no separate API call needed).
- `src/app/api/auth/resend-verification/route.ts` — recreate using custom token + Brevo instead of `supabase.auth.resend()`.
- `src/app/api/admin/users/[id]/auth/route.ts` — recreate to return `profile.email_verified` if needed (or just query profiles directly from the admin page).

**Note:** Gamer accounts use synthetic emails (`{username}@gamer.sogverse.internal`) — skip verification for them entirely.

**Dependencies:** Database migration for new `profiles` columns.

### Use identicon avatars in email templates

The identicon generator (`src/lib/identicon.ts`) creates unique SVG avatars from user IDs. These could be embedded in email templates to make them more personal and visually recognizable — e.g., showing a gamer's identicon next to their name in enrollment/unenrollment emails, or in group change notifications.

- Investigate rendering identicons as inline SVG or data URIs for email client compatibility
- Add identicon next to gamer names in enrollment confirmation emails
- Add identicon next to gamer names in group change notification emails

**Caveat:** Email client SVG support is inconsistent (Gmail strips `<svg>` tags). May need to render identicons as PNG via a server-side route (e.g., `GET /api/identicon/[id].png`) and reference via `<img>` tag, or use inline `data:image/svg+xml` URIs.

### Migrate auth email templates to Brevo visual editor

Auth email templates (signup confirmation, magic link) are currently plain HTML in the Supabase dashboard. Moving them to Brevo would let non-technical team members design branded emails using Brevo's drag-and-drop visual editor with personalization variables.

- Create branded email templates in Brevo's visual editor (signup, magic link — password reset is already code-owned)
- Set up Supabase Auth Hooks or Edge Functions to send emails via Brevo's template API instead of Supabase's built-in templates
- Pass user data (name, email, confirmation URL) as template variables to Brevo

**Why:** Supabase's built-in templates are developer-edited HTML. Brevo's visual editor lets marketing/design team members own the email branding and content without code changes.
