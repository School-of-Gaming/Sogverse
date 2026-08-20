# Email templates

Code-owned, locale-aware HTML transactional emails. Builders here produce HTML strings; the actual send goes through the Brevo wrapper (`src/lib/brevo.ts`, `sendTransactionalEmail()` — the single entry point for every send in the app).

## Architecture

- **`layout.ts`** — `wrapInLayout({ title, content, locale, t })`: the branded dark-theme HTML shell every email uses. Table-based, inline CSS. `content` is your inner HTML.
- **`utils.ts`** — building blocks every template uses: `escapeHtml()`, `paragraph()`, `heading()`, `styledName()`, `styledProductName()`. Use these instead of hand-writing styled markup.
- **`blocks.ts`** — the blocks only a mail that sends the reader somewhere needs: `ctaButton()` (primary/secondary), `ctaButtonRow()` (two secondaries side by side in a fixed 50/50 split, compact padding so both fit a mobile-width cell), `inlineLink()`, `bulletList()`, `sectionLabel()`. Every `href` they take is embedded unescaped, so they take app-generated URLs and nothing else. A mail with two buttons has one action it is actually asking for — that one is primary, the other outlined.
- **`markdown.ts`** — `renderMarkdownForEmail(markdown)`: stored markdown (a gedu's session report) to an inline-styled HTML fragment. It parses with the same parser the in-app `Markdown` component uses and emits exactly that component's `feed` subset — paragraphs, three heading levels, bold, italic, lists, line breaks — with everything else unwrapped to its text; a unit test holds the two element lists equal. Links render as their label only (the no-links rule for staff-authored, family-read copy is the field's, not the surface's), every text node is escaped, and it is a string walker rather than a React render because the registry it sits behind is imported by a client page.
- **`fixtures/`** — sample data the testing UI feeds a template that has no live route yet (today: two invented session reports, one written in English and one in Finnish, that between them use every control the gedu editor offers). Invented on purpose — real reports name real children — and fixture, not copy: never shown outside `/admin/testing`, never translated.
- **`translator.ts`** — `getEmailTranslator(locale)` returns an `EmailTranslator` (`t`) scoped to the `email` namespace in `messages/*.json`. Every builder takes `t` and `locale`; no user-facing string is hardcoded in a builder.
- **`registry.ts`** — `templateRegistry`: the single source of truth for templates that are exposed to the admin testing UI and the test-email API route. Each entry is built with `defineTemplate({...})`.
- **Per-template builder files** (`password-reset.ts`, `pin-reset.ts`, `feedback.ts`, `welcome.ts`, `product-confirmation.ts`, `verify-email.ts`, `session-report.ts`) — exported `build*Email(t, locale, ...)` functions that compose the `utils`/`blocks` helpers inside `wrapInLayout`.

## Sender identity

**Rule: every email sent from this codebase is from the same address and the same display name — `SENDER_EMAIL` and `SENDER_NAME` in `src/lib/constants`, with no per-template or per-route override.** The name is one literal, deliberately *not* translated: it is the company's mark, and a recipient who has learned to recognise it in an inbox list should keep recognising it whatever language the body is in. Locales translate the copy around a brand name, not the name — the same reasoning that keeps "My SOG" untranslated. A template that wants its own sender is a template arguing the reader should not be sure who wrote to them.

**The sender is the brand alone; the `School of Gaming – Sogverse` lockup lives in the layout's header instead.** An inbox list truncates the sender column hard, and a half-eaten lockup reads worse than the short name that always fits — while the header has the full width of the card and is the first thing inside the mail, so it is where both names get stated. Changing either half means changing the other's justification too: they are one decision about where each name earns its space, not two strings that happen to differ.

**The lockup is `BRAND_LOCKUP` in `src/lib/constants`, and the header is the one place that does not emit it whole.** The two names are set in two colours, so the header builds itself from `SENDER_NAME` and `BRAND_LOCKUP_TAIL` — every character of the lockup, the en dash above all, still comes from the constants module, and a unit test asserts the two spans read as `BRAND_LOCKUP` exactly. Do not type either name, or the separator, into this directory's markup.

**"From this codebase" is a real limit, not a hedge** — but it is a narrow one. Stripe's receipts are the only mail a user receives that this repo does not render (see "Every email a user receives is ours" below), and Stripe's sender identity is dashboard configuration. Keeping it on the same name is a hand-done ops step and the one half of the invariant a grep will never verify.

**Rule: Reply-To is set explicitly on every product send, and the default is the support inbox (`SUPPORT_EMAIL`).** Omitting it silently points replies at the sending address, which nobody reads — a family replying to ask for help would be writing into a void. The one exception is a mail we send *to ourselves* about a person: there the reply-to is that person, because replying is how a staff member answers them. State which of the two a send is, in a comment, at the call site. The admin harness's free-form mode is the sole send that may carry no Reply-To at all: it is a manual test tool for checking that the sending path works, never a way to write to a customer, so the admin composing the message picks its reply behaviour.

## A send that fails must not fail the thing it confirms

**Rule: every product send is wrapped, logged and swallowed at its call site.** These
mails follow something that already happened — an account created, a seat activated, a
place in a queue taken — and by the time the send runs, that outcome is committed. A
Brevo outage is therefore never a reason to answer the caller with an error, unwind a
purchase, or hand a payment webhook a 5xx it will retry forever. The one shape that is
different is a mail the user explicitly *asked* for (the resend button in settings):
there the send is the outcome, so its failure is the answer.

**Corollary: a send that must happen exactly once needs a signal that a replay can be
told apart by**, and the signal has to come from whatever committed the outcome — not
from the presence of the row, which a replay also sees. The paid-signup confirmation
keys on the participation RPC reporting whether it *inserted* the row or recognised one
its own Checkout Session had already bought.

## Conventions

**Rule: Builders return HTML strings only — they never send.** A builder takes `(t, locale, params)`, composes `content`, and returns `wrapInLayout(...)`. Sending is the caller's job (an API route) via `sendTransactionalEmail()`. Keep network and DB access out of this directory.

**Rule: a value that needs locale-aware formatting arrives already formatted.** A price, a date, a duration — the caller has the currency config, the product row and the viewer's zone; the builder has a translator and a string template. Passing the formatted string in keeps the builder a pure composer and keeps one formatting rule per value instead of two.

**Rule: All user-facing copy comes from `t(...)`, never string literals.** Add the key to *every* file in `messages/` (see the root CLAUDE.md i18n rules — best-effort translation for all locales, fun takes for `tlh`, no emoji). Compose translated copy with helpers, e.g. `t("x.body", { gamerName: styledName(name) })`.

**Rule: Escape every value that originates from user/DB data before putting it in HTML.** Use `escapeHtml()` (or a helper that escapes internally — `styledName`/`styledProductName` already do). The one safe exception is app-generated URLs (reset/setup links): they are embedded unescaped in `href` by design, and the code comments say so. Do not extend that exception to anything a user can influence.

**Rule: Colors come from the shared constants, not Tailwind/hex literals.** Email HTML can't use semantic Tailwind classes, so import `BRAND` / `DARK_THEME` / `GRADIENT` from `@/lib/constants/colors` and interpolate them into inline styles. This is the email-context equivalent of the repo-wide "no hardcoded colors" rule.

## Registry pattern (`defineTemplate`)

When a template should be testable from `/admin/testing` and sendable via the test-email route, add it to `templateRegistry` with `defineTemplate({ label, fields, schema, build, subject, replyTo?, resolveParams? })`:

- `schema` — a zod schema whose **output type is the params type** passed to `build`/`subject`. This is what gives `build`/`subject` fully-typed params with no casts; `defineTemplate` parses raw params through `schema` inside the generated `render`, so a malformed payload throws a `ZodError` at the boundary. Derive enum fields from `Constants.public.Enums.*` so they track codegen.
- `fields` — drives the testing-UI form (text inputs, `type: "select"`, or `type: "textarea"` for a multi-line value such as markdown). Unfilled fields fall back to placeholders — so a textarea whose empty state has to *mean* empty keeps a blank placeholder and says so in its label.
- `subject` — receives `(params, t, locale)`; the locale is there for a subject that prints a formatted value of its own (the session-report subject carries a date), and most subjects ignore it.
- `resolveParams?` — optional transform from raw UI field values to API params (e.g. a "Whose seat" select expands into the `isSelfSeat` boolean the builder takes).
- `replyTo?` — a function of the validated params, for the rare template whose live route replies to a person rather than to support. Omit it and the render defaults to `SUPPORT_EMAIL`. It exists so a test send reproduces the real mail's reply behaviour; a template that lies about this teaches the wrong thing to whoever is testing it.

Templates that are *not* exposed to the testing UI (currently the PIN-reset email) just export a builder and are sent directly from their API route — they don't need a registry entry.

## Layout gotchas (Gmail Android)

`layout.ts` carries two non-obvious workarounds. Preserve them when editing the shell:

- **Hero gradient is applied via a CSS class (`.hero-gradient`), not an inline `linear-gradient()`.** Gmail Android rewrites inline `linear-gradient()` into `url(linear-gradient(...))`, which breaks it. The class is set on both `<body>` and the outer `<table>` because Gmail strips `<body>` styles.
- **Brand-colored text uses a Gmail-only `background-clip:text` rule** behind the `u + .body` selector (which matches only Gmail's render wrapper). Gmail Android dark mode shifts the CSS `color` property but preserves gradient/background values, so brand text is recolored via a flat gradient + `background-clip:text` for Gmail and via plain inline `color` everywhere else. The header lockup and `styledName` emit the matching `brand-primary` class — keep the class names in sync between `utils.ts`, `layout.ts` and the `<style>` block.

**Rule: brand color in an email is for the header and button fills, not for text inside a paragraph.** The workaround above is a patch, not a fix — it buys back one Gmail surface and leaves every other client's dark-mode rewriting untouched — and the brand secondary lost that fight outright: purple body text came back from Gmail unreadable against the card. Inline emphasis is therefore weight, in the body's own color. Reach for a color inside a sentence only after checking it survives somewhere you can see, and prefer the emphasis that needs no client to cooperate.

The `<meta color-scheme: dark>` tags tell clients the email is already dark-themed so they skip their own dark-mode color adjustment.

## Every email a user receives is ours

**Supabase Auth sends no mail.** Confirmations are off, accounts are created with `email_confirm` set, and password reset takes only the `token_hash` from `generateLink` and renders our own builder — so nothing reaches a user through Supabase's dashboard-edited templates. Magic links and email verification are Sogverse's to build and send, not Supabase's to template. Treat "configure it in the Supabase dashboard" as the wrong answer to any email question, and add a builder here instead.

Stripe is the one genuine exception: receipts, invoices and dunning notices are composed and sent by Stripe, and their sender identity is dashboard configuration this repo cannot reach.

## Tests

Builder output is covered by unit tests under `tests/unit/email-templates/`; the Brevo wrapper and the routes that send are covered under `tests/unit/lib/` and `tests/integration/`. When you add a template or change builder output, update the matching unit test; when you add a registry entry reachable from the test-email route, the send-test-email integration test exercises validation for both modes.

**A route that sends owes its integration test three cases**, and they are the ones that
keep failing in production if nobody writes them: it sends on the outcome it is supposed
to, it sends *nothing* on the outcomes it is not (a refusal, a replay, an unrelated
branch), and the flow's own answer is unchanged when the send throws.
