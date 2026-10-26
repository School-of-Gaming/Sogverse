# Email templates

Code-owned, locale-aware HTML transactional emails. Builders here produce HTML strings; the actual send goes through the Brevo wrapper (`src/lib/brevo.ts`, `sendTransactionalEmail()` — the single entry point for every send in the app).

## Architecture

- **`layout.ts`** — `wrapInLayout({ title, content, locale, t })`: the branded dark-theme HTML shell every email uses. Table-based, inline CSS. `content` is your inner HTML. An optional `preheader` is the mail's inbox preview: plain text, escaped by the shell, emitted as the first thing in the body inside a block hidden every way a client honours (`display:none`, a zero size and opacity, Outlook's `mso-hide`, transparent text, so the holds have nothing to account for) and followed by a run of invisible padding characters, because a client fills its preview line with as much text as fits and would otherwise pull the header lockup in after a short sentence. A mail that passes none gets no block, and its preview is the lockup. It emits the header's brand mark, above the lockup and never instead of it, and it carries the one stylesheet a mail has (see "Images" and "Layout gotchas" below). **The inline layout is the phone's and the card is what a wide viewport adds**: the base shell is a single 16px side gutter with the content sitting straight on the dark ground, and the one media query draws the panel — its pinned fill, its border, its corner, its 32px padding, the wider outer gutters and a little more air under the header — above the width that can afford them. The phone layout ends the content with a hairline above the footer, because with no card nothing else tells the footer apart from the last block's own small print; the query hides it, since the card's edge does that job and the footer sits outside the card. Every class name the shell emits is declared in one place in that file — the gutter cell, the panel cell, the header's rhythm and the footer's hairline are the ones that carry one — and the selectors in its stylesheet that are *not* the shell's own (the ground-following fills, the text pins, the hold pair) are built from the tables in `utils.ts` that the markup takes its classes from, so a name is never typed twice.
- **`utils.ts`** — building blocks every template uses: `escapeHtml()`, `paragraph()`, `heading()`, `subheading()`, `styledName()`, `styledProductName()`. Use these instead of hand-writing styled markup. It also holds the primitives the Gmail rules below are made of: `pinnedFill()`, the twice-declared background; `TEXT_PINS`, the colours painted through `background-clip:text`, each with its class; the hold — `HOLD_CLASS`, `holdBlock()`, `holdInline()`, and `holdText()`/`holdRuns()` for a sentence that carries a link; `framedCell()`, a bordered box whose edge is a fill; and the table naming the **two ground-following intents** — a tone one step *off* the ground, and a fill that means to *be* the ground — each with its phone value, its wide value and its class name. A surface whose fill was chosen in relation to what is behind it takes both of its halves from that table rather than naming a colour, because the shell has two grounds and such a fill has two correct values; see "Images" below for the whole of the reasoning.
- **`type-scale.ts`** — the mail's type scale and its spacing steps, each one table, every value read from the authored-markdown definition or from SOG-UI's type scale and none typed. Every helper sets text through `mailText()` and spaces itself from `MAIL_SPACE`; see "Type and spacing" below.
- **`blocks.ts`** — the composed blocks a template reaches for rather than builds. Mostly the ones a mail that sends the reader somewhere needs: `ctaButton()` (`primary` brand orange, `secondary` brand purple, `outline` bordered and with no fill at all, so the whole button can be held), `ctaButtonRow()` (two non-primary buttons side by side in a fixed 50/50 split, compact padding so both fit a mobile-width cell), `inlineLink()`, `bulletList()`, `numberedList()`, `sectionLabel()`, `hairlineRule()`. `numberedList()` is `bulletList()` with numbers and identical styling down to the margins — one construct with two markers, for a run whose order is part of what it says; the numbers are counted from the items (the client's own `<ol>` for plain items, written out for a list carrying a link — see the Gmail section), never written into them, so an edit cannot leave them out of step. `inlineBold()` beside them is the emphasis a *sentence* carries inside itself, in weight rather than colour for the reason `styledProductName` gives, and it is what a message's own `<b>` renders to: `MARKUP_TAGS` (and `PLAIN_MARKUP_TAGS`, which renders the tag to nothing) are the handler maps a builder hands `t.markup`, which is the plain-string translator's answer to the app's `t.rich`. `<b>` is the only tag a mail's copy may carry — which words a sentence leans on is the translation's decision, and every other kind of markup here is the builder's. Every `href` they take is embedded unescaped, so they take app-generated URLs and nothing else. A mail with two buttons has one action it is actually asking for — that one is primary, the other outlined. Plus `calloutPanel({ label, paragraphs })`, for one of two things — an aside about the mail *itself*, which opens the mail (the session report's staff copy saying it is a copy), or the one fact in a mail the reader must not miss because it stops being true, which sits beside what it bounds (the seat offer's deadline, under the question and above the answers): a box with no wash whose edge carries the status at full value (`STATUS.info`, drawn as a fill — see "Gmail" below), its uppercase label in that same colour — the Alert label's convention, small type in bold — and its paragraphs in the ordinary body ink. The wash it used to carry went with every other tint — the coloured edge and the coloured label are what mark the panel as an aside, and a tinted ground was the same statement made a second time, more quietly. Its paragraphs are `foreground` throughout, which departs from the app's `Alert` in the tone it gives the description: the muted one is declined on purpose — the later sentence is usually the one answering the reader's actual worry, and it is not the line to quiet. And `factList(rows)`, the one label–value block every mail here states its facts in: a top rule, one row per fact, a hairline under every row including the last, a small muted label in sentence case in a column as narrow as its own longest label, and the value in ordinary body ink. Labels and values both go in as composed HTML and neither is escaped there, so a value off a row is escaped (and, for an address, defused) by its caller. It was the session report's private block until it became everyone's; the bordered, rounded box the other mails used is gone, because on a phone it spent a border, a radius and 16px of padding on each side of a column that had none of that to give — all of it on an outline around facts nobody was going to mistake for anything else. **There is one block and no variants of it**, staff mail included: staff read mail on phones too (owner's ruling), and the knob-per-difference helper that would keep two arrangements alive is the style engine this directory has already declined once. There is no label-width option for the same reason the column sizes itself — a caller picking one was picking it for the English labels. Last, two staff-mail blocks: `quotedMessage()`, a person's own words in a box a tone off the ground, and `smallNote()`, the small print under a block.
- **`topic-prep.ts`** — the "Before the first session" guide, as a *section* rather than a mail: `buildTopicPrepSection(t, plan)` returns HTML blocks a mail splices in, and `topicPrepText(t, plan)` the plain-text lines beside them — both from a plan the caller resolved **once** through `resolveTopicPrep`, which is what stops the body and its twin from stating differently filtered documents. It exports no `build*Email` and is in no registry, which is what keeps the house-style sweep from looking for a mail here. It composes nothing of its own: the steps come from the product topic registry and the prose from the `topicPrep` namespace, so this and the app's own component render one guide rather than two. There is nothing to compose where nothing applies — a topic with no guide, and an in-person product whose every step belongs to a machine School of Gaming is supplying, are the same answer from a mail's point of view, and the resolver gives it as `null` before either builder is reached. The rules behind the guide (the About/Prep split, the step scopes, the single voice) live with the component, in `src/components/topic-prep/CLAUDE.md`.
- **`session-photos.ts`** — the session report's photo column: the box arithmetic, one photo's toned well, and the one-per-row table they sit in. A module rather than a block in `blocks.ts` because one mail wants it and because a picture's box is arithmetic with rules of its own, which a template composing documents should not carry. The pairs it used to emit wanted a stacking rule in the stylesheet, and one photo per row is the same arrangement at every width — so it names no selector of its own and the shell imports nothing from it. The well's tone follows the shell's ground like the two other surfaces that have to, through the shared mechanism described under "Images" below. See "Images" for what the boxes are for.
- **`markdown.ts`** — `renderMarkdownForEmail(markdown, useCase)`: stored markdown (a gedu's session report) to an inline-styled HTML fragment. **Authored markdown is the one place a mail does not set its own type**: it takes the app's markdown style, defined with the use cases in `src/lib/authored-markdown.ts` — owner's ruling, the report reading the same on the site and in the inbox — and the mail's own type is built around that style rather than beside it (see "Type and spacing" below). The caller passes the use case the app renders that field under (`feed` for a report), and the renderer emits what the app emits for it — the same elements under the same outline tags, the same words, links kept or reduced to their label by the same rules and the same URL transform — which a unit test checks against the app's own render, use case by use case. A value a mail client cannot honour is noted as an accepted gap beside it in the definition, not here. Address-shaped text gets a zero-width word joiner after each dot, because a mail client linkifies `evil.example/x` where a browser does not; every text node is escaped, and it is a string walker rather than a React render because the registry it sits behind is imported by a client page.
- **`components-reference.ts`** — the house style for mail, and the first entry in the registry. What `/admin/ui-components` is for the app, this is for email: the palette, the button variants and both shapes of the button row, the text helpers, the facts block, rendered markdown with and without links, the photo column and the callout panel, all rendered by the real helpers, in a form we have checked actually arrives. Its photos are the session report's demo art, handed in by the registry. See "The reference is the style guide" below.
- **`fixtures/`** — sample data the testing UI feeds a template whose live send reads a row this tool has no reason to touch: two invented session reports, one written in English and one in Finnish, that between them use every control the gedu editor offers, a count-selected set of demo photographs (the same committed preview art the app's scenes use, ordered landscape–portrait–square so a small count is already mixed), and two demo spotlights on art cut to the spotlight picture's stored 1200×600. Invented on purpose — real reports name real children — and fixture, not copy: never shown outside `/admin/testing`, never translated. The photo fixtures exist because how a column of pictures lands in a real inbox, blocked and unblocked, is the one thing no test can settle, and they are JPEGs for the same reason the real photos are: no client renders SVG, so demo art in that format would be checking a render the product cannot produce. The demo art resolves against the render's own origin; see "Where a render is going" below.
- **`render-context.ts`** — `EmailRenderContext`, the origin a render's demo art and the components reference's example links resolve against.
- **`attachments.ts`** — `RenderedAttachment` (a name, base64 content, and the decoded `text` a preview shows) and `textAttachment()`, the encoder both ends of the registry can run. See "A mail that carries a file" below.
- **`form-fields.ts`** — how a template turns the admin testing form's strings into values: the date, time, number, URL and email checks, the textarea splitter, and the yes/no vocabulary. One module rather than one per template, so a malformed date earns the same sentence whichever form it was typed into — and the sentence names the field, because the testing page shows a thrown message verbatim and the send route answers with it.
- **`product-confirmation-invitation.ts`** — the signup mail's half of the calendar work: a product's schedule as one `InvitationInput`, plus the sentences the *document* states. Its dates are the database's plan, handed in rather than worked out here: the live send reads `planned_session_dates` over the span this module names, and the admin testing form, having no product row, stands in with the plan of a product no day has been taken out of — so a test send never states an `EXDATE`, even when its holiday-breaks field fills the mail's break lines, and the unit tests are where that shape is exercised (`src/lib/calendar-invitations/CLAUDE.md` has the mapping). It lives here rather than under `src/lib/calendar-invitations/` because it knows what a club is, which that module deliberately does not — see its `CLAUDE.md`. Pure, `now` is an argument, and it runs in a browser bundle like everything else on the registry's path. **What the entry's own `DESCRIPTION` states is a shorter list than the mail's, and the gap is the point**: where it happens, the My SOG link, the product's short description, and how to reach a human — in that order, because the entry is read on the way somewhere and the place and the link are what a parent opened it for, while the marketing sentence is the paragraph nobody opens a calendar for. Three things the mail states are deliberately not among them, each for its own reason. The schedule in words: a client draws the recurrence, the clock face and the zone out of the properties themselves and re-draws them when a later message moves the run, so a sentence beside them is the copy that goes wrong. The sentence saying where the sessions are: it is the mail's "what happens next" bullet, and the entry already carries the My SOG link that sentence points at. And the opening sentence naming who is signed up for what: the entry's own title says it, and a reader is looking at that title while they read the notes — the mail opens with it because a mail arrives among fifty others and has to say what it is about, which an entry in a calendar does not. **The mail's schedule words are not composed here either**: the mail prints the schedule lines every product surface prints, through the shared formatter in `src/lib/products/`, so one product's schedule has one rendering, and this module composes the document alone.
- **`translator.ts`** — `getEmailTranslator(locale)` returns an `EmailTranslator` (`t`) scoped to the `email` namespace (`messages/<locale>/email.json`). Every builder takes `t` and `locale`; no user-facing string is hardcoded in a builder. It also returns a second, narrower translator, `getTopicPrepTranslator(locale)`, scoped to the top-level `topicPrep` namespace. **A namespace is a translator's whole world**, so a mail cannot reach a key outside `email` — and the one document a mail shares word for word with pages the app renders had to have exactly one home. Copying it under `email` would put the same paragraphs in the catalog twice, in five locales, with nothing asserting they still agree; a one-line sentence the mail shares with a page lives with that cost, a multi-paragraph guide should not. A builder that needs both takes both. Each loads only its own namespace (`src/i18n/CLAUDE.md`).
- **`registry.ts`** — `templateRegistry`: the single source of truth for templates that are exposed to the admin testing UI and the test-email API route. Each entry is built with `defineTemplate({...})`.
- **Per-template builder files** (`password-reset.ts`, `pin-reset.ts`, `help-request.ts`, `welcome.ts`, `gamer-welcome.ts`, `product-confirmation.ts`, `verify-email.ts`, `session-report.ts`, `seat-offer.ts`, `seat-offer-staff.ts`, `calendar-invitation.ts`) — exported `build*Email(t, locale, ...)` functions that compose the `utils`/`blocks` helpers inside `wrapInLayout`. `gamer-welcome.ts` is the child-facing welcome mail carrying the verification link. `seat-offer.ts` is the only mail whose `ctaButtonRow` fills one of its halves: a family is asked whether they can still take a seat that has opened, and Accept and Decline are alternatives rather than a first and second choice. The pair is ordered by the app's own footer convention — negative first, affirmative last, so Accept is the right-hand cell — and the mail's one `primary` button is neither of them but My SOG, the in-app path to the same question. The same file holds the child's copy of the offer as a **second builder with a smaller option set**: no accept or decline URL, no answer buttons, one My SOG button at the child's root — see "Family mail" below for why the token can never reach it. **`product-confirmation.ts` carries one button, not a row**: the confirmation page offers a way back into the shop under its My SOG button because its reader is still standing in the shop, and a reader in their inbox is not standing anywhere. So the mail carries the one action it is asking for, which frees it to take the `primary` brand fill a row forbids, and it closes on one line the page has no use for: that a reply reaches a person, which is true because the send's Reply-To is the support inbox, beside the support address for a forwarded copy whose reply would not. Its child's copy is a **flag on the same builder** rather than a sibling: the two documents differ by a greeting, the price row and the billing bullets, and everything else — the product's own facts, the calendar file — is the same mail. `seat-offer-staff.ts` is the same variant shape as the session report's staff copy — one builder, two reasons (a family declined, or the window ran out), both reachable from `/admin/testing` through a select, because a variant nobody can send themselves is a variant nobody checks. **Everything the two reasons share is written to be true of both**: the reason lives in the subject, the heading and one sentence, and the rest of the mail says only that the offer is over and the seat wants the next family — shared copy that narrates a decline turns the no-answer mail into an accusation. `session-report.ts` is sent by `POST /api/gedu/sessions/email-report`, which renders it once per active participation in the recipient's locale and once more as the staff copy (to the sending gedu, the group's name in the child's slot, and in CC only the admins who turned on "Copies of session reports" under Email in the Notification preferences card of their own settings page — Brevo bills each recipient, so an admin who never answered receives none). The staff copy is a **variant of the same builder**, not a template of its own: it takes a flag and opens with a banner saying it is a copy and that each family's mail was addressed to them alone — the mail answering, before anything else, the misreading its own To and CC keep provoking. The variant is reachable from `/admin/testing` through a select, because a variant nobody can send themselves is a variant nobody checks. It is also the one mail whose content is partly pictures: a session's photos sit under the report, and the staff copy carries exactly the set the families were sent, because it is the same mail behind a banner. **It ends with every enabled spotlight** (`src/services/spotlights/`), newest first, in the family mail and the staff copy but never the child's (see "Family mail" below): each a picture through the photo column, a `subheading()` title and a markdown body under the `spotlight` use case, laid out open rather than boxed, since the shell is already the card, with a hairline above each one. There is no heading naming them as a group: a picture and a title already say what each one is, and a group heading over ruled-off items read as the first one's alone (owner's ruling). The route reads them once per send and resolves each reader's version; a failed read is logged and the report goes out without them. A third variant of the same builder is the child's own copy — the framing sentence addressed to the child and no spotlights, everything else the same bytes — sent under the "Family mail" rules below and, like the staff copy, reachable from `/admin/testing` through the same select. `calendar-invitation.ts` is one of the two mails that carry a *file*: an `invite.ics`, built by the pure module under `src/lib/calendar-invitations/` (which owns its own `CLAUDE.md`) and attached rather than drawn. **It is a laboratory rather than a product mail** — the calendar invite explorer, whose form has a field for every iCalendar property Google Calendar, Apple Calendar and Outlook all honour, so a difference between one send and the next is a difference in exactly one property. The mail around the document is incidental and composes nothing from it: a typed subject and a typed body, in the shell. It is in the shell rather than a bare paragraph precisely because of the sweep below — a mail that opted out would be the one render none of the house-style checks reach — and it is the one template that carries no copy of its own at all: both strings are typed into the form by the admin sending it, so there is nothing to translate and nothing for a message file to hold. (`components-reference.ts` is untranslated too, and for the other reason — it has copy, deliberately literal English, and it is the one entry that takes no params.)

## Sender identity

**Rule: every email sent from this codebase is from the same address and the same display name — `SENDER_EMAIL` and `SENDER_NAME` in `src/lib/constants/brand.ts`, with no per-template or per-route override.** The name is one literal, deliberately *not* translated: it is the company's mark, and a recipient who has learned to recognise it in an inbox list should keep recognising it whatever language the body is in. Locales translate the copy around a brand name, not the name — the same reasoning that keeps "My SOG" untranslated. A template that wants its own sender is a template arguing the reader should not be sure who wrote to them.

**The sender is the brand alone; the `School of Gaming – Sogverse` lockup lives in the layout's header instead.** An inbox list truncates the sender column hard, and a half-eaten lockup reads worse than the short name that always fits — while the header has the full width of the card and is the first thing inside the mail, so it is where both names get stated. Changing either half means changing the other's justification too: they are one decision about where each name earns its space, not two strings that happen to differ.

**The lockup is `BRAND_LOCKUP` in `src/lib/constants/brand.ts`, and the header is the one place that does not emit it whole.** The two names are set in two colours, so the header builds itself from `SENDER_NAME` and `BRAND_LOCKUP_TAIL` — every character of the lockup, the en dash above all, still comes from the constants module, and a unit test asserts the two spans read as `BRAND_LOCKUP` exactly. Do not type either name, or the separator, into this directory's markup.

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

## Family mail goes to the parent, and to a child who holds a mailbox

**Rule: we never write to a child alone. Every mail about a seat goes to the parent — the linked parent for a child's seat, the adult themselves for a seat held in their own name — and a seat with no parent contact produces no mail at all, whatever the child holds.** The parent's mail is the outcome: it is what a send counts, what a retry is about, and what a staff copy is a copy of.

**Rule: the child receives their own rendered copy when, and only when, their sign-in is their real email address.** A parent chooses how each child signs in; one of the three choices is the child's own email address, and the other two are a platform-internal handle no inbox answers. The mode is the whole test, it is re-checked on every send (a parent switching the child back takes the copy away with it), and a self seat is unchanged: there is no child to copy.

**Verification is deliberately not part of that test.** The address is typed by the parent and only proven when the child follows the verification link, and requiring the stamp was a special case this one role carried alone — it withheld the copy exactly where it is most useful, on a confirmation sent moments after the parent created the account, before the child had clicked anything. Children cannot be relied on to verify, and the parent is a recipient of every one of these mails regardless, so an unverified real address receives the copy.

**Rule: per recipient, never one mail with two addresses.** The parent and the child each get a separate send, rendered in that reader's locale and addressed to them — no CC, no BCC. A mail cannot be in two locales at once, and a copy is a different document: the child's framing sentence is written *to the child* where the parent's is written to the parent *about* the child, and the child's button goes to their own My SOG root, because role routing bounces a child off a `/parent` link.

**Rule: nothing only a parent can act on goes in a child's copy — above all, never a parent-only token.** The seat offer is the case that makes the rule: only the parent may accept or decline, and the links that do so carry a signed credential, so the child's copy is a separate builder with no answer buttons and no parameter that could hold one. It states the offer and that the parent decides. The signup confirmation drops its price row and its billing bullets for the same reason. Where a child's copy needs a variant, that variant belongs to the *template* (a flag or a sibling builder), so every caller renders the same child copy rather than deciding per surface what a child may see.

**Spotlights are left out of the child's copy of the session report.** They are what we put in front of the parent, and the child's copy carries the report only. The builder's child variant draws none whatever it is passed, so no caller can put them back.

**Corollary: the test is who may act, not what looks parental — so the child's confirmation carries the calendar file.** A child with a mailbox has a calendar, and the sessions in it are theirs; withholding the `invite.ics` would be treating "the parent got one" as a reason the child may not. It is the **same calendar object** in both copies — one identifier, keyed on the seat rather than on the reader, so the two are one event seen by two people and a later update or cancellation is one message rather than two to remember. What differs is the **attendee**, which is that copy's own reader: a client offers the RSVP only when the attendee matches the mailbox it is reading, so the parent's document names the parent and the child's names the child. The entry's title follows the same reader rule the mail's sentences do — it names the participant only when the reader is not the participant, so a child's own entry is titled by the product alone, exactly as an adult's own seat is.

**Rule: a gedu never sees a child's address.** The roster resolves a child's seat to the parent's contact whatever the child's own sign-in is, and the family-mail rules above change nothing about that; a mail we send *to ourselves* about a child — a help request from a gamer account — keeps the parent as its Reply-To and may name the child's own address in the staff-facing note, so an admin can include both.

The decision of *who* lives in one shared resolver beside the Brevo wrapper, outside this directory (it reads profile rows, and builders here take no DB access); each builder decides *what* its child copy carries.

## Conventions

**Rule: Builders return HTML strings only — they never send.** A builder takes `(t, locale, params)`, composes `content`, and returns `wrapInLayout(...)`. Sending is the caller's job (an API route) via `sendTransactionalEmail()`. Keep network and DB access out of this directory.

**Rule: a value that needs locale-aware formatting arrives already formatted.** A price, a date, a duration — the caller has the currency config, the product row and the viewer's zone; the builder has a translator and a string template. Passing the formatted string in keeps the builder a pure composer and keeps one formatting rule per value instead of two.

**Rule: All user-facing copy comes from `t(...)`, never string literals.** Add the key to *every* file in `messages/` (see the `src/CLAUDE.md` i18n rules — best-effort translation for all locales, fun takes for `tlh`, no emoji). Compose translated copy with helpers, e.g. `t("x.body", { gamerName: styledName(name) })`.

**Rule: Escape every value that originates from user/DB data before putting it in HTML.** Use `escapeHtml()` (or a helper that escapes internally — `styledName`/`styledProductName` already do). The one safe exception is app-generated URLs (reset/setup links): they are embedded unescaped in `href` by design, and the code comments say so. Do not extend that exception to anything a user can influence.

**Rule: Colors come from the shared constants, not Tailwind/hex literals.** Email HTML can't use semantic Tailwind classes, so import `BRAND` / `DARK_THEME` / `STATUS` from `@/lib/constants/colors` and interpolate them into inline styles. This is the email-context equivalent of the repo-wide "no hardcoded colors" rule.

**Rule: a template is composed from the helpers in `blocks.ts`, `utils.ts` and `markdown.ts`, and writes no styled markup of its own.** The helpers carry every Gmail workaround (the pins, the holds, the framed edges — "Gmail: what it does to a colour" below), and a hand-rolled paragraph, border or coloured span carries none of them: it looks right in a browser and on Android and breaks on Gmail iOS. When a mail needs something no helper makes, the work is a new helper that follows those rules, a specimen of it in the components reference, and a device check of the reference (the four places listed under "How a change to the Gmail rules is verified") — in that order, before the template uses it. The house-style test renders every registered mail and fails on a plain neutral outside a hold, or a fill, picture or coloured text inside one, so a new template is caught by a registry entry, not by review.

## When a mail carries bad news

A hard moment is a mail about money gone wrong, a mistake of ours, or anything else the reader opens already unhappy. It has its own register, and these four rules are it.

**Rule: the admission leads.** The first sentence says what happened and whose fault it was, in the plainest words available — "we charged you twice. That was our error." Not a greeting, not thanks for the reader's patience, not a paragraph of context for the admission to hide behind. A reader who has to hunt for what went wrong has learned that we would rather they did not find it, and they read the rest of the mail in that light.

**Rule: one remedy, one deadline, one escalation path — exactly one of each.** What we are doing about it, when it will be done, and how to reach a human if it is not. Two remedies make the reader do the deciding; no deadline leaves "we are looking into it" as the whole message; no escalation path hands them a mail they cannot answer. Three sentences normally carry all three.

**Rule: no apology inflation.** "We sincerely regret any inconvenience" never ships from this directory. One apology, in ordinary words, attached to the specific thing that happened — inflation is what turns an apology into a form letter, and a reader who has just been charged twice can tell the difference at a glance. "Any inconvenience" is the tell: it hedges about whether there even was one.

**Rule: Level 0 carries no lore.** Money and mistakes are written in the brand's plainest register — no Yty, no Princi-Pal, no world vocabulary, no jokes. The world is what we offer a child; a parent looking at an unexpected charge is not in it, and a flourish there reads as a company enjoying itself at the reader's expense.

**This register governs hard-moment mail written from now on; it does not retrofit existing copy.** In particular the duplicate-payment confirmation stays minimal (owner ruling): under our Stripe integration a duplicate payment is very nearly impossible, so elaborating that state — in a mail or in page copy — advertises a fault the integration does not have and sets a lower expectation than the truth. The two are not in tension: one is the register for a mail somebody writes tomorrow, the other is a ruling about one string that exists today.

## An email is the web app's style, in someone's inbox

**Rule: a mail is not styled, it *inherits*. Every value it uses is the app's value, and where a value has a name in `globals.css` the email uses a constant that mirrors that name — never a literal that happens to match today.** A parent meets us on the site and then in their inbox, and the mail has to read as the same product rather than as something built by someone with the brand guidelines open. `colors.ts` is the mirror, and its header says so; the discipline is to keep it complete, because the failure mode is silent. Two values that agree by coincidence look exactly like two values that agree by design, right up until one of them moves.

**Corollary: a fill and the foreground on it are one decision and are named together.** `BRAND` carries `actForeground` and `worldForeground` alongside the fills for that reason. The brand colours are mirror images — act is light and reads only under a dark label (`#121212`, 9.6:1; white on it is 2.0:1), world is dark and reads only under a white one (`#ffffff`, 6.4:1; the dark label is 2.9:1) — so a button that swaps its fill and keeps its label has not been recoloured, it has been broken. That is the single most tempting wrong edit in this directory, which is why the pairing is a table in `BRAND` rather than two values a caller picks from, and why `palette-contrast.test.ts` fails if either wrong pairing ever clears AA.

**Corners mirror the same way colours do, through `RADIUS` in `src/lib/constants/radius.ts`.** Both email radii had drifted off the app's scale — buttons at 8px against `rounded-md`'s 6px, and the message panel at 12px against a `Card`'s 8px — and neither was legible as a difference while it was a literal. A number typed into markup cannot disagree with anything; a number named after the token it mirrors can. There are no radius literals left in this directory, and a new one is a bug.

**Where the mirror is imperfect**, so nobody has to rediscover it:

| | app | email |
|---|---|---|
| Body font | the app face, loaded as a webfont | the mail face — the reader's own system sans, **and no webfont ever** |

**Rule: a mail is set in the mail face, and the mail face comes from the library through the constants module beside the palette — never as a family typed into a template.** The mail face is the reader's own system sans, declared once by the UI package and spent by this directory alone; the stack is emitted once on the shell and everything under it inherits. **No mail loads a webfont, and none ever will.** The clients most readers use — Gmail, Outlook, Yahoo — load none, so a declared family would reach a minority and the mail would be two designs rather than one; it is also a request to a third party on every open, which is an open-tracking beacon in a mail whose whole subject is trust; and Outlook on Windows answers a missing declared web font with Times New Roman rather than with the next family in the stack. **The Word engine gets its own resolvable stack**, from the same library face and derived beside the first: Outlook on Windows renders through Word, which does not walk a font-family list at all — it takes the first family and falls to Times New Roman where that family is not installed, rather than to the next entry — and the primary stack opens with names that exist only on Apple platforms. So the shell's head carries an `mso`-conditional block restating the same face in a form every entry of which resolves on Windows, on the elements the templates set text in; no other client reads it, no template writes it, and it loads nothing. The library's doc comment on the face holds the rest of the reasoning. Anything else you find where the mirror is imperfect, fix or list here — an unlisted difference reads as an accident, and this table is what makes it a decision.

**`password-reset.ts` and `pin-reset.ts` used to hand-roll `ctaButton`'s markup, and it is worth knowing what that cost.** Correcting them piecemeal — the radius here, the label token there — made them *look* corrected while both were still missing the gradient fill and the dark label's pin, i.e. both halves of the Gmail work. The two mails where a broken button means a locked-out account were the two most broken mails we had, for months, in a directory whose own doc called it done. They now call `ctaButton`, which is the only durable form of the fix: a copy cannot inherit tomorrow's correction. **Prefer a helper over its output, always, and treat "I corrected the copy" as a smell rather than a fix.**

## Type and spacing

**Rule: a mail is built around the authored-markdown scale, and every text style in it is either a markdown value or SOG-UI's own step for that role.** A session report is the largest block of writing most mails carry, and the markdown definition is not restyled for mail — so the mail fits itself to it: its body *is* the markdown body and its title *is* the markdown top heading. Where markdown has no element for a role, the level is SOG-UI's step for that role. Both are read from their sources by the mail's type table (`type-scale.ts`), and a helper sets text only through `mailText()`, which states colour, size, leading and weight on the element itself, because Outlook's Word engine gives a `<p>` or a cell its own default size rather than its parent's.

| Level | Size / leading / weight | Read from | Used for |
|---|---|---|---|
| title | 24 / 1.3 / 700 | markdown top heading (SOG-UI `section`) | a mail's opening heading; a mail section heading |
| subtitle | 20 / 1.375 / 700 | markdown second heading | a second-rank title inside a mail section |
| body | 16 / 1.625 / 400 | markdown container | paragraphs, list items, fact values, callout sentences, a quoted message, the shell's content |
| lead-in | 16 / 1.625 / 700 | body, at markdown's strong weight | the bold line that introduces a list or block |
| action | 16 / 1.625 / 700 | SOG-UI `cta` size and weight | button labels — at the body's leading, since a half-width label wraps by design |
| small | 14 / 1.5 / 400 | SOG-UI `body-s` | fact labels, the callout label (in bold), the footer, staff-facing notes |

**Two weights and no others**, because the mail face draws only 400 and 700: a 600 anywhere upstream is asked for as 700. Small type is set in the muted ink, and in sentence case; the callout label alone keeps uppercase and its tracking, as the app's Alert label does. Names in a sentence are bold in the body ink, a person's exactly like a product's — brand colour stays on the header and the button fills.

**A report's headings are never capped to make room for the mail's.** The mail's title and a report's top heading are the same size, and the tie is resolved by structure and by the outline: a mail section heading always opens with a hairline rule and the space around it, which a report heading never has, and the mail's heading is an `<h2>` where the report's top level is painted as an `<h3>`. The session report carries no visible title of its own.

**Rule: spacing is markdown's, as one rule, and every block states its own.** The steps:

- **4** between the items of a list;
- **8** between a lead-in and what it introduces, and between photo rows;
- **16** between blocks inside one unit — paragraphs, a list, a button, a heading and its body, a picture and its title;
- **24** around structural furniture — the fact list, the callout, the photo grid — and on both sides of a hairline rule, which states its own top margin rather than inheriting whatever the block above it left.

A block carries the space below it, and furniture and the rule state the space above them too, which a browser-based client collapses with the block above rather than adding to it. Compose blocks adjacently and add nothing between them.

**A lead-in over furniture is placed inside the furniture's own spacing, never stacked above it.** A label's 8 meeting the furniture's 24 collapses to 24 in a browser and adds up to 32 in Outlook, and neither is the 8 the rule asks for. So the pair is one piece of furniture: a wrapper states the 24 on both sides, the lead-in sits inside it with its 8, and the block under it carries no margin of its own — `factList`'s `leadIn` option is that shape, and the session report's photos section builds it by hand.

**The block that opens a mail sits flush.** Furniture states 24 above itself, and as a mail's first block that space is not collapsed into anything, since a table cell's first child keeps its top margin. So it only pushes the mail down from its header. A callout that opens a mail is set with `opening`, which drops its top margin.

**A mail section opens with `hairlineRule()` followed by `heading()`, and the rule's 24 stands in for markdown's 32.** Markdown puts 32 above a top heading because it has no rule to mark the break; a mail section heading has one, and the rule's own space on both sides already sets the heading further from what is above it than a report's top heading ever sits. Adding the 32 under the rule would float the heading away from the rule that belongs to it, so no mail emits it.

A list indents with a `margin-left` and zero padding, as the markdown definition's mail half does, because Outlook's Word engine ignores `padding-left` on a list.

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

## The signup confirmation mail is the record; the page is the reassurance

**Rule: `/shop/confirmation` and `product-confirmation.ts` have different jobs, and
neither is held to the other's contents.** The page is the few seconds after checkout and
fits on one phone screen: that it worked, the key facts of what was bought (picture,
name, schedule, where, the start, one money line), that a confirmation email is on its
way and to which address, and the one next step. The mail is the record a parent keeps
and comes back to: who holds the seat, the full schedule and term, who it is for, its
language, holiday breaks, the price and billing detail, what happens next, the "Before
the first session" guide and the calendar invite.

**Who is signed up for what is said once in the subject and once in the sentence under
the heading, and nowhere else.** The facts list opens on the schedule, with no rows naming
the product or the participant and no label over it: a third statement of the same fact
would be the first thing the list says, and the sentence directly above is what
introduces the list.

**The inbox preview is the first "what happens next" line, as plain text.** The subject
already says who joined what, and an inbox shows the preview beside it, so the preview
line adds the next most useful fact instead of restating the subject: the first session's
day and time, or on a waitlist join that we write the moment a seat opens. It is composed
from the same plain-text values as the text twin's list, so it cannot disagree with the
body.

**"What happens next" opens on the seat's first session** — its weekday, full date and
time — so a parent never has to work it out from the schedule row. On an event the line
says when the event is, in one form for every reader, since it names nobody. It is the first planned
session that has not yet begun, which is the product's start only for a seat taken before
the run begins; a seat taken mid-term starts at the next session. It is read from the
calendar invitation's own input by the same rule that picks the entry's first occurrence,
so the mail and the file cannot name two days, and it is written in the product's zone
with the short zone name always beside the time, like the schedule row. The time is the
schedule row's own fixed 24-hour clock face, not the locale's, so one mail states one clock
style; the date is the locale's. A waitlist join,
a send with no plan to read and a product with nothing ahead state no such bullet. Next,
on a remote product, comes how the sessions are joined — online in My SOG, through a
voice room that opens a stated number of minutes before each one, the number read from
the voice room's own constant like the calendar entry's; an in-person one says where they
are listed. The money follows, on the parent's copy alone: the deferred first charge, the
price-shape line and, on a subscription, the terms' 30-day money-back guarantee, worded no
wider than the terms. Only a consumer club is ever bought on a subscription, which is what
lets the mode carry the club guarantee. A fact the mail states and the page
leaves out is the design, not a gap — the page grows a fact only when a parent needs it
in those seconds.

**The page names the mail's recipient, so the two must agree on who that is.** The mail
always goes to the payer's profile address; the page shows that same address, and only
when the payer is the one reading, since nobody else can read it. A change to who receives
the mail is a change to the page's line too.

**Rule: a fact both surfaces state is formatted by one function, and that function lives
in `src/lib/products/`.** The schedule lines and the "where" line are the shared rules,
imported — a second rendering of a product's schedule in this
template would let the mail and the page disagree about when a club meets. A
sentence both state, such as the price wording or the subject's enrolled/registered verb,
is still two strings in the catalog, because the email translator is scoped to the
`email` namespace; editing one is editing half of it.

**The "Before the first session" guide is the one text the mail shares word for word
with the app, and it is why this mail takes a second translator.** It shares the guide
with the My SOG enrolment cards, so both read the top-level `topicPrep` namespace and the
mail loads a translator scoped to it beside its own. It renders on the enrolled outcome
only — a waitlist join has no seat and so no first session to be ready for — and on the
child's copy as well as the parent's, because the guide is one text written to read the
same to both. It sits after "what happens next" and after the button, before the closing:
the list says when the first session is and the guide says what to do before it, and the
guide runs to a few hundred words, so above the button it would push the one action the
mail asks for to the bottom of a phone screen. A render handed no second translator
states no guide rather than half of one.

**What the mail does because it is a mail:**

- It closes by inviting a reply: a mail can be answered and a page cannot. The line is
  true because this send's Reply-To is the support inbox, so it goes wherever that does —
  a send that took a Reply-To of its own would have to take the sentence with it. It
  names the support address beside the invitation, because a forwarded copy's reply goes
  to whoever forwarded it; the address is displayed and defused rather than linked, like
  every address a mail here prints.
- It attaches an `invite.ics`. **The mail says nothing about the file**: a client that can
  act on one renders the invitation itself, with its own accept/decline, so a sentence
  announcing it underneath is the mail narrating its own attachment list to a reader who
  is already looking at the thing.
- It renders the schedule in the **product's** zone and **always** decorates the
  time-bearing line with that zone's short abbrev, because a mail has no viewer zone —
  parents store none, so the reader cannot infer which zone the times are in. The page
  renders in the viewer's zone and names it only when it differs from the product's. Same
  formatter, same line, one option (`nameZone`). Not a sentence: a translated zone name
  was tried and reverted — CLDR has no generic long name for every zone in every locale,
  and where one is missing `Intl` silently returns a differently shaped string that
  splices a label and a colon into the sentence around it.
- It states no waitlist position: a queue number frozen into an inbox goes stale the
  moment somebody ahead drops out.

**It carries no product picture yet.** The picture is not ruled out by the images rule
below: every picture uploaded for the `product` purpose is a JPEG of exactly 1200 × 800,
measured and enforced by the upload routes (`src/services/catalogue-images/CLAUDE.md`), so
its box can be sized from the purpose alone. It is simply not built. Entries uploaded
before that enforcement may still be another size or format until corrected by hand, so
the cell, when it lands, draws a fixed 3:2 box and lets such a picture fit inside it.
Until then the mail states no row for it, and leaves no hole.

## Images: one that may vanish, and some that carry the content

**Rule: images are off in a large share of inboxes, so the blocked render is a normal render, and every mail here is composed to survive it — but what "survive" means depends on whether the picture is decoration or content.** There are two kinds now, and it is worth being precise about the difference, because the wrong guarantee applied to either one is how a mail ends up with a hole in it.

- **Decoration duplicates something the mail already says**, so a blocked render loses nothing at all. The header's brand mark is the case: the lockup right beneath it names both the brand and the platform whether or not the badge arrives.
- **Content does not, and cannot.** A session photo is a picture of a build a child made, and no `alt` string stands in for it — a mail whose images are blocked is genuinely missing something. So the guarantee that is available is the other one: **nothing may be *broken* by the absence.** The layout is whole, every box is already the size it will be, and the reader who turns images on gets pictures in holes that were the right shape all along.

**Rule: an image's drawn size is arithmetic from dimensions the sender already holds, under a height budget — never from anything measured, and never a frozen pixel width.** The stored width and height are on the row beside the photo for exactly this. A picture is laid out fluid — full width of whatever column the client gives it, its height derived from its own ratio — under a `max-width` that is the height budget spent at that photo's ratio, and never above the stored width, since upscaling a stored JPEG only makes it soft. The height budget is the load-bearing half: without it a portrait reserves a screen and a half of empty grey for one picture, which is the render this rule exists to prevent. A fixed pixel width is the other failure and the one this replaced — a box sized for the narrowest client is a thumbnail everywhere else, and mail has no `object-fit`, so a picture stretched to a rounded box is a picture subtly the wrong shape.

**Corollary: a fluid picture still states the narrowest client's box in pixel attributes, because one engine reads no CSS.** Outlook on Windows renders through Word, which honours a `width="100%"` attribute literally and ignores `max-width` on the image and on the table around it — so a picture with only the fluid style beside it arrives there at the full column whatever its shape, which for a tall portrait is a metre of tower and for a small stored picture is an upscale. The attributes therefore carry the box that picture has at the mobile design floor, which is exactly the layout the card-less shell already gives that client; every CSS-capable client overrides both with the style. It also makes the blocked render's image box and the well behind it the same rectangle rather than two.

**Rule: the reserved box is painted, and it is painted by a cell rather than by a background on the `<img>`.** A cell paints whether the image is blocked, deleted, still in flight, or stripped out of the document altogether — the same rectangle in all four cases — while an `<img>` that a client removed takes its own background with it. The fill is declared twice like every other background here, its tone comes from the palette through the ground-following table below, and the picture carries the cell's radius so the loaded and the blocked render have the same corners.

**A fill chosen in relation to the ground follows the ground, and the shell has two of them** — the bare ground on a phone, the card above the breakpoint. There are exactly two intents and one mechanism for both: a surface that reads as a tone *off* the ground (a photo's well, a quoted message) and a surface that means to *be* the ground and has to paint it because something else is painted underneath (the inside of a box whose edge is a fill, such as the callout). A surface that merely sits on the ground paints nothing — the outlined button. Each takes its inline half and its class name from one table, and the shell's own media query builds both rules from the same table, so a colour and a selector each live in one place. The inline half is always the phone's, which is what keeps this a re-tone rather than a layout the stylesheet is holding up: strip the block and every one of them is correct on the only ground a client that dropped it will draw.

**Corollary: a reserved well is sized for the narrowest column, because a cell's height is a minimum.** Every client treats a table cell's `height` as a floor rather than as a fixed size, so the number to state is the smallest correct one — the height the picture has at the phone's content column, which is the mobile design floor less the shell's two gutters. A loaded picture on a wider column simply grows past it and the cell grows with it; a *blocked* one leaves a well that is the phone's height and the column's width, which is a shorter hole than the picture would have filled anywhere at or above the mobile design floor. Below the floor it can run slightly taller — a 320px viewport gives a 288px column, where a 16:9 well overshoots its own picture by about 23px — and that is the graceful degradation the floor already licenses rather than a fault to design against. Sizing every well for the widest column is the mistake it avoids: that reserves a hole bigger than the picture on every narrow render, which is the fault this whole design is about. The accepted cost is that on a wide client a landscape photo arriving pushes what is under it down; the phone, where these are read, holds its layout to the pixel.

**Rule: an emailed image URL outlives our control of it, and the mail is a snapshot.** The URL is fetched by a mail client with a bare GET — no cookies, nowhere to type a code — so it works unauthenticated, and Gmail and Outlook proxy-cache it besides. Nothing retriggers when a photo is added after a send; a photo deleted after a send simply stops loading, which is exactly the blocked render the boxes above already handle. That is the whole of the answer, and it is enough because of them.

**Rule: `alt` is empty on every image in this directory, and for two different reasons.** On the mark, because the lockup beneath it is the accessible name and a screen reader should not hear the company twice. On a photo, because there is nothing true to write: nobody captions these, the file name is a UUID, and five repetitions of "Session photo" is noise in a blocked render and worse in a screen reader. The sentence above the photos is what says what they are.

**Rule: a builder composes no URL, image sources included.** The route resolves a photo's public URL from its row id through the shared session-image helper and passes it in; the testing tool points at committed demo art the same way. The one exception is the shell's own mark, whose origin is discussed below — a builder that started resolving storage URLs would need a notion of a bucket, which is exactly the kind of knowledge this directory keeps out.

### The brand mark, and why it is allowed to vanish

**Rule: the brand mark in the header supplements the text lockup and never replaces it.** The shell emits one image — the SOG badge, above the lockup — and the mail that arrives with it missing is the mail this directory sent before it existed: complete, headed, branded, with no hole where something was meant to be. A header carried *by* a picture makes every blocked render look broken, which is how a company's mail ends up with a red X where its name should be. The badge is the right art for that job precisely because it duplicates nothing: it is the gem and the monogram, with no "School of Gaming" in the drawing to sit above the same words in the lockup.

**Every image is a hosted file at a plain URL, and the three alternatives are all wrong here.** Clients do not render SVG; Gmail strips `data:` URIs out of `src`; a CID attachment makes every mail multipart, hangs a paperclip on it and costs deliverability. A URL the recipient's client can fetch on its own is the only form that reaches all of them — `public/` for the mark, the public storage bucket for a photo. **Format is decided by the worst renderer, not the best**: the mark is a PNG and a photo is a JPEG, because Outlook's desktop client (the Word engine) renders no WebP and this mail is a primary reading surface rather than a fallback for the app. The mark's file is 2× its display box so a retina reader gets a sharp mark, it keeps its alpha so the header's ground shows through the badge's transparent corners, and it is **regenerated from the brand SVG with sharp, never hand-edited** — the command is in `layout.ts`'s doc comment beside the constant, and it reproduces the committed file byte for byte.

**Its origin is the canonical `NEXT_PUBLIC_SITE_URL`, which is a deliberate departure from how a *link* gets one.** A link in a mail is resolved from the incoming request through `getOrigin()`, because it has to land the reader back where they came from and because the `Host` behind it is attacker-controllable. An image `src` needs neither half of that: it carries no token, it is not somewhere a reader is being sent, and a builder here never sees a request in the first place — by rule, they take composed URLs as params. What is left is the requirement that staging mail point at staging and production mail at production, and the per-environment canonical URL is exactly that value; it is also what `getOrigin` itself falls back to. The `NEXT_PUBLIC_` prefix is load-bearing rather than incidental: this module is reachable from a client page through the registry, so a server-only var would be `undefined` in that bundle.

**No origin, no image — never a half-built `src`.** An unset or malformed env yields the text-only header rather than an `undefined/email/…`: there is no absolute URL to write, and a relative one resolves against whatever page the mail is opened in. That is the same degradation as a blocked image, one level up.

### Where a render is going

**Rule: no template special-cases a dev machine or a test send.** Every image URL is absolute on the origin the mail is built for — a `localhost` one included — and nothing branches on which origin that is. An image that cannot load there leaves the layout whole, because every mail here is composed for it (the rules above): every box is already its final size and the lockup still names us. A *failed* fetch is not quite a blocked image, though — a client may draw its broken-image glyph inside the reserved box, as Gmail's proxy does for a `localhost` src. That is accepted because real mail is sent with URLs an inbox can reach, so a send produces one only from a dev machine — or later, for a picture deleted after it was sent, the rare case the boxes above already handle.

**Rule: the testing tool's demo art resolves against the render's own origin, so a send and a preview of one mail carry the same URLs.** `EmailRenderContext` is that origin, taken by the registry's `render`: the admin preview names its browser's (the dev server actually serving the art, whatever its port), and the test-send route names the request's through `getOrigin()`.

**Nothing else may key on it.** The context is not a mode, a theme, or a hook for "the local version of this mail" — a preview that differs from a send is a picture of a mail nobody receives. The shell's mark does *not* consult it: it is on the canonical origin above in every render.

**The preview surface is `/admin/testing`'s own panel**, an iframe fed the registry's rendered HTML through `srcDoc`. It is sandboxed, and `allow-same-origin` is deliberate rather than a relaxation: without `allow-scripts` nothing in the document can run, while the origin is what the inherited CSP's `img-src 'self'` is matched against — an opaque origin would block the very photographs the panel exists to show.

## The sender's inbox avatar lives in Google, and it mirrors the favicon by hand

The avatar Gmail shows beside our mail is not anything in this repo: it is the Google Workspace profile photo of the `sogverse@sog.gg` account (a real, licensed Workspace user since 2026-08-24 — created for exactly this). The photo is the favicon's gem-square art, re-rendered circle-safe: a 512px square on the app's dark ground with the art at ~72%, because Gmail crops avatars to a circle and the raw favicon would lose the squircle's left and right points to it. The org-managed "visible to people you interact with" setting proved sufficient for external recipients — no per-user visibility unlock was needed, and Brevo's sending is unrelated to the mailbox (it authenticates via DNS).

**Rule: the Workspace photo and the gem-square favicon are one mark and must be kept in parity by hand.** The photo lives in Google Admin, outside this repo, so no test can catch it drifting: any change to the gem-square art (`src/assets/brand/`, mirrored byte-for-byte by the app's icon file) is not done until the Workspace profile photo is re-rendered and re-uploaded in the same piece of work — circle-safe, per the shape above.

**The asset and the markup are one decision, and `layout.test.ts` is where they are held together.** A file served straight from `public/` is invisible to the build, so nothing else would notice it going missing, being regenerated at the wrong size, or losing its transparency. The same file asserts the property that matters most and cannot be seen by reading the markup: lift the image's row out of a rendered mail and what remains is byte-for-byte the mail sent without one.

## Layout gotchas

`layout.ts` carries a few non-obvious workarounds. Preserve them when editing the shell:

- **The header carries no gradient at all: it is the shell's own ground, with a solid violet rule under the lockup.** Gmail Android rewrites an inline `linear-gradient()` of two colours into `url(linear-gradient(...))` and breaks it, so nothing blends there — the rule is a 6px filled `td`, pinned like every other background, which is the most robust construct email has. The violet is the mail's one second colour, and it is spent deliberately: a mail is a parent-tier surface, whose colour budget is amber alone unless an intent is stated beside the site that spends it, and the intent here is the signature pair — amber and violet are the brand's own lockup, and the header is where a mail says who it is from. Nothing below the header spends a second colour.
- **The one media query lives here, and it is the exception that proves the rule below it.** A media query is the one thing that cannot be written inline, which means the shell's `<style>` is not its preferred home but its only one. What keeps that honest is the direction it runs in: **the base layout is the phone and the query adds the card**, so stripping the block leaves a complete, correct mail — a plain column on the ground, every colour, every rule and every word intact — rather than a mail waiting for a stylesheet. The clients that drop the block are not hypothetical (Outlook on Windows; the Gmail app signed in to a non-Google account), and a card in the base with a query that removed it would have failed exactly where it matters, on the phone most of these are read on. The breakpoint is arithmetic rather than a round number: the content column plus one wide gutter a side. A second query is a second thing that has to be true in a client that ignores it — the photo column used to want one and no longer does — so the count is one, and a layout that needs a rule here has to earn it by being wrong without one.

## Gmail: what it does to a colour, and the two answers

Every rule here was measured on real devices — Gmail iOS in dark and light through a preview service, the owner's Gmail Android in dark, and Gmail web — not reasoned out. The shell's `<style>` block carries both answers behind `u + .body`, which matches the render wrapper of every Gmail (the iOS and Android apps and web alike) and of no other client.

**What the clients do.** Gmail iOS rewrites every *plain* colour — a `color`, a `border-color`, a `background-color` — roughly inverting its lightness: `#ededed` ink comes back dark, the `#333` border near-white, a plain `#121212` fill light. It never touches a gradient (`background-image: linear-gradient(...)`) or an image. Gmail Android leaves dark backgrounds and light text alone and shifts some other colours. Gmail web leaves message bodies alone in its dark theme, so a mail that looks right there has proved only that its authored colours are right.

**Rule: a background an email depends on is declared twice — as a `background-color` and as a flat `linear-gradient` of the same colour (`pinnedFill()`).** The gradient is the half no Gmail touches, so on Gmail iOS it is what keeps the ground, the card, the button fills and the header rule their colour while every plain colour around them flips; the colour is the fallback for clients that ignore `background-image` on a table cell, Outlook's Word engine above all. A ground that stays put is also what the hold below lays its text back over, so this rule and the hold are one design.

**Answer one, the pin: a text colour no Gmail may shift is painted as a flat gradient clipped to the glyphs** (`background-clip:text`, with `color: transparent`), through a class from `TEXT_PINS`, and keeps its plain inline `color` for every other client. Pinned now: the brand amber (the lockup and every inline link), the dark ink on a light fill (the primary button's label, a light swatch's) and the info status colour (a callout's label) — each measured exact on Gmail iOS and Android. A pinned link states its `text-decoration-color`, or it loses its underline with its colour. An unpinned link drifts darker on Gmail iOS, so every link is pinned.

**Rule: never pin a light colour.** The pin restates a text colour as a *background*, and a dark theme leaves dark backgrounds alone while darkening light ones — so the mechanism that carries `#121212`, `#FAA901` and the info blue intact turns `#ededed` dark on Gmail Android, measured more than once: the same light colour pinned on a button, on a span and over a fill came back wrong every time, and unpinned came back right. **More protection made it worse**, and the natural next move when a pinned colour fails is to pin it harder. Pin a colour only if a dark theme would leave it alone as a background; a light colour is held instead. The house-style test lists every pinned class with the screenshot that showed it working.

**Answer two, the hold: every plain neutral is wrapped in a pair of elements that re-invert it on Gmail iOS alone** (`HOLD_CLASS`, through `holdBlock()`, `holdInline()`, `holdText()`). The outer element is screened over what is behind it and the inner one differenced against the outer, both on black. Black is the identity for both blends, so everywhere else the pair does nothing; Gmail iOS rewrites those two blacks to white like any plain colour, which turns the pair into an inversion of everything inside it laid back over the untouched ground — the inverted greys come back as authored. The helpers hold themselves, so a template composing them holds nothing by hand. Inline holds follow the line's own breaking; `inline-block` changes where the line breaks, so it is for a label that fills its box (the violet button's) and nothing else.

**Rule: a hold contains plain neutrals and nothing else.** That means the two inks, the border grey and the violet button's white. Everything Gmail iOS leaves alone is inverted by a hold instead: amber comes out blue, violet green, a photograph a negative — so no gradient fill, no picture, no pinned or brand-coloured text goes inside one. A dark plain fill inside a hold also comes out a few shades lighter on every Gmail, from the screen, so no fill of any kind goes in. And a hold never goes inside another: the inner hold's screen lands on the outer's white, screen over white is white, and the text inside both vanishes. What follows from the rule:

- **A sentence with a link is held run by run**, with the link outside every hold (`holdText()` does this for any composed text carrying a pinned link). The markdown renderer follows the same rule: a fragment with no kept link is held whole, one with links a block at a time and a linked block run by run.
- **A list carrying a link draws its markers as held text in a column of their own** (`markerColumnList()`), measured on Gmail iOS and Android dark. A list's own markers belong to the list element, which cannot be held without holding the link, and in plain ink Gmail iOS turns them to roughly the ground — the topic-prep guide's step numbers vanished. So such a list is a table: each marker (`1.`, `2.`, … or a bullet) held in a column as wide as the list's indent, each item held run by run beside it. A list of plain items stays a real list, held whole; the table costs the list's semantics to a screen reader, and invisible numbers cost more. `bulletList()`/`numberedList()` and the markdown renderer both choose the path, through the one helper.
- **A border around text is held with the text** (a hairline, the fact list, the outlined button). **A border around a fill or a picture is drawn as a fill instead** (`framedCell()`): an outer cell in the edge colour padded one pixel, around an inner cell in the ground, both pinned — the callout's status edge, a photo's well, the quoted message. The text inside such a box is held on its own.
- **The outlined button has no fill**, so the whole button — border and label — is held; it is drawn on whatever ground it stands on. In a two-up row its border sits on a table of its own inside the row's cell, so a violet neighbour's fill stays outside the hold. The violet button keeps its fill outside and holds only its white label.
- **The lockup's amber half is pinned and its tail held.** The brand mark, the header rule and every photo are never held.

**Ruled out, each by a screenshot rather than by argument** — so the next reader does not spend a round of device previews rediscovering it:

| Tried | What came back | Why |
|---|---|---|
| Leave the light text plain and trust the dark ground (what every mail did) | Gmail iOS: dark ink on the dark ground, near-white borders | The ground is a gradient and survives; the ink is plain and is inverted. Half-protected is worse than unprotected. |
| Drop the gradient pins and let Gmail iOS invert everything | A consistent, readable *light* mail | Ruled out by the owner: Sogverse has no light theme (see the next section). |
| Pin the near-white ink through `background-clip:text` | Exact on Gmail iOS, dark on Gmail Android | A dark theme darkens light backgrounds, and the pin is a background. |
| `-webkit-text-fill-color` (inline or through a class), an `rgba()` colour, a `<font color>` attribute, pure `#ffffff` | Inverted on Gmail iOS like any plain colour | Gmail iOS rewrites every plain colour form, not one spelling of it. |
| A `@media (prefers-color-scheme: dark)` rule | Never matched in Gmail | Gmail exposes no theme to the mail; only `u + .body` and plain classes reach it. |
| One hold around the whole mail | A colour negative: blue amber, green violet, inverted logo and photos | A hold inverts everything inside it, and fills, brand colours and pictures were never inverted to begin with. |
| An inline link inside a held paragraph | The link turns blue | Same reason: the amber was not inverted by Gmail, so the hold inverts it. |
| An outlined button keeping its fill inside the hold | The button reads a few shades lighter than the ground, on every Gmail | The screen blend lightens any dark plain fill it contains. |
| A CSS border left outside the hold | Near-white on Gmail iOS | A border colour is a plain colour like any other. |
| A list carrying a link with its own markers | The numbers vanish on Gmail iOS (plain ink inverted to the ground) | A marker belongs to the list element, which cannot be held without holding the link. |
| The list element set to the quiet grey so its inverted markers stay visible | Visible but grey numbers in every client | A design change, rejected for the marker column. |
| `height:100%` on the outlined half's own table, to match a taller neighbour | Gmail iOS did not stretch it | A table inside a cell does not take the row's height there; accepted, since the real labels fit on one line at phone widths. |

**What is still exposed on Gmail iOS**, so nobody takes it for an oversight: the card's own border, which the shell's media query draws above the breakpoint — a plain grey on the one cell that cannot be held, since it holds everything, so it comes back inverted.

**An outlined half of a button row can be shorter than its neighbour.** Its border sits on a table of its own inside the row's cell (the hold has to stop short of a violet neighbour's fill), so beside any half whose label wraps to more lines — filled or outlined — it keeps its own height rather than the row's. Accepted: the labels the mails carry fit on one line at phone widths.

## There is one appearance, and it is ours

**Rule: an email has no light mode and no dark mode — it has our brand's colours, and the only question about any client is whether they arrive intact.** This is the same rule the app is built on (one theme, defined once, no variants to select between), and the `color-scheme` meta tags in the shell exist to state it to clients. Framing a problem as "handling dark mode" concedes that our mail has modes and that a client is entitled to pick one; it does not, and it is not. What actually happens is narrower and worth naming precisely: **some clients rewrite colours they were not asked to rewrite**, most visibly when the reader's device is set to a dark system theme — a setting on their phone, describing their phone, not our design.

The practical difference is in where a fix is aimed. "Make dark mode look good" invites a second palette, and a second palette is a second thing to maintain and a second thing to get wrong. "Make this colour survive this client" is one job with a yes/no answer, and it is the only one we take. Letting a client turn the mail light is not an answer either (owner's ruling): Sogverse has no light theme, so a light mail is a mail we did not design.

## The reference is the style guide, and it is binding

**Rule: `components-reference.ts` is the house style for email, and every mail in this directory follows it.** It stands to mail exactly as `/admin/ui-components` stands to the app: the palette, the three button variants and the two-button row, the text helpers, the facts block, rendered markdown, the photo column and the callout panel, shown as they are meant to be used. A new template starts by reaching for what is on that page; a change to how mail looks is a change to that page first and to the mails afterwards.

**Rule: it covers every construct any template uses, and a gap is a defect in the reference.** It is the mail that gets sent to a client when a client is being checked, so a construct a template uses and the reference does not show — a helper, a shape a helper takes (a list carrying a link, markdown with links, a fact list under a lead-in), a picture — is a construct nobody has looked at in that client. A template that needs a new construct adds it to the reference in the same change.

**Rule: it is built entirely from the real helpers, and nothing on it is drawn specially for it.** That is the property that makes it worth trusting — a style guide that hand-rolls its specimens is a picture of what the components used to do, and it goes stale without anyone noticing. Because every specimen is a live call, the page cannot disagree with the code: change a helper and the reference changes with it. Adding a specimen that is not a helper call is therefore not a shortcut, it is the one thing that breaks the guarantee.

**Rule: it shows only what is correct.** No gallery of broken examples, however instructive — a reference that displays a wrong thing teaches the wrong thing to whoever skims it, and skimming is what a reference is for. What was ruled out is written down *here* instead, in prose, for the reader asking why rather than the reader looking for something to copy.

**How it is checked, and why that is a real step.** Open the mail in the client you care about, and compare it against the same mail in the desktop web client; everything on the page is supposed to look identical in both. A difference is a finding about a component, not a preference between two renderings. This is cheap and worth re-running whenever a client updates, because there is no spec to reason from — the published accounts of what Gmail does to a colour disagree with each other and describe behaviour that has since changed. **A claim about what a client does to a colour is worth what a screenshot of that client backs it up with**, and everything in this file's Gmail rules was arrived at that way rather than by argument.

**A technique that is not house style yet does not go in the shared `<style>` block.** Untried rules there ship in every mail and spend Gmail's `<style>` budget on classes nothing emits, and a rule sitting in the shell reads as adopted whether or not anyone checked it. Carry a candidate in the template that is testing it, and move it into the shell as the step that means it won. **The exception is a rule with no other home** — a media query, which cannot be expressed inline at all — and it pays for the exemption differently: not by having been carried somewhere else first, but by the layout being correct with the rule stripped out. That is a test rather than a claim: `layout.test.ts` strips the block and asserts that what remains is a whole phone layout.

**How a change to the Gmail rules is verified.** Send the components reference and check it in four places: **Gmail iOS in dark and in light**, through a preview service that renders on real devices (Litmus — reached through the owner's Engagelab account, Inbox Preview, where every client screenshot costs a credit: test an open question as one mail of labelled side-by-side variants, preview only the client in doubt, and leave Android to the owner's phone), since the reader's theme changes what that app does and the mail has to come out the same under both; **Gmail Android with the device in dark mode** (send it to yourself from `/admin/testing`); and **Gmail web**, as the faithful render to compare against. Gmail web on its own proves nothing about the workarounds — it leaves message bodies alone — and passing on one app says nothing about the other, because the two rewrite colours in opposite ways.

**Rule: brand color in an email is for the header and button fills, not for text inside a paragraph.** Inline emphasis is weight, in the body's own colour — the emphasis that needs no client to cooperate. The reference states this and demonstrates the two fills; there is deliberately no specimen of brand-coloured body text, because there is no correct version of it to show.

**World's exclusion is a contrast fact, not a Gmail one, and this correction matters.** It was recorded here as purple having "lost that fight" with Gmail's rewriting, which put the blame in the wrong place and implied the right technique could win it back. Purple text on the card is **2.7:1**, below WCAG AA (4.5:1) and below AA-large (3:1) — it is unreadable when a client renders it *perfectly*, and no fidelity technique has anything to offer that. The primary is the opposite case and the comparison is the point: orange on the card is 8.9:1, and a near-black label on orange is 9.6:1.

**So the two brand colours are not interchangeable, and world's one usable shape is as a fill under white** — which is what the app already says (`--color-world-foreground: #FFFFFF`), and what `blocks.ts` now spells as `variant: "secondary"`. Transplanting act's recipe — a brand fill under the near-black label — gives 2.9:1 and fails, because orange is a light colour and purple is a dark one. Copying a working button and changing only its fill is the specific mistake to avoid, and the variants exist so that nobody has to: the fill and its foreground travel together and cannot be paired wrongly by a caller.

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
  every font size is a level of the type scale or the markdown definition's own; every
  weight is one the mail face draws; every inline link is pinned; every plain neutral is held
  and nothing else is — no fill, picture, pinned or coloured text inside a hold, and no hold
  inside another; and every `background-clip:text` pin is on a colour **verified by screenshot**, listed
  with its evidence and date.
- **`tests/unit/email-templates/layout.test.ts`** — the shell itself: the Gmail rules its
  stylesheet carries (the hold pair, and a pin for exactly the colours in the pin table),
  and the header's two invariants, which no per-template test can see. That the lockup's two coloured spans
  still read as `BRAND_LOCKUP` exactly, and that the brand mark is additive — the image
  row lifted back out leaves the mail that was sent before it existed, the box is held
  open by attributes a client honours before it has fetched anything, the mark sits on
  whatever origin the mail is built for (a `localhost` one included), and no origin
  yields no image rather than a half-built `src`. It also reads the PNG off disk, because a
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
