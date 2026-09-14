# ROBLOX-TODO

## Status — resumed 2026-09-14

The pause that began on 2026-08-12 ended when Lynx's lawyer returned the **Creator Academy
Terms & Conditions** and **Creator Academy Privacy Policy** as approved and final, and
confirmed the **Child Safeguarding Policy** final as it already stood. The returned text
is on the site word for word, the draft banners are off all three pages, and the two
returned documents carry the lawyer's date (2026-09-09). The surface itself is still
unpublished — noindex, absent from the sitemap, no nav links — until the programme
launches; that flip is unchanged by the copy being final.

**Where the site departs from the returned text.** Kyle's ruling on applying it: the
legal wording is Lynx's and is not his to fix, the code's behaviour is. So the only
departures are mechanics — link tags on our own documents, the support address rendered
through the placeholder (`help@sog.gg`; the returned text says `hello@sog.gg`), and two
corrections, in four sentences, where the text described how Sogverse works and was
wrong: a media choice is changed on
the child's page in My SOG, not in "Sogverse profile settings" (terms, and the privacy
policy's *Changing a media choice*); and a child takes part under their first name, not a
"display name" (the privacy policy's *About the child* and *Children's privacy and
safety*). Everything else — "facilitator", "curriculum", "course", the "(by Lynx
Educate)" heading suffixes, the short version's two media bullets — is verbatim, house
style notwithstanding. A future edit to these namespaces is held to the same line.

---

Everything still open for the Roblox / Lynx Educate programme launch: placeholder copy
waiting on real content, published claims that need correcting, and features the legal
documents promise that the app does not have yet. Same semantics as `TODO.md`: this file
tracks open work only — when an item is fully done, delete it; when the file is empty,
delete the file. The record of what was done lives in git history.

**Sogverse is the source of truth for this copy.** The Notion documents were the draft.
They have been accepted one-way, and the published pages are now the document of record —
so a wording problem in one of these documents is *ours to fix*, not an upstream edit to
request, and there is no longer an upstream to drift from. **But the programme documents
are Lynx's to word** (Kyle, 2026-09-08): anything under the `roblox*` namespaces — the
programme Terms, Privacy Policy and Child Safeguarding Policy — takes the wording Lynx
gives, and we do not add paragraphs of our own to them. School of Gaming's voice lives in
School of Gaming's own policies (`/privacy`, `/terms-and-conditions`,
`/anti-bullying-and-discipline`), which the programme documents link to. What stays ours in
the programme documents is the mechanics: keys, placeholders, links, translation, and
correcting a claim about how Sogverse works.

