# Email templates

Code-owned, locale-aware HTML transactional emails. Builders here produce HTML strings; the actual send goes through the Brevo wrapper (`src/lib/brevo.ts`, `sendTransactionalEmail()` — the single entry point for every send in the app).

## Architecture

- **`layout.ts`** — `wrapInLayout({ title, content, locale, t })`: the branded dark-theme HTML shell every email uses. Table-based, inline CSS. `content` is your inner HTML. It is also the only file that emits an image — the header's brand mark, above the lockup and never instead of it (see "The one image" below).
- **`utils.ts`** — building blocks every template uses: `escapeHtml()`, `paragraph()`, `heading()`, `styledName()`, `styledProductName()`. Use these instead of hand-writing styled markup.
- **`blocks.ts`** — the composed blocks a template reaches for rather than builds. Mostly the ones a mail that sends the reader somewhere needs: `ctaButton()` (`primary` brand orange, `secondary` brand purple, `outline` bordered), `ctaButtonRow()` (two non-primary buttons side by side in a fixed 50/50 split, compact padding so both fit a mobile-width cell), `inlineLink()`, `bulletList()`, `sectionLabel()`. Every `href` they take is embedded unescaped, so they take app-generated URLs and nothing else. A mail with two buttons has one action it is actually asking for — that one is primary, the other outlined. Plus `calloutPanel({ label, paragraphs })`, for a mail with something to say about *itself*: the app's `Alert` in its `info` variant, with the component's alpha border and wash pre-composited over the message panel (`STATUS_TINT` in `colors.ts`). Its text is `foreground` throughout, which departs from the app's `Alert` twice: the accent it tints its title with is 4.46:1 on the wash (contrast comes before fidelity), and the muted tone it gives its description would pass at 6.37:1 but is declined on purpose — the later sentence is usually the one answering the reader's actual worry, and it is not the line to quiet. And `factTable(rows, { labelWidth })`, the bordered, rounded label–value box every mail we send to *ourselves* states the facts of a case in — the last row carries no rule, because the box's own border already closes the list. Labels and values both go in as composed HTML and neither is escaped there, so a value off a row is escaped (and, for an address, defused) by its caller. The session report's own facts block is deliberately *not* this one: open rules rather than a box, uppercase self-sized labels, and a final rule that is load-bearing because it separates the facts from the report — a helper with a knob for each of those would be a style engine, and the two would still never want the same correction.
- **`markdown.ts`** — `renderMarkdownForEmail(markdown)`: stored markdown (a gedu's session report) to an inline-styled HTML fragment. It parses with the same parser the in-app `Markdown` component uses and emits exactly that component's `feed` subset — paragraphs, three heading levels, bold, italic, lists, line breaks — with everything else unwrapped to its text; a unit test holds the two element lists equal. Links render as their label only (the no-links rule for staff-authored, family-read copy is the field's, not the surface's) and address-shaped text gets a zero-width word joiner after each dot, because a mail client linkifies `evil.example/x` where a browser does not; every text node is escaped, and it is a string walker rather than a React render because the registry it sits behind is imported by a client page.
- **`components-reference.ts`** — the house style for mail, and the first entry in the registry. What `/admin/ui-components` is for the app, this is for email: the palette, the button variants, the text helpers and the callout panel, all rendered by the real helpers, in a form we have checked actually arrives. See "The reference is the style guide" below.
- **`fixtures/`** — sample data the testing UI feeds a template whose live send reads a row this tool has no reason to touch (today: two invented session reports, one written in English and one in Finnish, that between them use every control the gedu editor offers). Invented on purpose — real reports name real children — and fixture, not copy: never shown outside `/admin/testing`, never translated.
- **`translator.ts`** — `getEmailTranslator(locale)` returns an `EmailTranslator` (`t`) scoped to the `email` namespace in `messages/*.json`. Every builder takes `t` and `locale`; no user-facing string is hardcoded in a builder.
- **`registry.ts`** — `templateRegistry`: the single source of truth for templates that are exposed to the admin testing UI and the test-email API route. Each entry is built with `defineTemplate({...})`.
- **Per-template builder files** (`password-reset.ts`, `pin-reset.ts`, `feedback.ts`, `welcome.ts`, `product-confirmation.ts`, `verify-email.ts`, `session-report.ts`, `seat-offer.ts`, `seat-offer-staff.ts`) — exported `build*Email(t, locale, ...)` functions that compose the `utils`/`blocks` helpers inside `wrapInLayout`. `seat-offer.ts` is the only mail that uses `ctaButtonRow`: a family is asked whether they can still take a seat that has opened, and Accept and Decline are alternatives rather than a first and second choice. The pair is ordered by the app's own footer convention — negative first, affirmative last, so Accept is the right-hand cell — and the mail's one `primary` button is neither of them but My SOG, the in-app path to the same question. `seat-offer-staff.ts` is the same variant shape as the session report's staff copy — one builder, two reasons (a family declined, or the window ran out), both reachable from `/admin/testing` through a select, because a variant nobody can send themselves is a variant nobody checks. **Everything the two reasons share is written to be true of both**: the reason lives in the subject, the heading and one sentence, and the rest of the mail says only that the offer is over and the seat wants the next family — shared copy that narrates a decline turns the no-answer mail into an accusation. `session-report.ts` is sent by `POST /api/gedu/sessions/email-report`, which renders it once per active participation in the recipient's locale and once more as the staff copy (to the sending gedu, admins in CC, the group's name in the child's slot). The staff copy is a **variant of the same builder**, not a template of its own: it takes a flag and opens with a banner saying it is a copy and that each family's mail was addressed to them alone — the mail answering, before anything else, the misreading its own To and CC keep provoking. The variant is reachable from `/admin/testing` through a select, because a variant nobody can send themselves is a variant nobody checks.

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

**Rule: Colors come from the shared constants, not Tailwind/hex literals.** Email HTML can't use semantic Tailwind classes, so import `BRAND` / `DARK_THEME` / `GRADIENT` / `STATUS` / `STATUS_TINT` from `@/lib/constants/colors` and interpolate them into inline styles. This is the email-context equivalent of the repo-wide "no hardcoded colors" rule.

## When a mail carries bad news

A hard moment is a mail about money gone wrong, a mistake of ours, or anything else the reader opens already unhappy. It has its own register, and these four rules are it.

**Rule: the admission leads.** The first sentence says what happened and whose fault it was, in the plainest words available — "we charged you twice. That was our error." Not a greeting, not thanks for the reader's patience, not a paragraph of context for the admission to hide behind. A reader who has to hunt for what went wrong has learned that we would rather they did not find it, and they read the rest of the mail in that light.

**Rule: one remedy, one deadline, one escalation path — exactly one of each.** What we are doing about it, when it will be done, and how to reach a human if it is not. Two remedies make the reader do the deciding; no deadline leaves "we are looking into it" as the whole message; no escalation path hands them a mail they cannot answer. Three sentences normally carry all three.

**Rule: no apology inflation.** "We sincerely regret any inconvenience" never ships from this directory. One apology, in ordinary words, attached to the specific thing that happened — inflation is what turns an apology into a form letter, and a reader who has just been charged twice can tell the difference at a glance. "Any inconvenience" is the tell: it hedges about whether there even was one.

**Rule: Level 0 carries no lore.** Money and mistakes are written in the brand's plainest register — no Yty, no Princi-Pal, no world vocabulary, no jokes. The world is what we offer a child; a parent looking at an unexpected charge is not in it, and a flourish there reads as a company enjoying itself at the reader's expense.

**This register governs hard-moment mail written from now on; it does not retrofit existing copy.** In particular the duplicate-payment confirmation stays minimal (owner ruling): under our Stripe integration a duplicate payment is very nearly impossible, so elaborating that state — in a mail or in page copy — advertises a fault the integration does not have and sets a lower expectation than the truth. The two are not in tension: one is the register for a mail somebody writes tomorrow, the other is a ruling about one string that exists today.

## An email is the web app's style, in someone's inbox

**Rule: a mail is not styled, it *inherits*. Every value it uses is the app's value, and where a value has a name in `globals.css` the email uses a constant that mirrors that name — never a literal that happens to match today.** A parent meets us on the site and then in their inbox, and the mail has to read as the same product rather than as something built by someone with the brand guidelines open. `colors.ts` is the mirror, and its header says so; the discipline is to keep it complete, because the failure mode is silent. Two values that agree by coincidence look exactly like two values that agree by design, right up until one of them moves.

**Corollary: a fill and the foreground on it are one decision and are named together.** `BRAND` carries `primaryForeground` and `secondaryForeground` alongside the fills for that reason. The brand colours are mirror images — the primary is light and reads only under a dark label (`#121212`, 9.6:1; white on it is 2.0:1), the secondary is dark and reads only under a white one (`#ffffff`, 6.4:1; the dark label is 2.9:1) — so a button that swaps its fill and keeps its label has not been recoloured, it has been broken. That is the single most tempting wrong edit in this directory, which is why the pairing is a table in `BRAND` rather than two values a caller picks from, and why `palette-contrast.test.ts` fails if either wrong pairing ever clears AA.

**Corners mirror the same way colours do, through `RADIUS` in `src/lib/constants/radius.ts`.** Both email radii had drifted off the app's scale — buttons at 8px against `rounded-md`'s 6px, and the message panel at 12px against a `Card`'s 8px — and neither was legible as a difference while it was a literal. A number typed into markup cannot disagree with anything; a number named after the token it mirrors can. There are no radius literals left in this directory, and a new one is a bug.

**Where the mirror is imperfect**, so nobody has to rediscover it:

| | app | email |
|---|---|---|
| Body font | `--font-sans` | Arial/Helvetica — **permanent, do not chase** |

Webfonts do not load in most clients, and a stack that falls back unpredictably is worse than one that is the same everywhere. Anything else you find, fix or list here — an unlisted difference reads as an accident, and this table is what makes it a decision.

**`password-reset.ts` and `pin-reset.ts` used to hand-roll `ctaButton`'s markup, and it is worth knowing what that cost.** Correcting them piecemeal — the radius here, the label token there — made them *look* corrected while both were still missing the gradient fill and the `cta-on-brand` pin, i.e. both halves of the Gmail work. The two mails where a broken button means a locked-out account were the two most broken mails we had, for months, in a directory whose own doc called it done. They now call `ctaButton`, which is the only durable form of the fix: a copy cannot inherit tomorrow's correction. **Prefer a helper over its output, always, and treat "I corrected the copy" as a smell rather than a fix.**

## Registry pattern (`defineTemplate`)

When a template should be testable from `/admin/testing` and sendable via the test-email route, add it to `templateRegistry` with `defineTemplate({ label, fields, schema, build, subject, replyTo?, resolveParams? })`:

- `schema` — a zod schema whose **output type is the params type** passed to `build`/`subject`. This is what gives `build`/`subject` fully-typed params with no casts; `defineTemplate` parses raw params through `schema` inside the generated `render`, so a malformed payload throws a `ZodError` at the boundary. Derive enum fields from `Constants.public.Enums.*` so they track codegen.
- `fields` — drives the testing-UI form (text inputs, `type: "select"`, or `type: "textarea"` for a multi-line value such as markdown). An untouched text input posts its placeholder and an untouched select its first option; an untouched textarea posts what it holds, empty included, so its placeholder is a hint and an empty value can mean "none".
- `subject` — receives `(params, t, locale)`; the locale is there for a subject that prints a formatted value of its own (the session-report subject carries a date), and most subjects ignore it.
- `resolveParams?` — optional transform from raw UI field values to API params (e.g. a "Whose seat" select expands into the `isSelfSeat` boolean the builder takes).
- `replyTo?` — a function of the validated params, for the rare template whose live route replies to a person rather than to support. Omit it and the render defaults to `SUPPORT_EMAIL`. It exists so a test send reproduces the real mail's reply behaviour; a template that lies about this teaches the wrong thing to whoever is testing it.

Templates that are *not* exposed to the testing UI (currently the PIN-reset email) just export a builder and are sent directly from their API route — they don't need a registry entry.

## The one image, and why it is allowed to vanish

**Rule: the brand mark in the header supplements the text lockup and never replaces it.** The shell emits one image — the SOG badge, above the lockup — and the mail that arrives with it missing is the mail this directory sent before it existed: complete, headed, branded, with no hole where something was meant to be. Images are off by default in a large share of inboxes, so the blocked render is not an edge case, it is a normal one; a header carried *by* a picture makes every one of those renders look broken, which is how a company's mail ends up with a red X where its name should be. The badge is the right art for that job precisely because it duplicates nothing: it is the gem and the monogram, with no "School of Gaming" in the drawing to sit above the same words in the lockup. Its `alt` is empty for the same reason — the lockup right beneath it is the accessible name, so the blocked render carries no stray repeated word and a screen reader hears the name once.

**It is a hosted PNG, and the three alternatives are all wrong here.** Clients do not render SVG; Gmail strips `data:` URIs out of `src`; a CID attachment makes every mail multipart, hangs a paperclip on it and costs deliverability. A URL to a file the app already serves out of `public/` is the only form that reaches all of them. The file is 2× its display box so a retina reader gets a sharp mark, it keeps its alpha so the hero gradient shows through the badge's transparent corners, and it is **regenerated from the brand SVG with sharp, never hand-edited** — the command is in `layout.ts`'s doc comment beside the constant, and it reproduces the committed file byte for byte.

**Its origin is the canonical `NEXT_PUBLIC_SITE_URL`, which is a deliberate departure from how a *link* gets one.** A link in a mail is resolved from the incoming request through `getOrigin()`, because it has to land the reader back where they came from and because the `Host` behind it is attacker-controllable. An image `src` needs neither half of that: it carries no token, it is not somewhere a reader is being sent, and a builder here never sees a request in the first place — by rule, they take composed URLs as params. What is left is the requirement that staging mail point at staging and production mail at production, and the per-environment canonical URL is exactly that value; it is also what `getOrigin` itself falls back to. The `NEXT_PUBLIC_` prefix is load-bearing rather than incidental: this module is reachable from a client page through the registry, so a server-only var would be `undefined` in that bundle.

**No origin, no image — never a half-built `src`.** An unset or malformed env yields the text-only header rather than an `undefined/email/…` that resolves to nothing and paints the broken box the whole design exists to avoid. That is the same degradation as a blocked image, one level up.

## The sender's inbox avatar lives in Google, and it mirrors the favicon by hand

The avatar Gmail shows beside our mail is not anything in this repo: it is the Google Workspace profile photo of the `sogverse@sog.gg` account (a real, licensed Workspace user since 2026-08-24 — created for exactly this). The photo is the favicon's gem-square art, re-rendered circle-safe: a 512px square on the app's dark ground with the art at ~72%, because Gmail crops avatars to a circle and the raw favicon would lose the squircle's left and right points to it. The org-managed "visible to people you interact with" setting proved sufficient for external recipients — no per-user visibility unlock was needed, and Brevo's sending is unrelated to the mailbox (it authenticates via DNS).

**Rule: the Workspace photo and the gem-square favicon are one mark and must be kept in parity by hand.** The photo lives in Google Admin, outside this repo, so no test can catch it drifting: any change to the gem-square art (`src/assets/brand/`, mirrored byte-for-byte by the app's icon file) is not done until the Workspace profile photo is re-rendered and re-uploaded in the same piece of work — circle-safe, per the shape above.

**The asset and the markup are one decision, and `layout.test.ts` is where they are held together.** A file served straight from `public/` is invisible to the build, so nothing else would notice it going missing, being regenerated at the wrong size, or losing its transparency. The same file asserts the property that matters most and cannot be seen by reading the markup: lift the image's row out of a rendered mail and what remains is byte-for-byte the mail sent without one.

## Layout gotchas (Gmail Android)

`layout.ts` carries a few non-obvious workarounds. Preserve them when editing the shell:

- **Hero gradient is applied via a CSS class (`.hero-gradient`), not an inline `linear-gradient()`.** Gmail Android rewrites inline `linear-gradient()` into `url(linear-gradient(...))`, which breaks it. The class is set on both `<body>` and the outer `<table>` because Gmail strips `<body>` styles.
- **Brand-colored text uses a Gmail-only `background-clip:text` rule** behind the `u + .body` selector (which matches only Gmail's render wrapper). Gmail Android dark mode shifts the CSS `color` property but preserves gradient/background values, so brand text is recolored via a flat gradient + `background-clip:text` for Gmail and via plain inline `color` everywhere else. The header lockup and `styledName` emit the matching `brand-primary` class — keep the class names in sync between `utils.ts`, `layout.ts` and the `<style>` block.
- **Only the *dark* button label is pinned.** `blocks.ts` puts `cta-on-brand` on the near-black label that sits on the brand fill, and the `<style>` block pins it through the same `background-clip:text` rule; that fixed a real fault, where the label arrived white in one inbox and black in the next. The light label on the outlined button carries no class, needs none, and must not be given one — see the rule below. Same sync rule for the class that remains: the name lives in `blocks.ts` and `layout.ts` and nowhere else.

**Rule: never pin a light colour through `background-clip:text`.** The pin works by restating a text colour as a *background* colour — and a client's dark theme leaves dark backgrounds alone while darkening light ones, which is the entire job of dark mode. So the mechanism that carries `#121212` and `#FAA901` intact is the same mechanism that destroys `#ededed`: pinning a near-white label hands it to precisely the pass that exists to darken near-white values, and it arrives dark. The outlined button's label was broken by its own protection for exactly this reason, and deleting the pin fixed it. The safe boundary is luminance, not brand-ness and not which element is being styled: pin a colour only if a dark theme would leave it alone as a background, and leave everything lighter to its plain inline colour, which survives on its own.

This was measured against the Gmail Android app, not deduced. A mail carrying the same light colour three ways — pinned on a button, pinned on a span, pinned over a lighter fill — came back wrong all three times, while the same colour with no class at all came back correct, and the same colour in a bare anchor elsewhere in the mail ruled out the element as a factor. It is written down because it is genuinely counter-intuitive: **more protection made it worse**, and the natural next move when a pinned colour fails is to pin it harder.

**Rule: a background an email depends on is declared twice — as a `background-color` and as a flat `linear-gradient` of the same colour.** Gmail's dark theme rewrites `background-color` and leaves gradients alone, so the gradient is the half that survives; the colour is the fallback for clients that ignore `background-image` on a table cell, Outlook's Word engine above all. This is the same mechanism as the hero gradient above, applied to a solid. Unproven on its own — it was part of the configuration that measured clean, and nothing has isolated it since.

## There is one appearance, and it is ours

**Rule: an email has no light mode and no dark mode — it has our brand's colours, and the only question about any client is whether they arrive intact.** This is the same rule the app is built on (one theme, defined once, no variants to select between), and the `color-scheme` meta tags in the shell exist to state it to clients. Framing a problem as "handling dark mode" concedes that our mail has modes and that a client is entitled to pick one; it does not, and it is not. What actually happens is narrower and worth naming precisely: **some clients rewrite colours they were not asked to rewrite**, most visibly when the reader's device is set to a dark system theme — a setting on their phone, describing their phone, not our design.

The practical difference is in where a fix is aimed. "Make dark mode look good" invites a second palette, and a second palette is a second thing to maintain and a second thing to get wrong. "Make this colour survive this client" is one job with a yes/no answer, and it is the only one we take.

## The reference is the style guide, and it is binding

**Rule: `components-reference.ts` is the house style for email, and every mail in this directory follows it.** It stands to mail exactly as `/admin/ui-components` stands to the app: the palette, the three button variants and the text helpers, shown as they are meant to be used. A new template starts by reaching for what is on that page; a change to how mail looks is a change to that page first and to the mails afterwards.

**Rule: it is built entirely from the real helpers, and nothing on it is drawn specially for it.** That is the property that makes it worth trusting — a style guide that hand-rolls its specimens is a picture of what the components used to do, and it goes stale without anyone noticing. Because every specimen is a live call, the page cannot disagree with the code: change a helper and the reference changes with it. Adding a specimen that is not a helper call is therefore not a shortcut, it is the one thing that breaks the guarantee.

**Rule: it shows only what is correct.** No gallery of broken examples, however instructive — a reference that displays a wrong thing teaches the wrong thing to whoever skims it, and skimming is what a reference is for. What was ruled out is written down *here* instead, in prose, for the reader asking why rather than the reader looking for something to copy.

**How it is checked, and why that is a real step.** Open the mail in the client you care about, and compare it against the same mail in the desktop web client; everything on the page is supposed to look identical in both. A difference is a finding about a component, not a preference between two renderings. This is cheap and worth re-running whenever a client updates, because there is no spec to reason from — the published accounts of what Gmail does to a colour disagree with each other and describe behaviour that has since changed. **A claim about what a client does to a colour is worth what a screenshot of that client backs it up with**, and everything in this file's Gmail rules was arrived at that way rather than by argument.

**A technique that is not house style yet does not go in the shared `<style>` block.** Untried rules there ship in every mail and spend Gmail's `<style>` budget on classes nothing emits, and a rule sitting in the shell reads as adopted whether or not anyone checked it. Carry a candidate in the template that is testing it, and move it into the shell as the step that means it won.

**None of this is testable from Gmail webmail.** Its dark theme darkens Gmail's own interface and leaves message bodies alone, so a mail that looks right there has only proved its authored colours are right — it has not exercised a single one of these workarounds. Verify in the **Gmail Android app** with the device in dark mode (send yourself the template from `/admin/testing`). The Gmail **iOS** app is a third behaviour again and is untested here; it is not reachable by the `u + .body` selector at all, so the one pin that remains (`cta-on-brand`) simply does not apply there and that label falls back to its inline colour. Whether that is fine or is the same fault under another name is an open question, not a solved one — the check is the way to answer it, and nobody has run it on an iPhone.

**Rule: brand color in an email is for the header and button fills, not for text inside a paragraph.** Inline emphasis is weight, in the body's own colour — the emphasis that needs no client to cooperate. The reference states this and demonstrates the two fills; there is deliberately no specimen of brand-coloured body text, because there is no correct version of it to show.

**The brand secondary's exclusion is a contrast fact, not a Gmail one, and this correction matters.** It was recorded here as purple having "lost that fight" with Gmail's rewriting, which put the blame in the wrong place and implied the right technique could win it back. Purple text on the card is **2.7:1**, below WCAG AA (4.5:1) and below AA-large (3:1) — it is unreadable when a client renders it *perfectly*, and no fidelity technique has anything to offer that. The primary is the opposite case and the comparison is the point: orange on the card is 8.9:1, and a near-black label on orange is 9.6:1.

**So the two brand colours are not interchangeable, and the secondary's one usable shape is as a fill under white** — which is what the app already says (`--secondary-foreground: 0 0% 100%`), and what `blocks.ts` now spells as `variant: "secondary"`. Transplanting the primary's recipe — a brand fill under the near-black label — gives 2.9:1 and fails, because orange is a light colour and purple is a dark one. Copying a working button and changing only its fill is the specific mistake to avoid, and the variants exist so that nobody has to: the fill and its foreground travel together and cannot be paired wrongly by a caller.

**Check contrast before fidelity, always.** A colour that fails contrast cannot be rescued by making a client honour it, and asking "did it arrive intact" first is how purple spent a release being blamed on Gmail.

The `<meta color-scheme: dark>` tags tell clients the email is already dark-themed so they skip their own dark-mode color adjustment.

## What actually holds the line

Prose did not hold. Every rule above was written down before the worst bug in this
directory shipped, and the bug shipped anyway — in the one builder no test rendered,
built from all the right constants, simply never calling the helper. So the rules that
can be mechanical are, and they assert on **rendered output**, because what is wrong with
a mail is a property of what leaves the building.

- **`tests/unit/email-templates/palette-contrast.test.ts`** — contrast, on the palette
  itself, rendering nothing. It runs in milliseconds and it is the check to add first: a
  colour that fails contrast is unreadable when a client renders it *perfectly*, so no
  fidelity work touches it. It also pins the pairs we *rejected*, so the reason survives
  the reasoning.
- **`tests/unit/email-templates/house-style.test.ts`** — renders every mail and asserts:
  every anchor came from a helper; every background is declared twice; every brand fill
  carries its own foreground; every colour is in the palette; every corner is in `RADIUS`;
  and every `background-clip:text` pin is on a colour **verified by screenshot**, listed
  with its evidence and date.
- **`tests/unit/email-templates/layout.test.ts`** — the shell itself: the header's two
  invariants, which no per-template test can see. That the lockup's two coloured spans
  still read as `BRAND_LOCKUP` exactly, and that the brand mark is additive — the image
  row lifted back out leaves the mail that was sent before it existed, the box is held
  open by attributes a client honours before it has fetched anything, and no origin
  yields no image rather than a broken one. It also reads the PNG off disk, because a
  file served out of `public/` is invisible to every other check we have.
- **The completeness pair.** The suite discovers builders through `import.meta.glob`
  rather than naming them, and fails both ways: a builder nothing renders, and an entry
  whose builder is gone. This is the keystone — the bug lived in the file nothing
  enumerated, and a list someone has to remember to append to would have missed it again.
- **The lint guard** (`eslint.config.mjs`) refuses colour and radius literals in this
  directory, at the moment they are typed, naming the constant to use instead.

**The two layers catch different things and neither replaces the other.** Lint catches a
literal in the source; it cannot see a template that bypasses the helpers, because those
use the right constants. The output sweep catches the bypass; it cannot tell you which
line to change. The prod bug was a bypass, so the sweep is the load-bearing half.

**Rule: the pin's evidence list is the one place a human step is mandatory.** Nothing in a
string can tell you what a client does to a colour. Adding a pinned class fails the suite
until its colour is on the verified list with a date — which forces the screenshot at the
moment it matters and nowhere else. Send the components reference from `/admin/testing`,
open it in the client, record what you saw.

**What is deliberately not automated:** whether the mail *reads* well, and everything
about copy. A test can hold an invariant; it cannot hold an opinion.

## Every email a user receives is ours

**Supabase Auth sends no mail.** Confirmations are off, accounts are created with `email_confirm` set, and password reset takes only the `token_hash` from `generateLink` and renders our own builder — so nothing reaches a user through Supabase's dashboard-edited templates. Magic links and email verification are Sogverse's to build and send, not Supabase's to template. Treat "configure it in the Supabase dashboard" as the wrong answer to any email question, and add a builder here instead.

Stripe is the one genuine exception: receipts, invoices and dunning notices are composed and sent by Stripe, and their sender identity is dashboard configuration this repo cannot reach.

## Tests

Builder output is covered by unit tests under `tests/unit/email-templates/`; the Brevo wrapper and the routes that send are covered under `tests/unit/lib/` and `tests/integration/`. When you add a template or change builder output, update the matching unit test; when you add a registry entry reachable from the test-email route, the send-test-email integration test exercises validation for both modes.

**A route that sends owes its integration test three cases**, and they are the ones that
keep failing in production if nobody writes them: it sends on the outcome it is supposed
to, it sends *nothing* on the outcomes it is not (a refusal, a replay, an unrelated
branch), and the flow's own answer is unchanged when the send throws.
