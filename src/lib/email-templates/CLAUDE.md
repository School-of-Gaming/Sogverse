# Email templates

Code-owned, locale-aware HTML transactional emails. Builders here produce HTML strings; the actual send goes through the Brevo wrapper (`src/lib/brevo.ts`, `sendTransactionalEmail()` — the single entry point for every send in the app).

## Architecture

- **`layout.ts`** — `wrapInLayout({ title, content, locale, t })`: the branded dark-theme HTML shell every email uses. Table-based, inline CSS. `content` is your inner HTML. It emits the header's brand mark, above the lockup and never instead of it, and it carries the one stylesheet a mail has (see "Images" and "Layout gotchas" below).
- **`utils.ts`** — building blocks every template uses: `escapeHtml()`, `paragraph()`, `heading()`, `styledName()`, `styledProductName()`. Use these instead of hand-writing styled markup.
- **`blocks.ts`** — the composed blocks a template reaches for rather than builds. Mostly the ones a mail that sends the reader somewhere needs: `ctaButton()` (`primary` brand orange, `secondary` brand purple, `outline` bordered), `ctaButtonRow()` (two non-primary buttons side by side in a fixed 50/50 split, compact padding so both fit a mobile-width cell), `inlineLink()`, `bulletList()`, `sectionLabel()`. Every `href` they take is embedded unescaped, so they take app-generated URLs and nothing else. A mail with two buttons has one action it is actually asking for — that one is primary, the other outlined. Plus `calloutPanel({ label, paragraphs })`, for a mail with something to say about *itself*: the app's `Alert` in its `info` variant, with the component's alpha border and wash pre-composited over the message panel (`STATUS_TINT` in `colors.ts`). Its text is `foreground` throughout, which departs from the app's `Alert` twice: the accent it tints its title with is 4.46:1 on the wash (contrast comes before fidelity), and the muted tone it gives its description would pass at 6.37:1 but is declined on purpose — the later sentence is usually the one answering the reader's actual worry, and it is not the line to quiet. And `factTable(rows, { labelWidth })`, the bordered, rounded label–value box every mail we send to *ourselves* states the facts of a case in — the last row carries no rule, because the box's own border already closes the list. Labels and values both go in as composed HTML and neither is escaped there, so a value off a row is escaped (and, for an address, defused) by its caller. The session report's own facts block is deliberately *not* this one: open rules rather than a box, uppercase self-sized labels, and a final rule that is load-bearing because it separates the facts from the report — a helper with a knob for each of those would be a style engine, and the two would still never want the same correction.
- **`session-photos.ts`** — the session report's photo grid: the box arithmetic, one photo's toned well, and the two-per-row table an odd count ends by spanning. A module rather than a block in `blocks.ts` because one mail wants it and because *two* files have to agree about it — the template composes the grid and the shell carries the media query that stacks it — so the class name, the breakpoint and the gutter are exported and the selector in the shell is built from them. See "Images" below for what the boxes are for.
- **`markdown.ts`** — `renderMarkdownForEmail(markdown)`: stored markdown (a gedu's session report) to an inline-styled HTML fragment. It parses with the same parser the in-app `Markdown` component uses and emits exactly that component's `feed` subset — paragraphs, three heading levels, bold, italic, lists, line breaks — with everything else unwrapped to its text; a unit test holds the two element lists equal. Links render as their label only (the no-links rule for staff-authored, family-read copy is the field's, not the surface's) and address-shaped text gets a zero-width word joiner after each dot, because a mail client linkifies `evil.example/x` where a browser does not; every text node is escaped, and it is a string walker rather than a React render because the registry it sits behind is imported by a client page.
- **`components-reference.ts`** — the house style for mail, and the first entry in the registry. What `/admin/ui-components` is for the app, this is for email: the palette, the button variants, the text helpers and the callout panel, all rendered by the real helpers, in a form we have checked actually arrives. See "The reference is the style guide" below.
- **`fixtures/`** — sample data the testing UI feeds a template whose live send reads a row this tool has no reason to touch: two invented session reports, one written in English and one in Finnish, that between them use every control the gedu editor offers, and a count-selected set of demo photographs (the same committed preview art the app's scenes use, ordered landscape–portrait–square so a small count is already mixed). Invented on purpose — real reports name real children — and fixture, not copy: never shown outside `/admin/testing`, never translated. The photo fixtures exist because how a grid of pictures lands in a real inbox, blocked and unblocked, is the one thing no test can settle, and they are JPEGs for the same reason the real photos are: no client renders SVG, so demo art in that format would be checking a render the product cannot produce. **They take the mark's "no origin, no image" rule below whole, with no fixture exemption** — a test send composed on a dev machine carries no photos section at all, because a `localhost` src is unreachable by construction for the inbox it is about to land in. Seeing the grid is what the *preview* is for; see "Where a render is going" below.
- **`render-context.ts`** — `EmailRenderContext`, the two destinations a render can have, and `sendableImageOrigin()`, the one place the "no origin, no image" rule is decided. See "Where a render is going" below.
- **`attachments.ts`** — `RenderedAttachment` (a name, base64 content, and the decoded `text` a preview shows) and `textAttachment()`, the encoder both ends of the registry can run. See "A mail that carries a file" below.
- **`form-fields.ts`** — how a template turns the admin testing form's strings into values: the date, time, number, URL and email checks, the textarea splitter, and the yes/no vocabulary. One module rather than one per template, so a malformed date earns the same sentence whichever form it was typed into — and the sentence names the field, because the testing page shows a thrown message verbatim and the send route answers with it.
- **`product-confirmation-invitation.ts`** — the signup mail's half of the calendar work: a product's schedule as one `InvitationInput`, plus the sentences composed from it. It lives here rather than under `src/lib/calendar-invitations/` because it knows what a club is, which that module deliberately does not — see its `CLAUDE.md`. Pure, `now` is an argument, and it runs in a browser bundle like everything else on the registry's path. **What the entry's own `DESCRIPTION` states is a shorter list than the mail's, and the gap is the point**: the opening sentence, the product's short description, where it happens, the My SOG link, and how to reach a human. The schedule in words and the placement sentence are the mail's alone — a client draws the recurrence, the clock face and the zone out of the properties themselves and re-draws them when a later message moves the run, so a sentence beside them is the copy that goes wrong; and news about a group being assigned goes stale where the mail it arrived in does not. The schedule lines are still composed here, because that is where the schedule is resolved and resolving it twice is how the mail and the file would disagree.
- **`translator.ts`** — `getEmailTranslator(locale)` returns an `EmailTranslator` (`t`) scoped to the `email` namespace in `messages/*.json`. Every builder takes `t` and `locale`; no user-facing string is hardcoded in a builder.
- **`registry.ts`** — `templateRegistry`: the single source of truth for templates that are exposed to the admin testing UI and the test-email API route. Each entry is built with `defineTemplate({...})`.
- **Per-template builder files** (`password-reset.ts`, `pin-reset.ts`, `feedback.ts`, `welcome.ts`, `product-confirmation.ts`, `verify-email.ts`, `session-report.ts`, `seat-offer.ts`, `seat-offer-staff.ts`, `calendar-invitation.ts`) — exported `build*Email(t, locale, ...)` functions that compose the `utils`/`blocks` helpers inside `wrapInLayout`. `seat-offer.ts` is the only mail that uses `ctaButtonRow`: a family is asked whether they can still take a seat that has opened, and Accept and Decline are alternatives rather than a first and second choice. The pair is ordered by the app's own footer convention — negative first, affirmative last, so Accept is the right-hand cell — and the mail's one `primary` button is neither of them but My SOG, the in-app path to the same question. `seat-offer-staff.ts` is the same variant shape as the session report's staff copy — one builder, two reasons (a family declined, or the window ran out), both reachable from `/admin/testing` through a select, because a variant nobody can send themselves is a variant nobody checks. **Everything the two reasons share is written to be true of both**: the reason lives in the subject, the heading and one sentence, and the rest of the mail says only that the offer is over and the seat wants the next family — shared copy that narrates a decline turns the no-answer mail into an accusation. `session-report.ts` is sent by `POST /api/gedu/sessions/email-report`, which renders it once per active participation in the recipient's locale and once more as the staff copy (to the sending gedu, admins in CC, the group's name in the child's slot). The staff copy is a **variant of the same builder**, not a template of its own: it takes a flag and opens with a banner saying it is a copy and that each family's mail was addressed to them alone — the mail answering, before anything else, the misreading its own To and CC keep provoking. The variant is reachable from `/admin/testing` through a select, because a variant nobody can send themselves is a variant nobody checks. It is also the one mail whose content is partly pictures: a session's photos sit under the report, and the staff copy carries exactly the set the families were sent, because it is the same mail behind a banner. `calendar-invitation.ts` is one of the two mails that carry a *file*: an `invite.ics`, built by the pure module under `src/lib/calendar-invitations/` (which owns its own `CLAUDE.md`) and attached rather than drawn. **It is a laboratory rather than a product mail** — the calendar invite explorer, whose form has a field for every iCalendar property Google Calendar, Apple Calendar and Outlook all honour, so a difference between one send and the next is a difference in exactly one property. The mail around the document is incidental and composes nothing from it: a typed subject and a typed body, in the shell. It is in the shell rather than a bare paragraph precisely because of the sweep below — a mail that opted out would be the one render none of the house-style checks reach — and it is the one template that carries no copy of its own at all: both strings are typed into the form by the admin sending it, so there is nothing to translate and nothing for a message file to hold. (`components-reference.ts` is untranslated too, and for the other reason — it has copy, deliberately literal English, and it is the one entry that takes no params.)

## Sender identity

**Rule: every email sent from this codebase is from the same address and the same display name — `SENDER_EMAIL` and `SENDER_NAME` in `src/lib/constants`, with no per-template or per-route override.** The name is one literal, deliberately *not* translated: it is the company's mark, and a recipient who has learned to recognise it in an inbox list should keep recognising it whatever language the body is in. Locales translate the copy around a brand name, not the name — the same reasoning that keeps "My SOG" untranslated. A template that wants its own sender is a template arguing the reader should not be sure who wrote to them.

**The sender is the brand alone; the `School of Gaming – Sogverse` lockup lives in the layout's header instead.** An inbox list truncates the sender column hard, and a half-eaten lockup reads worse than the short name that always fits — while the header has the full width of the card and is the first thing inside the mail, so it is where both names get stated. Changing either half means changing the other's justification too: they are one decision about where each name earns its space, not two strings that happen to differ.

**The lockup is `BRAND_LOCKUP` in `src/lib/constants`, and the header is the one place that does not emit it whole.** The two names are set in two colours, so the header builds itself from `SENDER_NAME` and `BRAND_LOCKUP_TAIL` — every character of the lockup, the en dash above all, still comes from the constants module, and a unit test asserts the two spans read as `BRAND_LOCKUP` exactly. Do not type either name, or the separator, into this directory's markup.

**"From this codebase" is a real limit, not a hedge** — but it is a narrow one. Stripe's receipts are the only mail a user receives that this repo does not render (see "Every email a user receives is ours" below), and Stripe's sender identity is dashboard configuration. Keeping it on the same name is a hand-done ops step and the one half of the invariant a grep will never verify.

**Rule: Reply-To is set explicitly on every product send, and the default is the support inbox (`SUPPORT_EMAIL`).** Omitting it silently points replies at the sending address, which nobody reads — a family replying to ask for help would be writing into a void. The one exception is a mail we send *to ourselves* about a person: there the reply-to is that person, because replying is how a staff member answers them. State which of the two a send is, in a comment, at the call site. There is no send that may carry no Reply-To at all: the admin harness used to have a free-form mode that could, and it is gone — the harness now sends registered templates only, each carrying the reply-to its live route sets, so a test send lands the way the real mail does.

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

  **The placeholder fallback is what makes an untouched form compose a whole mail, and it is also why a text input can never mean "none".** Clearing the box posts the placeholder again, so a label reading "empty for none" beside a text input describes a state the control cannot reach — which is exactly how the signup confirmation spent a while sending no calendar invitation from a form nobody had touched. A field with a real absence therefore takes the typed token `FORM_NONE_TOKEN` (`none`, case- and space-insensitive, in `form-fields.ts`), says so in its own label, and is parsed through one of the `noneOr*` helpers. Choosing between the two controls is choosing which state the untouched form composes: prefer the text input, because the richer mail is the one worth looking at and the empty state stays one word away.
- `subject` — receives `(params, t, locale)`; the locale is there for a subject that prints a formatted value of its own (the session-report subject carries a date), and most subjects ignore it.
- `resolveParams?` — optional transform from raw UI field values to API params (e.g. a "Whose seat" select expands into the `isSelfSeat` boolean the builder takes).
- `replyTo?` — a function of the validated params, for the rare template whose live route replies to a person rather than to support. Omit it and the render defaults to `SUPPORT_EMAIL`. It exists so a test send reproduces the real mail's reply behaviour; a template that lies about this teaches the wrong thing to whoever is testing it.
- `text?` — the plain-text body, for the one template that owes the reader one. See "A mail that carries a file" below for why a calendar mail is that template and no other is.
- **A template whose parts are built from something *derived* from the params declares that derivation once**, through the sibling factory that takes a `resolve` step; every other template goes through the same assembly with the params as their own resolution, so there is one render path and not two. This exists because four callbacks each doing their own derivation is four derivations, and a derivation that is not a pure function of the params — one that mints an identifier — then answers differently in each of them. The mail states one value, the file beside it states another, and nothing about that is visible from inside any one callback: each is correct on its own.
- `attachments?` — a function of the resolved params, for the rare template whose content is not only its body. Declared beside `build` rather than returned from it, because the two are different artifacts with different rules — a body is HTML a client renders, an attachment is bytes a client *acts on* — and because a builder returning a pair would make every template that carries nothing say so. A render omits the key entirely when the function is absent or returns nothing.

Templates that are *not* exposed to the testing UI (currently the PIN-reset email) just export a builder and are sent directly from their API route — they don't need a registry entry.

## A mail that carries a file

Two templates carry one: the calendar invite explorer, and the signup confirmation, whose file is a family's own schedule.

**Rule: the file name is not decoration — it is the media type.** The provider's send API has no MIME field and infers one from the extension, so `invite.ics` is what makes a calendar arrive as an invitation a client can act on, and the same bytes under another name arrive as something to download and add by hand. A name is therefore never rewritten on the way out: the template chooses it, and the route passes it through untouched.

**Rule: an attachment is composed, never fetched.** A builder here reads no storage and makes no request, so what travels with a mail is something the template produced from its own params — which is what keeps this directory pure and what makes the whole thing testable from fixtures. A future mail that wanted to attach a *stored* file would take the bytes as a param, exactly as it already takes composed URLs.

**Rule: only text attachments carry their decoded content, and it exists for the preview alone.** What is sent is the name and the base64; `text` is the same bytes decoded, so the testing tool can show what was composed rather than only how it looks. There is nothing useful to put on screen for a picture or a PDF, which is why the field is optional rather than derived.

**Rule: a mail that carries a calendar part states a plain-text body, and those are the
only mails here that have to.** There are two — the calendar invite explorer, and the
signup confirmation, which attaches a family's own schedule. Everywhere else a text part
is a courtesy nobody reads: every client we care about renders the HTML. A calendar
changes what the text part *is*: an Exchange mailbox fills the calendar entry's own notes
from the message body, and with only HTML to work from it flattens the markup into them,
so a reader opening the session in their calendar finds the mail's table structure and the
provider's open-tracking pixel rendered as a bracketed link. The text is therefore not a
stripped copy of the markup but the mail's own words, because that is what somebody reads
inside the entry weeks later. The registry carries it beside the body and the provider
takes it as its own field; a template that states none simply omits it.

**Corollary: the text body follows the file, not the template.** The signup confirmation
carries a calendar only where the product has a schedule it can compose one from, so it
states a text body on exactly those renders and none on the rest — which is why the
registry's `text` callback may answer `undefined`. A mail with a text twin and no file
would be a stripped copy of markup nobody reads; a mail with a file and no text twin is
the entry-notes bug above.

**The encoder is deliberately not `Buffer`.** The registry is imported by an admin page as well as by the send route, so anything on this path has to run in a browser bundle. The string is encoded to bytes first and base64'd second — one step alone corrupts every character above U+00FF, which for a Finnish product name is most of them.

## Images: one that may vanish, and some that carry the content

**Rule: images are off in a large share of inboxes, so the blocked render is a normal render, and every mail here is composed to survive it — but what "survive" means depends on whether the picture is decoration or content.** There are two kinds now, and it is worth being precise about the difference, because the wrong guarantee applied to either one is how a mail ends up with a hole in it.

- **Decoration duplicates something the mail already says**, so a blocked render loses nothing at all. The header's brand mark is the case: the lockup right beneath it names both the brand and the platform whether or not the badge arrives.
- **Content does not, and cannot.** A session photo is a picture of a build a child made, and no `alt` string stands in for it — a mail whose images are blocked is genuinely missing something. So the guarantee that is available is the other one: **nothing may be *broken* by the absence.** The layout is whole, every box is already the size it will be, and the reader who turns images on gets pictures in holes that were the right shape all along.

**Rule: an image's rendered box is arithmetic from dimensions the sender already holds — never from the column it sits in, and never from anything measured.** The stored width and height are on the row beside the photo for exactly this; the box is derived from them under a **width budget and a height budget**, and both are needed. Width alone would let a portrait photo reserve the card's full column — about 750px of empty grey for one picture — which is the render this rule exists to prevent. The height budget is what caps that at a rectangle a reader can scroll past. Both budgets are set by the *narrowest* client, not the widest: a box wider than the smallest content column any client gives us pushes the mail's own table past the card and hands the reader a horizontal scroll, which no amount of desktop prettiness pays for.

**Rule: the reserved box is painted, and it is painted by a cell rather than by a background on the `<img>`.** A cell of exactly the box's size paints whether the image is blocked, deleted, still in flight, or stripped out of the document altogether — the same rectangle in all four cases — while an `<img>` that a client removed takes its own background with it. The fill is declared twice like every other background here, its tone comes from the palette, and the picture carries the cell's radius so the loaded and the blocked render have the same corners.

**Rule: an emailed image URL outlives our control of it, and the mail is a snapshot.** The URL is fetched by a mail client with a bare GET — no cookies, nowhere to type a code — so it works unauthenticated, and Gmail and Outlook proxy-cache it besides. Nothing retriggers when a photo is added after a send; a photo deleted after a send simply stops loading, which is exactly the blocked render the boxes above already handle. That is the whole of the answer, and it is enough because of them.

**Rule: `alt` is empty on every image in this directory, and for two different reasons.** On the mark, because the lockup beneath it is the accessible name and a screen reader should not hear the company twice. On a photo, because there is nothing true to write: nobody captions these, the file name is a UUID, and five repetitions of "Session photo" is noise in a blocked render and worse in a screen reader. The sentence above the grid is what says what they are.

**Rule: a builder composes no URL, image sources included.** The route resolves a photo's public URL from its row id through the shared session-image helper and passes it in; the testing tool points at committed demo art the same way. The one exception is the shell's own mark, whose origin is discussed below — a builder that started resolving storage URLs would need a notion of a bucket, which is exactly the kind of knowledge this directory keeps out.

### The brand mark, and why it is allowed to vanish

**Rule: the brand mark in the header supplements the text lockup and never replaces it.** The shell emits one image — the SOG badge, above the lockup — and the mail that arrives with it missing is the mail this directory sent before it existed: complete, headed, branded, with no hole where something was meant to be. A header carried *by* a picture makes every blocked render look broken, which is how a company's mail ends up with a red X where its name should be. The badge is the right art for that job precisely because it duplicates nothing: it is the gem and the monogram, with no "School of Gaming" in the drawing to sit above the same words in the lockup.

**Every image is a hosted file at a plain URL, and the three alternatives are all wrong here.** Clients do not render SVG; Gmail strips `data:` URIs out of `src`; a CID attachment makes every mail multipart, hangs a paperclip on it and costs deliverability. A URL the recipient's client can fetch on its own is the only form that reaches all of them — `public/` for the mark, the public storage bucket for a photo. **Format is decided by the worst renderer, not the best**: the mark is a PNG and a photo is a JPEG, because Outlook's desktop client (the Word engine) renders no WebP and this mail is a primary reading surface rather than a fallback for the app. The mark's file is 2× its display box so a retina reader gets a sharp mark, it keeps its alpha so the hero gradient shows through the badge's transparent corners, and it is **regenerated from the brand SVG with sharp, never hand-edited** — the command is in `layout.ts`'s doc comment beside the constant, and it reproduces the committed file byte for byte.

**Its origin is the canonical `NEXT_PUBLIC_SITE_URL`, which is a deliberate departure from how a *link* gets one.** A link in a mail is resolved from the incoming request through `getOrigin()`, because it has to land the reader back where they came from and because the `Host` behind it is attacker-controllable. An image `src` needs neither half of that: it carries no token, it is not somewhere a reader is being sent, and a builder here never sees a request in the first place — by rule, they take composed URLs as params. What is left is the requirement that staging mail point at staging and production mail at production, and the per-environment canonical URL is exactly that value; it is also what `getOrigin` itself falls back to. The `NEXT_PUBLIC_` prefix is load-bearing rather than incidental: this module is reachable from a client page through the registry, so a server-only var would be `undefined` in that bundle.

**No origin, no image — never a half-built `src`.** An unset or malformed env yields the text-only header rather than an `undefined/email/…` that resolves to nothing and paints the broken box the whole design exists to avoid. That is the same degradation as a blocked image, one level up. **A loopback origin takes the same branch and is the worse case of the two**: it is well-formed and unreachable, so the fetch does not fail to start, it fails — and Gmail's proxy paints its broken-image glyph inside the box the layout reserved, which was observed in a real inbox. Both halves live in one helper (`sendableImageOrigin()`), because the mark is no longer the only image in this directory and two copies of a rule are two chances to disagree about it.

### Where a render is going

**Rule: a mail states its destination, and it has exactly two.** A *send* leaves the building — a stranger's client fetches every `src` from wherever it is, through Gmail's and Outlook's proxies besides. A *preview* never leaves: the browser that asked for it draws it, on the machine that served the page. `EmailRenderContext` is that statement, taken by the registry's `render` alongside the params and the translator, and **`send` is the default**, so a caller who has not thought about it renders the mail that is safe to put in a stranger's inbox.

**It exists for exactly one difference, and that difference is reachability.** An origin only the serving machine can reach is unreachable by construction for a recipient and perfectly reachable for a previewer, so the testing tool's demo photographs are dropped from a send composed on a dev machine and kept in a preview of the same mail. A preview names the origin its own browser will fetch from, rather than reading the env, because the two need not agree — the dev server actually serving the art is the one drawing the page. **No origin at all is still no photos in both**, since there is then no absolute URL to emit.

**Nothing else may key on it.** The context is not a mode, a theme, or a hook for "the local version of this mail": a preview that differs from a send in anything but which images are fetchable is a picture of a mail nobody receives, which is the one thing a preview must never be. In particular the shell's mark does *not* consult it — a preview from a dev machine shows the same text-only header the same send would arrive with, which is the honest render and costs nothing, because the lockup underneath already says what the badge said.

**The preview surface is `/admin/testing`'s own panel**, an iframe fed the registry's rendered HTML through `srcDoc`. It is sandboxed, and `allow-same-origin` is deliberate rather than a relaxation: without `allow-scripts` nothing in the document can run, while the origin is what the inherited CSP's `img-src 'self'` is matched against — an opaque origin would block the very photographs the panel exists to show.

## The sender's inbox avatar lives in Google, and it mirrors the favicon by hand

The avatar Gmail shows beside our mail is not anything in this repo: it is the Google Workspace profile photo of the `sogverse@sog.gg` account (a real, licensed Workspace user since 2026-08-24 — created for exactly this). The photo is the favicon's gem-square art, re-rendered circle-safe: a 512px square on the app's dark ground with the art at ~72%, because Gmail crops avatars to a circle and the raw favicon would lose the squircle's left and right points to it. The org-managed "visible to people you interact with" setting proved sufficient for external recipients — no per-user visibility unlock was needed, and Brevo's sending is unrelated to the mailbox (it authenticates via DNS).

**Rule: the Workspace photo and the gem-square favicon are one mark and must be kept in parity by hand.** The photo lives in Google Admin, outside this repo, so no test can catch it drifting: any change to the gem-square art (`src/assets/brand/`, mirrored byte-for-byte by the app's icon file) is not done until the Workspace profile photo is re-rendered and re-uploaded in the same piece of work — circle-safe, per the shape above.

**The asset and the markup are one decision, and `layout.test.ts` is where they are held together.** A file served straight from `public/` is invisible to the build, so nothing else would notice it going missing, being regenerated at the wrong size, or losing its transparency. The same file asserts the property that matters most and cannot be seen by reading the markup: lift the image's row out of a rendered mail and what remains is byte-for-byte the mail sent without one.

## Layout gotchas (Gmail Android)

`layout.ts` carries a few non-obvious workarounds. Preserve them when editing the shell:

- **Hero gradient is applied via a CSS class (`.hero-gradient`), not an inline `linear-gradient()`.** Gmail Android rewrites inline `linear-gradient()` into `url(linear-gradient(...))`, which breaks it. The class is set on both `<body>` and the outer `<table>` because Gmail strips `<body>` styles.
- **Brand-colored text uses a Gmail-only `background-clip:text` rule** behind the `u + .body` selector (which matches only Gmail's render wrapper). Gmail Android dark mode shifts the CSS `color` property but preserves gradient/background values, so brand text is recolored via a flat gradient + `background-clip:text` for Gmail and via plain inline `color` everywhere else. The header lockup and `styledName` emit the matching `brand-primary` class — keep the class names in sync between `utils.ts`, `layout.ts` and the `<style>` block.
- **Only the *dark* button label is pinned.** `blocks.ts` puts `cta-on-brand` on the near-black label that sits on the brand fill, and the `<style>` block pins it through the same `background-clip:text` rule; that fixed a real fault, where the label arrived white in one inbox and black in the next. The light label on the outlined button carries no class, needs none, and must not be given one — see the rule below. Same sync rule for the class that remains: the name lives in `blocks.ts` and `layout.ts` and nowhere else.

- **The one media query lives here, and it is the exception that proves the rule below it.** Email clients do not reflow table columns, so a fixed 50/50 split is the layout at every width unless a query says otherwise — and a media query is the one thing that cannot be written inline, which means the shell's `<style>` is not its preferred home but its only one. Two things keep that honest: the layout it produces must be a *better* arrangement of a layout that is already correct without it (strip the query and the session report's photos stay pairs, which is fine), and the class name, breakpoint and gutter come from the module that emits the cells rather than being typed twice.

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

**A technique that is not house style yet does not go in the shared `<style>` block.** Untried rules there ship in every mail and spend Gmail's `<style>` budget on classes nothing emits, and a rule sitting in the shell reads as adopted whether or not anyone checked it. Carry a candidate in the template that is testing it, and move it into the shell as the step that means it won. **The exception is a rule with no other home** — a media query, which cannot be expressed inline at all — and it pays for the exemption differently: not by having been carried somewhere else first, but by the layout being correct with the rule stripped out.

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

Builder output is covered by unit tests under `tests/unit/email-templates/`; the Brevo wrapper and the routes that send are covered under `tests/unit/lib/` and `tests/integration/`. When you add a template or change builder output, update the matching unit test; when you add a registry entry reachable from the test-email route, the send-test-email integration test is where its validation is exercised.

**A route that sends owes its integration test three cases**, and they are the ones that
keep failing in production if nobody writes them: it sends on the outcome it is supposed
to, it sends *nothing* on the outcomes it is not (a refusal, a replay, an unrelated
branch), and the flow's own answer is unchanged when the send throws.
