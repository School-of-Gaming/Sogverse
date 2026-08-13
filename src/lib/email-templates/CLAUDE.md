# Email templates

Code-owned, locale-aware HTML transactional emails. Builders here produce HTML strings; the actual send goes through the Brevo wrapper (`src/lib/brevo.ts`, `sendTransactionalEmail()` — the single entry point for every send in the app).

## Architecture

- **`layout.ts`** — `wrapInLayout({ title, content, locale, t })`: the branded dark-theme HTML shell every email uses. Table-based, inline CSS. `content` is your inner HTML.
- **`utils.ts`** — building blocks: `escapeHtml()`, `paragraph()`, `heading()`, `styledName()`, `styledProductName()`. Use these instead of hand-writing styled markup.
- **`translator.ts`** — `getEmailTranslator(locale)` returns an `EmailTranslator` (`t`) scoped to the `email` namespace in `messages/*.json`. Every builder takes `t` and `locale`; no user-facing string is hardcoded in a builder.
- **`registry.ts`** — `templateRegistry`: the single source of truth for templates that are exposed to the admin testing UI and the test-email API route. Each entry is built with `defineTemplate({...})`.
- **Per-template builder files** (`password-reset.ts`, `pin-reset.ts`, `feedback.ts`, `enrollment-changes.ts`) — exported `build*Email(t, locale, ...)` functions that compose `utils` helpers inside `wrapInLayout`.

## Sender identity

**Rule: every email sent from this codebase is from the same address and the same display name — `SENDER_EMAIL` and `SENDER_NAME` in `src/lib/constants`, with no per-template or per-route override.** The name is one literal, deliberately *not* translated: it is the company's mark, and a recipient who has learned to recognise it in an inbox list should keep recognising it whatever language the body is in. Locales translate the copy around a brand name, not the name — the same reasoning that keeps "My SOG" untranslated. A template that wants its own sender is a template arguing the reader should not be sure who wrote to them.

**"From this codebase" is a real limit, not a hedge** — but it is a narrow one. Stripe's receipts are the only mail a user receives that this repo does not render (see "Every email a user receives is ours" below), and Stripe's sender identity is dashboard configuration. Keeping it on the same name is a hand-done ops step and the one half of the invariant a grep will never verify.

**Rule: Reply-To is set explicitly on every product send, and the default is the support inbox (`SUPPORT_EMAIL`).** Omitting it silently points replies at the sending address, which nobody reads — a family replying to ask for help would be writing into a void. The one exception is a mail we send *to ourselves* about a person: there the reply-to is that person, because replying is how a staff member answers them. State which of the two a send is, in a comment, at the call site. The admin harness's free-form mode is the sole send that may carry no Reply-To at all: it is a manual test tool for checking that the sending path works, never a way to write to a customer, so the admin composing the message picks its reply behaviour.

## Conventions

**Rule: Builders return HTML strings only — they never send.** A builder takes `(t, locale, params)`, composes `content`, and returns `wrapInLayout(...)`. Sending is the caller's job (an API route) via `sendTransactionalEmail()`. Keep network and DB access out of this directory.

**Rule: All user-facing copy comes from `t(...)`, never string literals.** Add the key to *every* file in `messages/` (see the root CLAUDE.md i18n rules — best-effort translation for all locales, fun takes for `tlh`, no emoji). Compose translated copy with helpers, e.g. `t("x.body", { gamerName: styledName(name) })`.

**Rule: Escape every value that originates from user/DB data before putting it in HTML.** Use `escapeHtml()` (or a helper that escapes internally — `styledName`/`styledProductName` already do). The one safe exception is app-generated URLs (reset/setup links): they are embedded unescaped in `href` by design, and the code comments say so. Do not extend that exception to anything a user can influence.

**Rule: Colors come from the shared constants, not Tailwind/hex literals.** Email HTML can't use semantic Tailwind classes, so import `BRAND` / `DARK_THEME` / `GRADIENT` / `STATUS` from `@/lib/constants/colors` and interpolate them into inline styles. This is the email-context equivalent of the repo-wide "no hardcoded colors" rule.

## Registry pattern (`defineTemplate`)

When a template should be testable from `/admin/testing` and sendable via the test-email route, add it to `templateRegistry` with `defineTemplate({ label, fields, schema, build, subject, replyTo?, resolveParams? })`:

- `schema` — a zod schema whose **output type is the params type** passed to `build`/`subject`. This is what gives `build`/`subject` fully-typed params with no casts; `defineTemplate` parses raw params through `schema` inside the generated `render`, so a malformed payload throws a `ZodError` at the boundary. Derive enum fields from `Constants.public.Enums.*` so they track codegen.
- `fields` — drives the testing-UI form (text inputs or `type: "select"`). Unfilled fields fall back to placeholders.
- `resolveParams?` — optional transform from raw UI field values to API params (e.g. a single "Minecraft status" select expands into `minecraftUsername` + `minecraftUuid`).
- `replyTo?` — a function of the validated params, for the rare template whose live route replies to a person rather than to support. Omit it and the render defaults to `SUPPORT_EMAIL`. It exists so a test send reproduces the real mail's reply behaviour; a template that lies about this teaches the wrong thing to whoever is testing it.

Templates that are *not* exposed to the testing UI (currently the PIN-reset email) just export a builder and are sent directly from their API route — they don't need a registry entry.

## Layout gotchas (Gmail Android)

`layout.ts` carries two non-obvious workarounds. Preserve them when editing the shell:

- **Hero gradient is applied via a CSS class (`.hero-gradient`), not an inline `linear-gradient()`.** Gmail Android rewrites inline `linear-gradient()` into `url(linear-gradient(...))`, which breaks it. The class is set on both `<body>` and the outer `<table>` because Gmail strips `<body>` styles.
- **Brand-colored text uses a Gmail-only `background-clip:text` rule** behind the `u + .body` selector (which matches only Gmail's render wrapper). Gmail Android dark mode shifts the CSS `color` property but preserves gradient/background values, so brand text is recolored via a flat gradient + `background-clip:text` for Gmail and via plain inline `color` everywhere else. `styledName`/`styledProductName` emit the matching `brand-primary`/`brand-secondary` classes — keep the class names in sync between `utils.ts` and the `<style>` block.

The `<meta color-scheme: dark>` tags tell clients the email is already dark-themed so they skip their own dark-mode color adjustment.

## Every email a user receives is ours

**Supabase Auth sends no mail.** Confirmations are off, accounts are created with `email_confirm` set, and password reset takes only the `token_hash` from `generateLink` and renders our own builder — so nothing reaches a user through Supabase's dashboard-edited templates. Magic links and email verification are Sogverse's to build and send, not Supabase's to template. Treat "configure it in the Supabase dashboard" as the wrong answer to any email question, and add a builder here instead.

Stripe is the one genuine exception: receipts, invoices and dunning notices are composed and sent by Stripe, and their sender identity is dashboard configuration this repo cannot reach.

## Tests

Builder output is covered by unit tests under `tests/unit/email-templates/`; the Brevo wrapper and the routes that send (test-email, feedback, forgot-password, PIN forgot) are covered under `tests/unit/lib/` and `tests/integration/`. When you add a template or change builder output, update the matching unit test; when you add a registry entry reachable from the test-email route, the send-test-email integration test exercises validation for both modes.
