# Faces adoption rulings

Temporary. The ledger for the owner's rulings on the questions the ruling page
(`/ruling` in the demo) put on screen. One entry per question. The owner rules in
shorthand, in rounds; each ruling is recorded here in full; the implementation that
applies it reads this file, not the conversation that produced it.

**The page is gone, and every entry is landed.** Every question the page drew has
been ruled and applied, so `demo/app/ruling/` holds nothing but this file: the
specimens, the Press Start section and the world-voice section were deleted with
the rulings they served, and the demo's living foundations floor is where the
faces are looked at now. **This file stays for one more step**: a fresh agent
audits every landed entry against the code — adoption step 9 — and the ledger is
deleted after that audit, in one commit before the review. Nothing here is open.

Status values: `open` · `ruled` · `landed`.

## Scope

**Faces only: which font family every site in Sogverse is set in.** Weight, caps,
italics, tracking and the type scale are the Heading adoption's and are not decided
here — several sites turn out to ask for a weight their face does not load, and those
are recorded under "What was hiding" rather than fixed.

## The regeneration command

One command, run from the repo root, listing every place Sogverse defines or spends a
face:

```
rg -n --no-heading -g '!*.md' "\bfont-(sans|serif|mono|brand-mono|cursive|display)\b|font-\[|fontFamily|font-family|next/font|--font-[a-z-]+|\b(Poppins|Crimson_Pro|Space_Mono|Dancing_Script|Press_Start_2P)\b" src/
```