An item has three states. **Open** — still being researched, or carrying a decision
nobody has been asked for yet; it sits in one of the topic sections below. **Escalated**
— the question is with whoever owns it and we are waiting; it stays in its topic section
with a line recording who was asked, when, and through which channel. That line is the
point: a glance down the list should say what is blocked and on whom, without reading
every item to work it out. **Resolved** — the decision is made and the exact change is
written down, but nothing has been applied to the codebase yet; it moves to
[Resolved — ready to apply](#resolved--ready-to-apply) at the foot of this file.

**The objective is an empty open list.** Every item terminates in a decision — Kyle's,
his team's, or Lynx's — and the work is to drive all of them there, not to pick off the
tractable ones. The single landing pass that the pause was protecting happened on
2026-09-14, when the lawyer's copy went in; since then a resolved entry lands **when Kyle
says so**, one at a time or in a batch as he prefers, translated and reviewed with
whatever lands beside it. Each resolved entry still has to be self-contained enough for a
fresh session to apply it with no prior context: the final English copy, the message
keys, and the mechanical steps.

The programme surface (`/roblox` and its child pages) is unpublished — noindex, absent
from the sitemap, no nav links — until copy is signed off by SOG and Roblox. The flip to
published happens for all of it together: nav + sitemap + noindex in one change (see the
comment on `roblox` in `src/lib/constants/routes.ts`).

## How we work through this list

One item at a time, start to finish, before touching the next. An item that escalates
does not stall the list: record who owes the answer, then move to the next unblocked
item and keep going until nothing is left that we can move on our own.

1. **Research it first.** The truth lives in the repo, the database, the internal Gedu
   handbook (`src/data/gedu-docs/`), and the public **sog.gg** marketing site — sog.gg
   already publishes claims we can reuse rather than invent (it is where "trained,
   background-checked Gedus" is already committed to in public, for example).
2. **Propose, then ask.** Bring back a concrete resolution, the specific decisions it
   needs, and **who each one belongs to** — not an open "what should this say?".
3. **Change no copy until the resolution is settled.** These are joint legal documents;
   the web copy follows the signed-off upstream text rather than leading it. Editing
   ahead of a decision publishes a claim nobody agreed to.
4. **Escalate to the right place, and be clear who is asking.** A question that is not
   ours to answer goes to exactly one of three:

   - **Kyle** — how Sogverse works, what we are willing to publish about ourselves, a
     product or engineering trade-off. The default; just ask in the session.
   - **Kyle's team at SOG** — how SOG really operates, where the repo and the Gedu
     handbook do not answer it: what the CEO will commit to publicly, what staff
     actually do. Draft the message for the clipboard and keep it neutral — it is
     Kyle's message to his colleagues, not Claude's, so it carries no Claude framing.
   - **The Lynx × SOG Slack channel** — Lynx's call: anything changing what one of the
     parties is obliged to do, or naming Lynx as holding a duty. Not wording. Since the
     copy was accepted one-way, how a sentence *reads* is ours; what it *commits anyone
     to* is still joint. Draft it **explicitly framed as coming from Claude**, with the
     context and a clear ask. Keep it short; the channel already has the context that
     we're editing this copy.

   Record the escalation on the item — who, when, which channel, what was asked — and
   move on. If the answer comes back as "you decide" (it does), make the call, and write
   it down **as Claude's decision with its reasoning**, so a person can overturn it later
   rather than inheriting an unattributed rule.
5. **Put the finalised draft on the clipboard for review.** Plain prose, no Slack markup
   — it is the copy itself, so it has to paste cleanly into Notion or the channel. Verify
   the encoding by codepoint after copying; em dashes and curly quotes are the ones that
   corrupt silently.
6. **Write the resolution down, don't apply it.** Move the item to *Resolved — ready to
   apply* with the final copy and the steps. This covers **every** change the resolution
   implies — copy, code, config, tests — not only the words in `messages/`. A resolution
   that is cheap, mechanical, or changes no wording at all is still written down and
   still waits. "It only adds a tag", "it needs no translation" and "this item isn't
   really copy" are not exemptions; they are the shapes the temptation actually takes.
7. **Nothing lands until Kyle says go.** That is the one hard rule here. A resolved
   entry waits in *Resolved — ready to apply* until he names it; it is never applied on
   the strength of being decided.

## Attribution, cookie consent, and the Lynx data export

**Opened 2026-08-26.** Research is complete and written up below.

This sits in this file rather than `TODO.md` because Lynx's original ask is what created
it and Lynx's data schema is what resolves it — but note that the **cookie-banner half is
platform-wide, not programme-specific**, and would be true if the Roblox programme did not
exist.

### Resolved 2026-09-03

The owner's decisions on the open questions below. Everything after this block is the
research as it was written on 2026-08-26 and is kept as the historical record — read it
for *why*, not for what is true now.

- **The banner ships.** Three tiers, per device, in our own copy: reject all / analytics
  only / analytics and marketing. It is platform-wide, not programme-specific.
- **`ref` becomes UTM.** `profiles.referral_code` is replaced by `utm_source`,
  `utm_medium` and `utm_campaign`; `utm_campaign` is the single "utm parameter" a partner
  export reports on. **Existing `referral_code` values are dropped, not migrated** — none
  were ever issued to a partner, and carrying them into a column whose format rule they
  were not authored against buys nothing. The sanitiser widened accordingly: four
  refusals (empty, over 200 characters, any control character, a leading `=`/`+`/`-`/`@`/
  tab/CR) and everything else accepted verbatim, **case preserved**, because Vercel
  reports UTM values case-sensitively.
- **The value is written at account creation regardless of what the visitor answered on
  the banner — pending counsel.** Open decision 3 below is the one thing counsel still has
  to answer, and it is the last unknown in this area. The write-once design is what keeps
  the reversal cheap: with no UPDATE grant on the three columns, clearing them is one
  service-role statement.
- **Web Analytics Plus is not bought.** Lynx's ask is the per-account value, which lives
  in our own database; Plus only adds landing-page UTM reporting, which is useful for
  non-ad links and for nothing Lynx asked for.
- **The Meta pixel ships, behind marketing consent**, using School of Gaming's own pixel
  ID — on the marketing pages only, with the signup conversions reported from our own
  servers through Meta's Conversions API. **TikTok was dropped on 2026-09-10** (snippet,
  env var, CSP hosts and cookie names all removed) until the team wants it: its id was
  never issued, so it had never fired anywhere, and a second unproven pixel doubled the
  surface the privacy copy had to describe.
- **The partner prefix convention survives the rename** as a `utm_campaign` naming
  convention: a campaign issued to or for a partner is prefixed with the partner's slug
  and a hyphen (`lynx-summer-a`, `rblx-launch`). It cannot be retrofitted, because the
  value is immutable once written. It is documented in `src/lib/utm.ts` and on the
  `profiles.utm_campaign` column comment.
- **`docs/plans/referral-landing-clicks.md` is deleted.**
- **The wrong premise is corrected where it was recorded.** "Nothing is written to the
  device, therefore no banner" no longer appears anywhere in the code: the module header
  now says that reading the params off the landing URL is itself what engages Art 5(3),
  that it happens pre-consent, and that the banner governs the browser scripts rather
  than this. Two of the three files the paragraph below names are gone with the rename
  (`src/lib/referral.ts` → `src/lib/utm.ts`, `referral-provider.tsx` → `utm-provider.tsx`)
  and the third was the deleted plan.

Not resolved, and unchanged: the third-party sharing of children's personal data in
Lynx's schema — see "The half that is bigger than the banner".

### What triggered it

SOG's counsel was asked whether the referral design avoids a cookie banner. The question
put to them described the journey accurately: a `?ref=` value is read from the landing URL,
held in memory for the visit, written to `profiles.referral_code` at account creation, and
**never stored on the visitor's device** — so, the team's reasoning went, no banner.

Counsel's answer: the scope of Art 5(3) ePrivacy is very broad, non-compliance risk lies
mainly with SOG, and what was described "looks like URL-based tracking that is commonly
used by websites to identify the origin of their inbound source of traffic … such technique
is considered as a tracking technique requiring a cookie banner (see EDPB guidelines on the
scope of Art 5(3))."

### What we believed, and why it was wrong

The design's six constraints (`src/lib/referral.ts`) exist to keep this lawful without a
banner, and the first of them — nothing is ever written to the device — is the one the
whole position hangs on. **That premise is wrong, and it has been wrong since the day it
was written.**

EDPB *Guidelines 2/2023 on the technical scope of Art. 5(3)* (v2.0, adopted 7 Oct 2024) is
the document counsel cites, and §3.1 addresses this exact case. ¶49 describes tracking
links as "very commonly used by eCommerce websites to identify the origin of their inbound
source of traffic" — counsel's sentence is near-verbatim from it. The reasoning has two
limbs, and **neither asks what SOG stores**:

- **¶50 (storage):** distributing the tracked link to the device "does constitute storage,
  at the very least through the caching mechanism of the client-side software … even if
  this storage is not permanent."
- **¶51 (access):** appending the code "constitutes an instruction to the terminal
  equipment to send back the targeted information."

Art 5(3) is storage **or** access, independently, and ¶6(c) confirms (quoting WP29) that
they "do not need to be performed by the same party". Our design only ever addressed
storage. Moving the value server-side does not help either — the proxy reading `?ref=`
*is* the ¶51 access, and it is already server-side today.

**Where the wrong premise is recorded, and needs correcting regardless of the outcome
below:** `src/lib/referral.ts` (constraint 1 of the header comment),
`src/providers/referral-provider.tsx` (the storage note), and the rejected-alternatives
section of `docs/plans/referral-landing-clicks.md`. All three currently tell a future
reader that no-device-storage is what keeps us out of ePrivacy scope.

*Provenance, so nobody re-litigates it:* the error entered in the Claude session of
2026-08-13 (`786f584c-ecc4-4f96-8184-56d9ba45bfbc`), whose first substantive turn asserted
"no consent needed, and no banner required … Nothing stored on the device means this layer
simply doesn't apply". The architecture advice in that session was sound and the
UTM-vs-`ref` reasoning was sound; the legal test underneath them was not. `?ref=` was a
defensible choice given the premise it was handed.

### The larger finding: `ref` is not our exposure

`src/app/layout.tsx` mounts `<SpeedInsights />` and `<Analytics />` on **every page**,
public ones included. Per Vercel's own docs, Speed Insights "injects a script that retrieves
the visitor's Web Vitals by invoking native browser APIs" — which is EDPB §3.2 ¶52–53
verbatim ("the fact that this information is being produced locally does not preclude the
application of Article 5(3)").

**So deleting the referral feature entirely would not settle the banner question.** Where
the exemptions land, checked 2026-08-26:

| | Verdict | Basis |
|---|---|---|
| **UK** | Workable | DUAA 2025 Sch A1 ¶5 statistical-purposes exemption, in force 5 Feb 2026 — needs clear info **and a free, simple way to object** |
| **France** | Doubtful | CNIL Sheet 16 (rev. 4 Jul 2025) audience-measurement exemption exists, but requires IP pseudonymisation (last octet removed) and a clickable opt-out; Vercel hashes the full request and we cannot configure it. CNIL warns "most large audience measurement offerings do not fall within the scope of the exemption, regardless of their configuration" |
| **Finland** | No | Traficom (guidance page last updated 23 Apr 2026) — analytics require consent and cannot be classed as necessary **or** legitimate interest |
| **Germany** | No | §25 TDDDG has no audience-measurement carve-out; a tool can only run consent-free by not triggering §25(1) at all |

Two of our markets have no exemption to claim, and one of them is home. ePrivacy is a
*directive*, so EU-wide operation means 27 national implementations and designing for the
strictest rather than per-market.

**The one clean no-banner path** is dropping both client scripts and relying on server-side
data only (Vercel Observability — no script, included on all plans, gives edge requests by
route, invocations, error rates, durations). That costs visitors, uniques, device and
browser breakdown, geography, referrers, and all Web Vitals. Audience analytics is the
thing a banner buys.

### What Lynx actually asked for, and what they meant

Every reference to UTM in Lynx's document, and the reading:

> "Parent/gamer registration should be trackable / attributable to community groups that
> initiated the outreach (e.g. UTM logic)"

> "A distinct registration link (e.g. sog.gg/register-roblox) that is a superset of the
> standard SOG sign-up, adding on the Roblox-required fields & auto-capturing the landing
> page UTM."

> **Parent level:** parent email · created at date · **utm parameter** · contact for
> marketing consent
> **Gamer/child accounts:** gamer id · parent email (for linking) · created_at · country ·
> city · age range · **utm parameter (from parent's data)** · photo/video testimonial
> consent · promotional use of work consent · case study consent

**They are asking for a per-person record with a provenance label on it — not analytics.**
The tells:

- The subject is **registration**, never traffic. "(e.g. UTM logic)" is illustrative, not
  prescriptive.
- "auto-capturing the **landing page** UTM" describes the mechanism our pipeline already
  implements: value rides on the landing URL, registration picks it up.
- The schema is a **per-person export**, and the field is **singular** — "utm parameter",
  one field, sitting next to `parent email`. Not source/medium/campaign broken out.
- **Nothing anywhere asks for clicks, impressions, traffic volume, or a conversion rate.**

`utm parameter` as Lynx specify it *is* `referral_code`. We built the thing they asked for
and gave it a different name. **UTM is a vocabulary, not a capability** — `?ref=x` and
`?utm_campaign=x` are technically identical, and what differs is only where the value
lands.

**Vercel cannot be the home for this, and never could.** It has no per-visitor records at
all, so it cannot answer "which accounts came from group X" and cannot back Lynx's API.
That was established correctly on 2026-08-13 and has not changed.

**Constraint 2 already matches their spec.** Lynx write "utm parameter (**from parent's
data**)" — the child's value derived from the parent's, not stored separately. That is
exactly what constraint 2 does (gamer rows NULL by construction, answered by a join).
Leave it alone; it is not a constraint we have to break to satisfy them.

### Where that leaves the design

The **pipeline** is right and survives every option: proxy sanitises → `x-referral-code`
header → root-layout context provider → signup metadata → write-once column. That transport
problem (a root layout cannot receive `searchParams`; the value must survive client-side
navigation) is identical whatever the payload is called.

What is wrong is the **vocabulary**, and the argument for changing it is now
*communication*, not technology: Lynx's spec says "utm parameter" and our column says
`referral_code`, so every export, conversation and future engineer pays a translation tax.
The privacy-policy readability argument that originally favoured `ref` weakens once a
banner exists.

Rough shape if that is the call: keep the pipeline, capture `utm_source` / `utm_medium` /
`utm_campaign`, expose `utm_campaign` as Lynx's single "utm parameter", migrate existing
`referral_code` values across. **The sanitiser must widen** — `/^[a-z0-9_-]{1,64}$/` rejects
a large share of real UTM traffic (ad platforms emit uppercase, dots, plus signs, encoded
spaces, and Meta macros expand to ad names containing spaces), and the CSV-injection concern
already documented in `referral.ts` matters *more* once we no longer author the values.
Case-folding needs deciding deliberately, or `Summer_Sale` and `summer_sale` become two
campaigns.

### Open decisions — none of these have been asked of anyone

1. **Does the banner ship?** Forced by DE and FI if the Vercel scripts stay. The
   alternative is dropping both scripts for server-side-only metrics. Kyle's call, informed
   by counsel.
2. **Does `ref` become UTM, or stay as it is?** Independent of (1). Satisfies Lynx's
   vocabulary either way, but only the rename retires the translation tax.
3. **Can a campaign value still be written at registration for a parent who rejected the
   banner?** Counsel. This determines whether Lynx's numbers are complete or systematically
   biased, and it is the last unknown blocking the design.
4. **Web Analytics Plus ($10/month per team)** buys native UTM parameters and a 24-month
   window. **Nothing Lynx asked for needs it** — only buy it if SOG wants top-of-funnel for
   its own reasons, and note it is consent-gated behind a banner while Google and Meta
   already report their own click counts more accurately.

### The half that is bigger than the banner

Lynx's schema sends them **parent email addresses plus each child's country, city, age
range and three consent statuses.** The `utm parameter` is the least sensitive field on
that list. This is third-party sharing of children's personal data and needs a lawful
basis, Lynx named in the privacy policy, and a data-sharing agreement — flagged on
2026-08-13 as the item "most likely to be missed", and still not started. **If counsel's
time is rationed, spend it here rather than on the banner.**

## Open decisions

- [ ] **The returned Privacy Policy counts the media choices both ways, and the app
      offers one.** Lynx preferred one box "if it's compliant (the lawyer will tell us)",
      and on 2026-09-07 the owner built the one box without waiting, on the reasoning
      that public use is the larger of the two scopes, so a single tick covering both
      grants nothing the wider half did not already grant. The lawyer's final text did
      not settle it: the short version lists two optional media choices (private
      reporting to Roblox; public use) and the body says "declining either media
      option", yet the body has only one choice section, *Public impact communications*.
      The policy also never mentions session reports, which the enrolment checkbox names
      as a use of the photo. Kyle's ruling on 2026-09-14: not his call, the wording is
      Lynx's; the app stays at one box and the text stays verbatim until Lynx answers.

      **Escalated 2026-09-14** — Kyle posted six questions to the Lynx × SOG Slack channel,
      addressed to Joyce (Lynx) and Mikko (SOG): one choice or two; whether the policy
      should name session reports; which Lynx contact address; "display name" versus first
      name; UTM (not a cookie; whether the campaign tag must be gated on marketing consent;
      the export fields and lawful basis); and whether a data-sharing agreement exists.
      Waiting on Lynx. The three that come back to this file are the media structure,
      display name (a product change only if Lynx says a nickname is required) and the
      recipients entry naming Lynx in the general privacy policy once the fields are
      confirmed.

      **If the answer is two boxes**, the change is bounded and known: the
      `gamer_photo_consent_type` enum gains a second value beside `lynx_educate`, the
      product attaches both, the enrolment panel asks two rows, and the policy's
      `.mediaPublic` section gains a sponsor-reporting sibling in Lynx's wording. **If
      the answer is one box**, the short version's two bullets and the "either" sentence
      are Lynx's to reword, and the app changes nothing.

## Resolved — ready to apply

Decided, with the exact change written out but not yet applied; an entry lands when Kyle
names it, and is deleted once its change is in.