**58 hits in 23 files** at the branch point. Dropping `-g '!*.md'` gives 61 in 25:
the three extra are prose in `src/CLAUDE.md` and `src/lib/email-templates/CLAUDE.md`
that name a class or a token without spending one, and the two rule paragraphs in
`src/CLAUDE.md` retire with this adoption. The command catches the three places a family
is spelled by hand (`fontFamily` in the OG cards, which satori draws without a
stylesheet; `font-family` in the mail, which loads none of ours; and `fontFamily` on
the banner's inline SVG, which CSS does reach and which merely chose the attribute)
and the family literals (`OG_FONT_FAMILY = "Poppins"`), which no class pattern would.

What the 58 are:

| kind | count | where |
|---|---|---|
| the face loads and the variables they define | 17 | `src/app/layout.tsx` |
| the token pointers | 3 | `src/app/globals.css` (`--font-display`, the body `font-family`, one comment) |
| `font-display` spends | 5 | five components, below |
| `font-mono` spends | 9 | six components, below |
| `font-cursive` spends | 4 | the three gedu contract surfaces and the admin certification card |
| `fontFamily` in the OG cards | 6 | two `opengraph-image.tsx` files, all reading `OG_FONT_FAMILY` |
| the OG family literal and its doc | 6 | `src/components/og/fonts.ts` |
| `fontFamily` in the banner SVG | 1 | `src/components/ui/product-banner.tsx` |
| `font-family` in the mail | 1 | `src/lib/email-templates/layout.ts` |
| prose naming `font-display` | 3 | `pixel-art.tsx`, `roblox-hero.tsx`, `gamer-dashboard-page-body.tsx` (comments, not spends) |
| the `next/font` import and the `<html>` comment | 3 | `src/app/layout.tsx` |

**The count moves as rulings land, and the rows say how.** 59 in 23 after §7 (the
`font-brand-mono` token and its comment went from `globals.css`, and one call site
dropped a weight class). 60 in 24 after §9: the mail's row is still one `font-family`,
now the interpolated form rather than a family literal, and the extra file is
`src/lib/constants/typography.ts`, the module that derives the stack from the library.
57 in 22 after §1 and §2: three hits went — the two heroes' `font-display` spends and the
Roblox hero's comment naming the face — and the prose row drops from three files to two,
because the rewritten comment names no family and no class. Both hero files fall out of
the listing entirely: a face was the only thing either of them named. 58 in 22 after §11
and §8, and the two rulings move it in opposite directions: §11 adds one, the `font-serif`
on the About quote, and §8 is a swap — the banner's `fontFamily` attribute goes and a
`font-mono` class takes its place, so the row stays at one hit and stops being a
hand-spelled family. No file joins or leaves the listing, because both files were already
in it. **47 in 18 after §3, §4, §5 and §13**, which is where the retirement of Press Start
2P shows up as a number: eleven hits went in one move. The face's `next/font` import, its
load and its variable class left `src/app/layout.tsx`, which now loads exactly the four
faces `FACES` names; `--font-display` and its comment block left `globals.css`, whose only
remaining hit is the body `font-family`; and the three `font-display` spends went with the
three comments that named the face. Four files fall out of the listing entirely — the gamer
dashboard body, the admin panel, the pixel-art module and the call-ended screen — because
a face was the only thing any of them named. Dropping `-g '!*.md'` now gives 49 in 19: the
two extra are the surviving face paragraphs in `src/CLAUDE.md`, which retire with §12.
**43 in 18 after §10 and §12**, and the two rulings move it in different ways. §10 takes
four hits out of `src/components/og/fonts.ts`: the family literal is gone and the two
constants that spelled it in a doc comment go with it, leaving two comments that name
`next/font` and `fontFamily` without spending either. §12 adds nothing to `src/` — a
mechanism is lint and tests, which live outside it — but it closes the gap between the two
forms of the command: dropping `-g '!*.md'` now returns the same 43 in 18, because the
app file's two face paragraphs retired with it and no `.md` under `src/` names a face any
more. The command is the enumeration; a hit it returns is a place a face is named, not a
defect.

## Standing decisions (already made, not re-opened here)

- **Press Start 2P is retired, and the retirement is complete.** It was loaded as an
  approved exception outside the library's four faces and spent on five sites. All five
  are now set in a library face — §1 and §2 in the public-site heroes, §3, §4 and §5 on
  the three platform surfaces — and the load and `--font-display` went with the last of
  them: no `next/font` import, no `--font-press-start-2p` variable, no `--font-display`
  token and no `font-display` class anywhere in `src/`.
- **No new face is added to the library.** `FACES` stays four.
- **Dancing Script's placement is settled** — a signature line and nothing else — and
  its four call sites are all signatures. No question, no drawing, no change.
- **Sogverse may not define a face**, the same rule colour landed under. Every family
  it names is the library's or is replaced by one that is.
- **Faces are loaded by the consumer and named by the library.** Nothing in this
  adoption moves a font file into the package.

---

## 1. The home hero

**Asked:** which library face the home page's hero headline takes.

**Shown:** `src/app/(public)/page.tsx` h1, class-for-class with the real English
message and the `act` beat, three times — Press Start 2P, Poppins, Space Mono — with
the world rule under it.

**Proposal: Poppins.** This is the most parent-facing surface the product has, and the
brand puts the reasoning in one line: keep the world voice out of the marketing
website's plain parent-facing copy, where Poppins carries trust better. The hero is
also already a declared departure on the colour side (the `act` beat and the `world`
rule), and a display face on top of that is a second departure nobody decided.

**Ruled: Poppins, as proposed.** The owner ruled it with the team, in the same round as
§2 and on the same reasoning: both public-site heroes are set in the app face.

**What landed.** `src/app/(public)/page.tsx` drops `font-display` from the hero `h1` and
nothing else: `text-2xl font-bold tracking-tight md:text-6xl` stay exactly as they are,
so the headline inherits Poppins from the `font-sans` on `<body>`, and the type scale,
weight and tracking remain the Heading adoption's to rule — including `font-bold`, which
Poppins draws and Press Start 2P did not (finding 1, half-closed). The `act` beat, the
`world` rule under the headline and the shrink-to-fit wrapper are untouched, because the
colour departure and the measure trick are not face questions. No comment in the file
named the face, so none needed rewriting. The drawing left §2 of the ruling page.

One size did move after the owner walked the page on a phone: the 24px narrow size had
been chosen so the pixel face would fit, and in the app face it read as too small, so
the hero takes the scale's own narrow H1 step, `text-h1-mobile`. The wider sizes stay.

**Status: landed.**

## 2. The Roblox hero

**Asked:** which library face the Roblox programme page's hero headline takes.

**Shown:** `src/components/roblox/roblox-hero.tsx` h1, both size scales collapsed to
the short-beat English one, three faces.

**Proposal: Poppins**, for the same reason as §1 — it is the same construct on the
same kind of page, and a partner-facing programme page is if anything further from the
world than the home page is. Worth seeing in the drawing: the two size scales in that
component exist *because* Press Start 2P is monospaced at one em per glyph, so French's
"Construisez" overflows. Poppins is proportional, and the second scale is a by-product
that goes with the face (below).

**Ruled: Poppins, as proposed.** The owner ruled it with the team, in the same round as
§1 and as one decision with it: both public-site heroes are set in the app face.

**What landed.** `src/components/roblox/roblox-hero.tsx` drops `font-display` from the
hero `h1`. Everything else stays — `font-bold leading-snug`, both size scales (each now
starting from the scale's narrow H1 step, `text-h1-mobile`, for the reason §1 gives), and the
mechanism that chooses between them — because that mechanism answers "a headline that
fits its longest translation", which is a real problem with no library answer yet, and
deleting the workaround without one trades a hack for a bug (by-product 2 below). The
component's doc comment is rewritten where it explained the face: the paragraph
justifying two scales by Press Start 2P's one-em-per-glyph monospacing is replaced by one
saying the slogan carries no face class and inherits the app face, which is proportional
(the summary line's "pixel slogan" goes with it);
that the two scales remain because the longest translation still has to fit; that the
mechanism counts characters rather than pixels — exact under a monospaced face, an
approximation under a proportional one; and that whether two scales are still needed at
Poppins's widths is the library's hero question, not this adoption's. The drawing left §2
of the ruling page.

**Status: landed.**

## 3. The gamer greeting

**Asked:** which library face the child's own dashboard greeting takes.

**Shown:** `src/components/gamer/gamer-dashboard-page-body.tsx` h2, in `act`, with a
long Finnish name in it — the longest thing that can land in that line and the one part
of it no translator controls.

**Proposal: Space Mono, and it costs a widened rule.** This is the one site of the five
where the world voice has a case: the reader is a child, the surface is inside the
platform, and the colour budget already says a gamer surface is where the loudness
belongs. But the library's own words are narrower than that — Space Mono is "spent only
where the platform names one of its own places" — and "Welcome, Väinämöinen!" names no
place. So this ruling is really two: whether the greeting takes the world voice, and
whether the rule becomes *a surface inside the world* rather than *a place the platform
names*. The honest alternative is Poppins here too, in which case Space Mono keeps only
the nine machine-text placements §7 gave it and the world voice names no place in
Sogverse at all — survivable, but worth ruling deliberately rather than by default.

**Ruled: Poppins.** The owner brought the team's decision, made once for the
whole adoption rather than site by site: **Poppins everywhere, and Space Mono is used
exclusively for machine text.** §13 is that decision's own entry. The rule is not widened: "Welcome, Väinämöinen!" names a
child rather than a place, and the greeting was always the weaker half of this entry's two
questions.

**What landed.** `src/components/gamer/gamer-dashboard-page-body.tsx` drops `font-display`
from the greeting `h2` and nothing else: `text-xl font-bold text-act break-words
md:text-3xl` all stay, so the line inherits Poppins from the `font-sans` on `<body>` and
its weight, size, colour and step-down remain the Heading adoption's to rule — including
`font-bold`, which Poppins draws and Press Start 2P did not (finding 1, closed). The
comment above it justified the two sizes by the pixel face's one-em-per-glyph monospacing;
it is rewritten to say what is still true — a long Finnish word overflows mobile at
`text-3xl`, so the greeting steps down, and `break-words` catches the name no translator
controls — and names no family and no class. The file falls out of the regeneration
command's listing.

**Status: landed.**

## 4. The admin all-clear title

**Asked:** which library face the admin dashboard's cleared-queue panel title takes.

**Shown:** `src/components/admin/dashboard/needs-attention-panel.tsx` `CardTitle`, in
`act`, on a card, three faces. The pixel trophy that sits beside it is not drawn here —
it is artwork with its own palette and it does not move.

**Proposal: Poppins.** The pixel face was chosen because the sprite beside it is pixel
art and the audience is a games company's own staff, which is a reason to keep the
*sprite*, not a reason to set a title in a display face. It is also the one panel
title on that page set differently from every other, so the face is carrying a
distinction the panel does not have. If the owner wants the all-clear to feel like a
reward, that is the sprite's job.

**Ruled: Poppins.** The owner brought the team's decision, made once for the
whole adoption rather than site by site: **Poppins everywhere, and Space Mono is used
exclusively for machine text.** §13 is that decision's own entry.

**What landed.** `src/components/admin/dashboard/needs-attention-panel.tsx` drops
`font-display` from the `CardTitle` and nothing else: `text-sm leading-relaxed
tracking-normal text-act sm:text-base` all stay, and the title now inherits `CardTitle`'s
own `font-semibold` (600), which Poppins draws and Press Start 2P did not (finding 1,
closed). The pixel trophy beside it is untouched artwork. The comment is rewritten: it had
explained every class as a concession to the pixel face — the relaxed leading against one
em per glyph, `tracking-normal` against smudged pixel glyphs, and the `latin`-subset
diacritic note that finding 4 is about — and now says what is true, that the heading is the
app face like every other panel title on the page, that the sprite carries the reward on
its own, and that the leading and tracking are for a title sitting on one row beside it.
The file falls out of the regeneration command's listing.

**Status: landed.**

## 5. The call-ended heading

**Asked:** which library face the instant room's after-the-call heading takes.

**Shown:** `src/components/voice/instant/CallEndedScreen.tsx` h2, inside its card,
three faces.

**Proposal: Poppins.** The heading is literally the home hero's message — the same
`home.hero.title` key, `act` beat and all — so whatever §1 rules, this takes it, and
the two entries should not be allowed to diverge. Voted separately only because a
person meets it in a completely different place.

**§1 has ruled Poppins.** This entry stayed open on its own surface all the same: the
call-ended heading is in-platform, in a voice room, and the team was ruling by category —
the two public-site heroes together, the three platform surfaces on their own terms — so
the shared message key set the expectation without settling the vote.

**Ruled: Poppins.** The owner brought the team's decision, made once for the
whole adoption rather than site by site: **Poppins everywhere, and Space Mono is used
exclusively for machine text.** §13 is that decision's own entry. The category ruled the same way the message key predicted, and
the two entries do not diverge.

**What landed.** `src/components/voice/instant/CallEndedScreen.tsx` drops `font-display`
from the tagline `h2` and nothing else: `pt-6 text-2xl font-bold leading-tight
tracking-tight md:text-3xl` all stay, and the `act` beat inside the rich message is
untouched, so the tagline is drawn exactly as the home hero's is under §1. The component's
doc comment named no face — the "display rule" in it is the hero's `world` rule, a graphic
and not a family — so nothing there needed rewriting. The file falls out of the
regeneration command's listing.

**Status: landed.**

## 6. The pixel-art module

**Asked:** nothing. Recorded so the sweep is complete.

`src/components/admin/dashboard/pixel-art.tsx` names `font-display` in a doc comment
and spends no face; the two hero components do the same. The three comments are
rewritten in the change that lands §1–§5, and the sprite itself is untouched artwork.

**What landed.** All three are rewritten and none names a family or a class. The Roblox
hero's went with §2 and the gamer dashboard's with §3. The pixel-art module's had said the
pixel register is the one this platform already speaks in, because `font-display` beside
the sprite was Press Start 2P; it now says what is true — a pixel mark reads as a reward to
the audience this page has, the sprite is the only pixel thing in the panel, and the words
beside it are the app face like every other title on the page. The sprite itself did not
move. The prose row of the regeneration command's table is empty: no file under `src/`
names the display face in a comment any more.

**Status: landed.**

## 7. One monospace on the site

**Asked:** the library names `--font-brand-mono` (Space Mono, the world voice) and
deliberately leaves Tailwind's `--font-mono` at the UA stack, so machine text is set in
whatever monospace the reader's OS ships. The proposal is to close that: the library
owns `--font-mono`, points it at Space Mono, and `--font-brand-mono` retires into it.
One monospace on the site, and machine text — room codes, passwords, ids, logs — is
branded.

**Shown:** twice. In §1 of the page, a room code, a UUID, a generated password and the
ambiguous set `0O o 1lI |` in the UA mono beside Space Mono, at the sizes the app sets
them. Then all nine `font-mono` call sites reproduced class-for-class with
representative content, each drawn today beside Space Mono:

| site | what it carries |
|---|---|
| `admin/testing/page.tsx` (two `pre` blocks) | a rendered email's plain-text part |
| `about/about-section.tsx` | the Klingon easter egg's value column, in its own red |
| `admin/user-marketing-card.tsx` | a UTM value and a Stripe customer id |
| `tools/minecraft-password-reset-card-view.tsx` (two) | the username textarea, the password chip |
| `voice/instant/RoomLinkChip.tsx` (two) | the in-call code chip, the share-link button |
| `voice/instant/RoomNotFoundScreen.tsx` | the code, at `text-2xl` with wide tracking |

**Proposal: yes, one monospace, and it is Space Mono.** Two tokens for one job is a
distinction a call site has to get right every time, and the failure is silent — a room
code in `font-mono` and a room code in `font-brand-mono` look different on the same
screen and nothing catches it. The reason the split was written (machine text must not
"silently become branded") holds only while there is a second, unbranded monospace to
be silent about; once the library owns both names there is one answer and no way to get
it wrong. What the page has to settle by eye is the one real risk: Space Mono's `0` has
no slash or dot, so `0` against `O` in a dictated room code, a copied id and a typed
password is the thing to look at, and if it fails there the answer is not "keep two
tokens" but "the world voice is not the machine face and the library names a third".

**Ruled: yes, one monospace on the site, and it is Space Mono.** Anywhere the app used
the UA monospace it now uses Space Mono. The zero was read against `O` at the sizes
codes are set and it is clear.

**What landed.** `FACES.brandMono` is `FACES.mono` at token `--font-mono`, pointing at
the same `--font-space-mono` variable, so neither the consumer's `next/font` load nor
the face-contract test moved; the theme was regenerated through the generator and now
declares `--font-mono`, which overrides Tailwind's default so `font-mono` in Sogverse
resolves to Space Mono. The face's doc comment carries the decision and its reason. The
library's `CLAUDE.md` said Space Mono is the world voice and the machine face both — a
claim §13 later narrowed to the machine face alone, and the file now says that. Every
`font-brand-mono` in the demo is `font-mono`. In Sogverse every `font-mono` call site
keeps its class; the three that asked for a weight the face does not draw moved to one it
does — the code chip and the UTM value chip to `font-bold`, the share-link button to no
weight class at all (finding 3, closed). The Space Mono load drops `preload: false` and
its comment now says what the face is for. The app rule's clause claiming Space Mono is
placed nowhere is deleted. §1 of the page loses the machine-text block and this section
is gone from the page.

**Status: landed.**

## 8. The product banner's "SOG"

**Asked:** the no-image fallback in `src/components/ui/product-banner.tsx` types "SOG"
into an SVG with a hardcoded system sans stack in a `font-family` attribute, at weight
900 with negative tracking, in `act` on the lifted grey.

**Shown:** the SVG reproduced from the component, today beside Poppins at 700 — the
heaviest weight the app loads.

**Proposal: the `fontFamily` attribute goes, and the text inherits the app face.** An
SVG inside the document inherits `font-family` like anything else, so the attribute
buys nothing but a second place a family is named; deleting it is the whole fix on the
face side. The weight goes to 700 in the same edit, because 900 against a family that
loads 400–700 is a browser-synthesised smear rather than a drawn weight (see "What was
hiding").

**By-product, not a face question:** an angular "SOG" on a badge-coloured ground is the
logo's own monogram, which the brand says exists only inside the logo and is never
recreated in type. That is the mark adoption's, and it is recorded below rather than
fixed here — deleting the attribute makes the fallback *less* like the monogram, not
more, so nothing gets worse in the meantime.

**Ruled: not the proposal.** The fallback is not a mark and does not become one in a
better face. It is machine text: **`NO IMAGE`**, set in Space Mono, in caps as furniture.

Why. This is a thing a customer should never see. It exists so a staging product can be
created without an image, and so an admin can save a product on prod before its picture
exists, unlisted — the admin form requires an image and the database does not enforce it.
A customer meeting it means an admin made a mistake. A fallback that reads as a designed
visual is a fallback that survives that mistake: nobody looking at a live product page
with a wordmark on it thinks anything is missing. So the placeholder says what is missing,
in the face the library reserves for text a machine wrote, and the caps make it furniture
rather than a voice. It is a constant and not a message key, the same in every locale,
machine text like a room code.

That also settles the by-product rather than deferring it: with "SOG" gone there is no
recreated monogram left to hand to the mark adoption.

**What landed.** `src/components/ui/product-banner.tsx` types `NO IMAGE` in place of
`SOG`. The `fontFamily` attribute is gone and the `<text>` carries `font-mono` in its
`className` beside `fill-act`, so the face arrives through the library's own token the way
it does everywhere else — an inline `<svg>` is in the document and inherits `font-family`
like any other element, which the same element's `fill-*` classes already proved.
`fontWeight` is `400`: a placeholder is not a mark, and Space Mono loads 400 and 700, so
the synthesised 900 recorded in finding 2 is gone rather than merely reduced (finding 2,
closed). `letterSpacing="-2"` went with it — it was a display mark's tightening and a
monospace placeholder does not want one. `fontSize` is `24`, computed rather than picked:
Space Mono advances about 0.6em per glyph and `NO IMAGE` is eight of them, so the line
runs about 115 units across a 150-unit `viewBox` and leaves roughly 17 units of margin
each side. The `aria-hidden` stays, because every call site names the product in text
beside the frame. The i18n literal-string lint passes it for the reason it passed "SOG":
the rule's `words.exclude` list carries `[A-Z_-]+`, an all-caps exemption applied
word by word, and `NO IMAGE` is two all-caps words. No disable comment. The component's
comment is rewritten: what the fallback is for, that a customer seeing it is an admin's
mistake, and that it is machine text in the machine face and deliberately not a mark. The
drawing left the ruling page, and with it the whole spelled-by-hand section — the banner
was its only remaining picture.

**Status: landed.**

## 9. The mail's body stack

**Asked:** every mail sets `font-family:Arial,Helvetica,sans-serif` on `<body>` in
`src/lib/email-templates/layout.ts`, typed there as a literal.

**Shown:** a short mail body on the mail's own dark ground, today beside the proposed
stack with Poppins first.

**Proposal: the library exports the mail-safe stack, derived from `FACES.sans`.** This
is exactly the shape colour already takes to the mail — `src/lib/constants/colors.ts`
derives every hex from `@sog/ui` so a hue moves in the package and the mail follows —
and it is the only shape that satisfies the boundary test, since a new visual identity
must not need an edit to a template file. Nothing is downloaded in a mail, so the stack
is a *preference*: a reader who has Poppins installed gets the brand's face and
everybody else lands on Arial exactly as they do today, which is why the fallback half
stays and is not chased. `src/lib/email-templates/CLAUDE.md` currently records the
Arial stack as "permanent, do not chase" — that line is amended, not deleted: the
fallback is still permanent.

**Ruled: not the proposal.** The mail is set in the reader's own system sans, declared
once by the library as the mail face, exclusive to mail, and **no webfont is put in
front of it** — not Poppins, not a named web-safe face. The stack is the whole face.

Why the preference does not survive contact. The clients that carry most readers —
Gmail, Outlook, Yahoo — load no web font at all, so a family declared first reaches a
minority and the mail becomes two designs; Poppins is also much wider than any fallback
behind it, so line breaks and button widths would differ by client, which is where mail
layouts break. A webfont in a mail is a request to a third party, or to our own domain,
on every open — an open-tracking beacon, in a product whose parent-facing copy is about
trust. Outlook on Windows additionally answers a missing declared web font with Times
New Roman rather than with the next family in the stack. And a single named web-safe
face (Verdana, Trebuchet) is not "one face everywhere" either: the archetypal family
phone in our markets is Android, where every stack ends at Roboto, so it designs for the
desktop minority and no one else.

What the stack resolves to is a face rather than a fallback — San Francisco on iPhone
and Mac, Segoe UI in Outlook and on Windows, Roboto on Android, Helvetica or Arial where
nothing else exists — each a humanist sans, warm and legible at small sizes, so the mail
reads as native to the client it arrived in. The library's rule for every face is that
the fallback is the UA's own and never a second webfont; mail is the one surface where
that fallback is the whole face.

**What landed.** `MAIL_FACE` is exported from `packages/sog-ui/src/tokens/typography.ts`
beside `FACES` as its own type — a `MailFace` with a `stack` and the two weights every
system face draws, and no `token` or `variable`, because a mail loads nothing and reads
no CSS variable. Its doc comment carries the ruling and its reasons, including what was
decided against, and the file's header says the mail face sits beside the exhaustive list
rather than in it. The library's `CLAUDE.md` says mail is set in the reader's own system
sans, that mail alone may spend it, and that no webfont is ever loaded in a mail. The
demo's foundations floor draws it beside the four loaded faces, in its own stack. Two
mechanism tests in `tests/unit/sog-ui/typography.test.ts`: the stack names none of the
loaded families, and the generated theme declares exactly the face tokens `FACES` names
and no more — the mail face has no token, because it is not a CSS face. In Sogverse the
stack arrives the way colour does: `src/lib/constants/typography.ts` derives
`MAIL_FONT_STACK` from `@sog/ui` and nothing is spelled there, and
`src/lib/email-templates/layout.ts` interpolates it into the shell's `style` attribute in
place of the `font-family:Arial,Helvetica,sans-serif` literal — the only family literal
any mail-producing code held. The email directory's `CLAUDE.md` mirror table and its rule
are rewritten to the mail face and the no-webfont rule. Two lint bans: a `font-family`
literal in `src/lib/email-templates/**` (a family name after the colon; the interpolated
form is the only spelling that passes), and `MAIL_FACE` / `MAIL_FONT_STACK` unimportable
anywhere under `src/` except the deriving module and the mail directory, because the mail
face is never a screen face. The mail drawing left the page's spelled-by-hand section, and
that section has since gone with §8, which took the last drawing in it.

**Status: landed.**

## 10. The Open Graph family name

**Asked:** `src/components/og/fonts.ts` names `OG_FONT_FAMILY = "Poppins"` as a
literal, which is Sogverse spelling a family.

**Shown:** nothing. The cards already draw Poppins and the picture does not change;
what changes is who owns the string.

**Proposal: `OG_FONT_FAMILY` derives from `FACES.sans.name`.** The gstatic URLs stay
the consumer's, because the consumer is the one loading files — the library names
faces and never ships or fetches one, and a hashed gstatic URL is a fact about a
specific cut of a file rather than about the brand. If the family moves, the derived
name moves with it and the URLs fail loudly at build time, which is the right direction
to fail in.

**Ruled: as proposed.** SOG-UI owns the family name, the OG cards get it from SOG-UI, and
the font file URLs stay Sogverse's, because the consumer is the one that loads files.

**What landed.** `OG_FONT_FAMILY` is exported from `src/lib/constants/typography.ts`,
derived from `FACES.sans.name` and sitting beside `MAIL_FONT_STACK` in the same shape —
one module where the two renderers that read no CSS take their face from the library, and
nothing in it spells a family. `src/components/og/fonts.ts` imports it and re-exports it,
so both `opengraph-image.tsx` files keep naming their face by importing it beside the
buffers that carry it and neither of them moved. The module keeps its two hashed gstatic
URLs and its doc comment is rewritten: it no longer claims to be the one place in the app
that names a family literally, because it names none — it says the name is the library's
and the files are the consumer's, that a hashed URL is a fact about one cut of one file
rather than about the brand, and that if the app face moves the name follows it while the
URLs stop matching, which is the direction to fail in.

**Status: landed.**

## 11. Crimson Pro and the About quote

**Asked:** which face the About page's pull quote takes — and if the serif, whether its
italic is loaded or the quote goes upright.

**The earlier text of this entry was wrong.** It said Crimson Pro has no placement in
Sogverse and gets none in this adoption, recorded "so nobody asks again". There is a
placement, and it is on the most obviously editorial page the product has:
`src/components/about/about-section.tsx` carries a pull quote, `about.quote.text`
"“What is true now, was once just your imagination.”" with `about.quote.attribution`
"— The Princi-Pal", which is two of the four placements the library names for the serif
at once — a pull quote, and long-form in a person's voice. It is set today in italic
Poppins: `text-xl italic text-muted-foreground` on the quote, `mt-2 text-sm
text-muted-foreground` on the attribution, centred in a `max-w-3xl`.

**Shown:** in §3 of the page, the quote block reproduced class-for-class with the real
English copy, drawn three times — today (italic Poppins), Crimson Pro upright with
`italic` dropped, and Crimson Pro in its true italic. The third column exists because
the app loads the face upright only, so the serif applied on its own would leave the
browser to slant upright glyphs, and a synthesised slant on a serif is visibly wrong: a
true italic is a different alphabet, not a skew. The ruling page loads the italic itself,
in its own module beside the Press Start load, so the drawing can be seen without the
demo's layout claiming a file the contract has not been ruled to include.

**Proposal: Crimson Pro, with its true italic loaded.** A pull quote in a named person's
voice is the placement the library wrote the serif's rule for, and the italic is the one
editorial flourish the library's type rules reserve italics for — a quotation in someone
else's voice is exactly the case, not emphasis inside running copy. The cost is one more
file in the face contract and preload turning on for the face, which stops being a face
loaded for completeness the moment a page spends it.

**What it costs the contract.** `Face` today has `weights` and `subsets` and no styles
field, because every face so far is upright only. Ruling the italic in gives it a
`styles` field — the contract then says which cuts of a family a consumer loads, not just
which weights — and the demo's layout and the app's load both follow from there.

**The alternative is the serif upright, `italic` dropped**, which costs nothing in the
contract: the face is already loaded, the quote is already marked as a quotation by its
indent, its measure and its attribution line, and a serif on a page of sans is a
change of voice without a slant. That is the column to look at second.

**Ruled: Crimson Pro with its true italic, as proposed.** The owner ruled it with the
team. The quote is set in the serif, and the serif's italic is loaded, so the quote keeps
its slant as a drawn face rather than a browser's skew of the upright alphabet. The
alternative — the serif upright with `italic` dropped — was decided against and is
recorded in the face's doc comment as such.

**What landed.** `Face` in `packages/sog-ui/src/tokens/typography.ts` gains a `styles`
field, a readonly list of `"normal" | "italic"`, doc-commented with what a style is and
what its absence costs: the consumer loads each style listed, a style not listed is
synthesised by the browser, and on a serif that synthesis is a skew rather than the
italic alphabet — so a style is listed when a placement needs it and never for
completeness. Every face declares `["normal"]`; the serif declares `["normal",
"italic"]`. The serif's own doc comment is rewritten: it now has a placement — a pull
quote in a named person's voice, which is two of the four the library names at once — and
it carries its italic because a pull quote is the one editorial flourish the type rules
reserve italics for; the "seasoning, never UI or body copy" rule stays.

Both face-contract tests gain the same new assertion — `tests/unit/theme/face-contract.test.ts`
against the app's root layout and `tests/unit/sog-ui/typography.test.ts` against the demo's.
Each slices the `next/font` call that defines a face's variable out of the layout text and
checks the `style` option against `FACES`. How it treats an omitted option is doc-commented
on the test: `normal` is next/font's default, so a face drawn upright only may leave the
option out, and the check is on the option where it is present — it must name every style
the face declares — and on its absence only where the face declares nothing but `normal`,
so a face that gains a second style and not the option fails.

`packages/sog-ui/demo/app/layout.tsx` loads Crimson Pro with `style: ["normal",
"italic"]`, and the demo's faces floor (`demo/app/page.tsx`) draws every style a face
declares at every weight — two named blocks for the serif, one unnamed block for the three
faces with nothing to tell apart. In Sogverse, `src/app/layout.tsx` loads the same two
styles and drops `preload: false`, because a surface now renders the face; its comment is
rewritten from "nothing renders it yet" to the placement and the reason for the second
style. `src/components/about/about-section.tsx` adds `font-serif` to the blockquote and
keeps `italic`; nothing else in the block moves. `packages/sog-ui/docs/rollout.md` loses
the follow-up "Crimson Pro's first placement, when an editorial surface exists" — it has
happened. The library's `CLAUDE.md` clause on Crimson Pro is unchanged, because it was
already true. The drawing and its locally-loaded italic module both left the ruling page.

**Status: landed.**

## 12. The mechanism — Sogverse cannot define a face

**Asked:** what makes this adoption unable to come undone, in the shape the root
`CLAUDE.md` requires: enumerate, classify, a CI completeness check, and the primitive
that makes conforming cheapest.

**Proposal, four parts:**

1. **Lint bans the spellings.** `next/font` imports anywhere in `src/` except
   `src/app/layout.tsx`; `fontFamily` in a style object or a JSX attribute, and
   `font-family` in a string, anywhere in `src/`; `font-[…]` arbitrary values; and any
   `font-*` class that is not one of the library's four face utilities or a weight.
   The exemptions are named one by one with their reasons, the way the hex ban's are.
2. **A styling test asserts `src/app/globals.css` declares no `--font-*`** — the
   sibling of `globals-declares-no-colour.test.ts`, and the thing that retires
   `--font-display` for good rather than by habit.
3. **The face-contract test gains its inverse.** Today it asserts the root layout
   defines every variable in `FACES`; it does not assert the layout loads *nothing
   else*, which is precisely how a fifth family lived there for months. The inverse
   assertion — every `next/font` call in that file names a family in `FACES` — is the
   completeness check, and it is what makes the enumeration a command rather than a
   list.
4. **The primitive is the face utility itself.** There is one greppable way to set a
   face — `font-sans`, `font-serif`, `font-mono`, `font-cursive`, the four the library
   now names — and the lint in (1) permits nothing else, so conforming is one class and
   departing does not compile.

**Ruled: as proposed, all four parts.**

**What landed**, mapped to the root `CLAUDE.md`'s four steps.

**Step 1, the enumeration as a command.** The regeneration command at the head of this
file, unchanged: it is the surface, and re-running it is the proof, which is why the count
above moves with every ruling rather than being restated at the end.

**Step 2, the classification.** Every hit the command returns is one of five kinds and the
kinds are the classification: a face *load* (the root layout, and only there), a face
*utility* spent in a class string, the *derivation* modules that hand a face to a renderer
with no stylesheet, the body's one `font-family`, and a comment. There is no sixth kind,
and the question each kind answers is whether a missing guard would be a bug or the
design: a load outside the layout, a family spelled anywhere, a `font-*` the theme does
not generate — each is a face Sogverse defined for itself, and each now fails.

**Step 3, the CI completeness checks.** Three, one per thing that could still be true
silently.
`tests/unit/theme/face-contract.test.ts` gains its inverse: every `next/font` import in
the root layout — the module specifier is matched, so a default `localFont` from
`next/font/local` is caught as well — names a family in `FACES`, with the identifiers
compared against `FACES[*].name` with spaces as underscores, next/font's own convention.
It is floored so a regex that stops matching fails rather than passing empty, and it is
doc-commented as the completeness check, naming the fifth family that lived in that file
for months as the thing the outward-only direction could not see.
`tests/unit/sog-ui/typography.test.ts` gains the same assertion against the demo's layout.
`tests/unit/styling/globals-declares-no-face.test.ts` is new, the sibling of
`globals-declares-no-colour.test.ts` and written in its shape (comments stripped first, a
declaration told from a use by what precedes it, one `WHY` naming the fix): the app's
stylesheet declares no `--font-*` at all, and its only `font-family` is the body's
`var(--font-sans)`. The colour test's own doc comment, which still listed "the one face
variable" among what the stylesheet may declare, is corrected and points at the sibling.

**Step 3's other half, the lint.** Three bans in `eslint.config.mjs`, in the style of the
colour ones — node-matched, each message saying what to do instead, each exemption a block
of its own with its reason written out, no blanket glob.
`next/font` and its subpaths are importable by `src/app/layout.tsx` alone, as a
`no-restricted-imports` pattern; the message names the layout as the one place a face is
loaded and says everywhere else sets a face rather than loading one. The pattern is
restated in the three other blocks that set that rule, because a later block replaces a
rule's options rather than merging with them, and the layout's own block is the exemption.
A family spelled as a string is banned: a `fontFamily` object property or JSX attribute
whose value is a string or template literal, and a `font-family:` inside a string —
an *identifier* value passes, which is the whole point, since the OG cards pass the
derived constant. The mail keeps its own narrower `font-family:` ban (a family *name*
after the colon, so the interpolated stack passes) and the app-wide form is deliberately
left out of the mail's block, so the two never both fire on the derived stack.
And in a class string — the same `CLASS_STRING_SCOPES` the palette ban reads — `font-[…]`
and any `font-<word>` that is not a face utility or a weight. The four face utilities are
read off `theme.css`, so the library adds a face and the lint learns it on the next run;
the four weights (`font-normal`, `font-medium`, `font-semibold`, `font-bold`) are
enumerated from what the tree actually spends, with a doc comment saying they are the
Heading adoption's and leave with it.
Every ban was confirmed against a deliberately-bad line and the probes reverted: the
`next/font` import, a `fontFamily: "Arial"` in a style object and as a JSX attribute, a
`font-family: Arial` string, a `font-display` class and a `font-[Arial]` class, each in an
ordinary component, in an artwork-exempt file and in a mail template.

**Step 4, the primitive.** Nothing to ship: the face utility already is one. There is one
way to set a face, it is a single class, and after the lint there is no second way to
write it.

**And the rules move to where the mechanism is.** `src/CLAUDE.md` loses both face rules —
"Poppins is the app face… loaded through `next/font`" and "a `next/font` variable class
goes on `<html>`" — both of which § Faces in the package's `CLAUDE.md` already states; its
pointer list no longer names faces among the app file's transitional UI sections, and its
"colour has already left" note now says the faces have too and names the three test
directories. The sentence-case rule stays, because it is Heading's.
`packages/sog-ui/CLAUDE.md` § Faces gains the mechanism in the paragraph's own voice: a
consumer loads exactly the faces named there and no other, defines none of its own, spells
no family, and lint and the contract tests hold it.

**Status: landed.**

## 13. The world voice, on its best cases

**Asked:** whether the world voice has any placement in Sogverse at all — decided
once, on the strongest cases the product has, rather than site by site. §3 and §5
each ask it locally and could both be ruled to Poppins without anybody answering
the question underneath them. If Poppins wins on the best cases it wins
everywhere, and Space Mono is the machine face only: room codes, ids, passwords,
logs, the nine placements §7 landed.

**The signal.** The team that owns the brand has a standing preference for Poppins
over Space Mono in Sogverse. That is a preference and not yet a ruling, which is
why this entry exists: the team should see the cases the Guidebook's own words
most clearly cover before it becomes one. The Guidebook says Space Mono is
"in-platform UI… anything meant to feel like it comes from inside the game world"
and, in the same breath, "keep it out of the marketing website's plain
parent-facing copy"; the library narrows that to "where the platform names one of
its own places". Every case below is chosen against those two sentences.

**Shown:** in §3 of the page, six candidates, each drawn twice — Poppins today
beside Space Mono — and each drawn as a *whole* construct so the mix is visible:
only the named element moves face, the eyebrow, the schedule line and the plain
sentences around it stay in the app face in both columns.

| candidate | component — page |
|---|---|
| the zone list's names, "Clubhouse", "Harmony" and a moderator's own zone | `src/components/voice/ZoneList.tsx` — Group session, voice room |
| the room's own heading, "Voice Room", over its instruction line | `src/components/voice/VoiceRoom.tsx` — Group session, voice room |
| a club's name in a list row, under its type noun and over its schedule | `src/components/family/EnrollmentCard.tsx` — Gamer dashboard |
| the same name as a page masthead | `src/components/family/product-page/FamilyProductPageBody.tsx` — Gamer club page |
| the type headings, "Clubs", "Camps", "Events" | `src/components/gamer/gamer-dashboard-page-body.tsx` — Gamer dashboard |
| the product title, under its kind and topic | `src/components/public/products/product-detail-page-body.tsx` — Shop, one product |

Two more candidates are already on the page and are not drawn again: **the gamer
greeting** (§3) and **the call-ended heading** (§5), both in §2. They are the two
sites this entry exists to settle, and they should be read against §4 rather than
on their own.

**Proposal: the world voice has exactly one placement, and it is the zone name.**
Of the six, one genuinely reads as the world naming its own place: the voice
room's zone list. "Clubhouse" is a room that exists nowhere but inside Sogverse,
and the four Yty zones — Harmony, Glow, Valor, Wit — are canon terms used with no
gloss, which is Level 3 by definition, on the surface furthest inside the platform
the product has. Drawn in Space Mono against a Poppins pill and a Poppins
instruction line, the name reads as a label on a door rather than as a heading,
which is the effect the Guidebook is describing. So: **Space Mono for the zone
name, as an element, with everything around it in Poppins** — the tile, the
private pill, the instruction line, the participant names, all the app face.

The other five do not survive their own drawing, and it is worth being explicit
about why, because four of them fail for the same reason. **A product name is not
a name the world gave anything.** "Minecraft-maanantaikerho" was typed by a person
in an admin form; the platform is displaying a business's name for a thing it
sells, and setting it in the world voice dresses a catalogue row as lore. That
takes out the list row, the page masthead and the shop title in one move — and the
shop title is doubly out, because the shop is the marketing site's buying surface
and the reader is a parent comparing three programmes, which is the exact case the
face rule names. **The room heading and the type headings fail differently**:
"Voice Room", "Clubs", "Camps" are descriptions of features, structure a reader
scans rather than content the world speaks, and a face change there buys texture
and no meaning.

That leaves a rule that is narrower than the one §3 asked for and *is* the one the
library already writes. §3 proposed widening it to "a surface inside the world";
this proposal keeps "a name the platform gives one of its own places", and the
zone list is that rule's first and so far only site in Sogverse.

**The consequence, either way.**

- **If the zone name is ruled in:** §3 is **Poppins** — "Welcome, Väinämöinen!"
  names a child, not a place, and the greeting was always the weaker half of that
  entry's two questions. §5 is **Poppins**, following §1 on the same message key.
  The library's rule text does not move at all: `FACES.mono`'s doc comment and
  `CLAUDE.md` already say the world voice is spent "where the platform names one
  of its own places", and the zone name is that sentence's first Sogverse call
  site rather than an amendment to it. What changes is `ZoneList.tsx`, one
  `font-mono` on the name span, and the adoption's count moves by one hit in one
  file.
- **If the team still prefers Poppins here:** §3 and §5 are Poppins for the same
  reason, and the ruling is the clean one — **Space Mono is the machine face only**.
  The world voice then has no placement in Sogverse, and the library's rule text
  *does* move: the face's doc comment and `CLAUDE.md` drop the world-voice half of
  its job, `FACES.mono` is described as the machine face and nothing else, and the
  Guidebook paragraph about the typewriter face of Sogverse retires from the
  excerpt as covered — covered by a decision that it has no screen placement here.
  That is a real simplification and not a loss: one face, one job, and no call site
  left deciding whether a string is lore.

**Ruled: no placement.** The owner brought the team's decision: **Poppins everywhere, and
Space Mono is used exclusively for machine text.** The world voice has no placement in
Sogverse — not the zone name, not any of the other five, not the two sites §3 and §5 asked
about. It is the second of the two consequences written above, the clean one: one face,
one job, and no call site left deciding whether a string is lore.

**What landed.** Nothing in `src/` changed for this entry — the ruling is that nothing
does, and `ZoneList.tsx` keeps the app face it already had. What moved is the library's own
rule text, in both places that carried it. `FACES.mono`'s doc comment in
`packages/sog-ui/src/tokens/typography.ts` opens on the machine face and nothing else — a
room code, a password, an id, a log, an inline code span, a placeholder no customer should
see, set in it so machine text is told apart from words at a glance, never a voice, never a
heading, never a name — and it records the world voice as decided against, in the library's
own words and citing no source: put to its strongest cases and not taken, because the app
face carries every word a person reads and a second face for the same words asks a reader
to learn a distinction the product does not need. The paragraph on the dotless zero stays,
because that property still had to be judged before the face could carry codes. The old
closing line about keeping the face out of a parent's plain copy went with the world voice:
a face that is never a voice cannot be in copy at all. The package's `CLAUDE.md` § Faces
loses "the world voice where the platform names one of its own places" from its Space Mono
clause, which stays exhaustive and in the paragraph's voice.

And §3 and §5 are Poppins, exactly as the consequence said they would be.

**Status: landed.**

---

## What was hiding (adoption step 3)

Nothing found here changes what the owner sees on the ruling page, and nothing has been
fixed in `src/` — these are findings for the change that lands the rulings.

1. **Four of the five Press Start sites ask for a weight the face does not have.**
   Press Start 2P is loaded at 400 and only 400. The home hero, the Roblox hero and the
   gamer greeting all carry `font-bold` (700); the admin all-clear title inherits
   `font-semibold` (600) from `CardTitle`. All four are browser-synthesised — a smeared
   400, not a drawn weight — which is the most visible instance of the class. The
   ruling page's "today" column therefore draws the face at 400 and says so in its doc
   comment; drawing the app's requested weight would have shown the owner a face that
   does not exist. The weight itself is the Heading adoption's to rule.
   **Closed by §1–§4.** The two heroes keep `font-bold` and Poppins draws it; the gamer
   greeting keeps `font-bold` under §3 and the admin title inherits `CardTitle`'s
   `font-semibold` under §4, both now drawn weights of a family that loads them. All four
   synthesised weights are real weights, and the family that could not draw them is no
   longer loaded. The weights themselves are still the Heading adoption's to rule.
2. **The banner's SOG asks for 900** against a system stack, and would ask for 900
   against Poppins, which loads 400–700. Same class of defect, on a surface CSS cannot
   reach. Folded into §8.
   **Closed by §8:** the placeholder is Space Mono at 400, a weight the face draws.
3. **Three `font-mono` sites ask for 500 or 600** (`font-medium` on the share-link
   button, `font-semibold` on the code chip and the UTM value chip). The UA stack
   synthesises whatever it is asked for and nobody notices; Space Mono loads 400 and
   700, so under §7 these become synthesised too unless the weights move to what the
   face draws. Recorded for the §7 landing.
   **Closed by §7:** the two 600s went to `font-bold`, the 500 dropped its weight class.
4. **Press Start 2P is loaded `latin` only**, alone among the five faces — every
   library face carries `latin-ext` because the product ships Finnish, Swedish and
   French. Swedish's `ä` is inside `latin` and survives; the Finnish and French sets do
   not fully, so a diacritic outside it falls back mid-word to the UA stack in a pixel
   headline. Retiring the face closes it, which is why it is a finding rather than a
   fix.
   **Closed by §3–§5.** The face is retired and its load is gone, so every face Sogverse
   loads now carries `latin-ext` and no headline can fall back mid-word. The admin panel's
   comment about Swedish's ä surviving the `latin` subset went with it. The demo's
   foundations floor draws every face against a specimen that carries the Finnish, Swedish
   and French marks, which is where a face is looked at with them on from now on.
5. **No orphaned face class.** Every `font-*` face utility Sogverse spends resolves to
   a token something generates: `font-display` from `globals.css`, `font-cursive` from
   the library's theme, `font-mono` from Tailwind's own default. `font-brand-mono` has
   zero spends in `src/` — the token exists and nothing reaches it, which is the
   condition §7 and §3 between them resolve.
   **Closed by §7 and §3–§5:** `font-brand-mono` is gone and `font-mono` is the
   library's, and `font-display` went with Press Start 2P, so every face utility Sogverse
   spends now resolves to a token the library's own theme generates, with no exception.
6. **Every face variable is on `<html>`.** The root layout puts all five `next/font`
   variable classes on the root element, and there is exactly one `<html>` in the app
   (the mail's own is a document, not a layout). No route group defines a second root
   layout, so no surface can reach `font-display` without the face being loaded. The
   failure mode the rule exists for is not present.

## By-products (a construct with no library home yet)

Not to be fixed in Sogverse. Each is a candidate for a library construct, in the
adoption that owns it.

1. **The logo monogram, recreated in type.** `product-banner.tsx` draws "SOG" as
   letters on a badge-coloured ground. The brand's rule is that the monogram exists only
   inside the logo and is never recreated. The mark adoption's, and the fix is probably
   the library's own mark rather than a face at all. (§8.)
   **Dissolved by §8, and closed.** The ruling took the letters out rather than re-setting
   them: the fallback says `NO IMAGE` in the machine face, so there is no longer a "SOG"
   set in type anywhere in Sogverse and no recreated monogram for the mark adoption to
   inherit. Nothing is queued.
2. **The Roblox hero's two size scales.** They exist because Press Start 2P is
   monospaced at one em per glyph, so the longest French beat overflows where English
   does not, and the component measures the raw message at render to choose. With a
   proportional face the whole mechanism is unnecessary — but "a headline that fits its
   longest translation" is a real problem the library will have to answer for every
   hero, and deleting the workaround without an answer trades a hack for a bug.
   **Kept by §2**, and what it measures is *characters*, not pixels: it strips the tags
   out of the raw message and asks whether any beat runs longer than eight characters —
   exact arithmetic under one em per glyph, an approximation now the face is
   proportional.
3. **The email face seam.** §9 proposes the mail-safe stack as a library export beside
   the colour mirror, which makes the mail a second consumer of the foundations tier
   with its own constraints (no download, no CSS variables, a stack rather than a
   family). Whether that is one export or the beginning of a mail-target module is the
   mail's own question, not this adoption's.
   **Answered by §9:** one typed export, `MAIL_FACE`, exclusive to mail and outside
   `FACES` — not a mail-target module. Nothing remains: the mail spends one value, and
   the next mail constraint that needs a library home can decide then whether it has
   grown into a module.
4. **`--font-display` as a concept.** The token indirection was right — a component
   asked for "the display face" and never for a family — and it retires with its only
   face. If the library ever wants a display face, this is the shape it takes, and the
   Guidebook's answer today is that it does not: a heading that wants personality gets
   the scale, not another family.
   **Retired with the face, and nothing is queued.** `--font-display` is gone from
   `src/app/globals.css` with its comment block, and the entry that let it through
   `tests/unit/styling/globals-declares-no-colour.test.ts` is gone with it, so the
   stylesheet now declares only layout values and the radius scale and the token cannot
   come back by habit. What stays true is the shape: the indirection was the right one, and
   a display face the library one day wants is a `Face` in `FACES` with a semantic token,
   loaded by the consumer like the other four — not a fifth family in the app's layout
   pointed at by a token the app declares itself, which is what this one was.
