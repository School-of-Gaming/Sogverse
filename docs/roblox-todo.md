# ROBLOX-TODO

## PAUSED — 2026-08-12

**This effort is on hold until a lawyer has reviewed the programme copy in full.** Kyle's
call. Nothing here is being worked until the reviewed copy comes back and has been
compared against the platform. The one exception so far: on 2026-09-07 Kyle had every
entry then under *Resolved — ready to apply* applied in one pass, since each was already
decided and the surface is still unpublished; a new resolved entry waits as before.

*Why pausing is safe:* the whole programme surface is unpublished — noindex, absent from
the sitemap, no nav links — so none of the copy discussed below is reaching a family. That
is what makes it reasonable to leave known-inaccurate wording sitting in the catalog rather
than racing to fix it. **If any part of `/roblox` is published before this resumes, that
reasoning is void** and the findings listed below have to be dealt with first.

**On resume, do this before touching anything else.** Diff the returned copy against
`messages/`. The resolved entries were written against today's strings, and a legal rewrite
can move a key, merge a section, or delete the very sentence an entry edits. **The
decisions survive; the strings and keys may not** — re-derive each entry's mechanical steps
against the new text rather than applying them blind. Then re-read the escalations below,
since some may have been answered inside the review itself.

**Outstanding with Lynx when the pause began:**

- The in-person section's two wording choices. Re-asked on 2026-09-07; Lynx asked to see
  the clause, which was sent the same day. (The vetting-scope question, the photography
  wording and the closing-event release were all answered on 2026-09-07 — see the items.)
- The media consent structure. Lynx prefers one combined box "if it's compliant (the lawyer
  will tell us)" — so the direction is chosen and the answer is not. **Kyle decided on
  2026-09-07 to build the one box anyway** and record the unanswered question; see the
  open item under *Features the policies promise*.

**Findings surfaced but deliberately not opened as items,** so the pause does not start
work. Pick these up on resume:

- **The intention sentence in `robloxSafeguarding.sections.data` is fixed** (2026-09-07,
  on `feat/gamer-photo-consent`): it now states the mechanism — a child appears in a
  photograph only where the parent ticked the consent, the parent can change that answer
  on the child's page in My SOG, and a Gedu asks the child first even where the parent
  consented. **What remains open is the claim underneath it.** Lynx described Gedus
  routinely taking photographs for internal records and safety, which in their account
  consent does not gate; the owner's 2026-09-07 decision is the opposite — a gamer without
  consent stays out of session photographs *entirely* — and all three documents now say
  so. **Answered 2026-09-07 by Lynx (Joyce): no such photography is needed**, so the
  documents stand — with one request, recorded under *Open decisions*: a line allowing
  non-identifying wide shots of an event taken from a distance.

---

Everything still open for the Roblox / Lynx Educate programme launch: placeholder copy
waiting on real content, published claims that need correcting, and features the legal
documents promise that the app does not have yet. Same semantics as `TODO.md`: this file
tracks open work only — when an item is fully done, delete it; when the file is empty,
delete the file. The record of what was done lives in git history.

**Sogverse is the source of truth for this copy.** The Notion documents were the draft.
They have been accepted one-way, and the published pages are now the document of record —
so a wording problem in one of these documents is *ours to fix*, not an upstream edit to
request, and there is no longer an upstream to drift from. Lynx remains a party to the
joint documents, so changing what someone is **obliged to do** still goes to them; changing
how a sentence **reads** does not.

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
tractable ones. Nothing is applied along the way (the one exception is recorded in the
pause banner at the top). Once no open or escalated items are
left **and Kyle gives the go-ahead**, the whole of *Resolved — ready to apply* lands in
**one pass**, translated and reviewed together rather than dribbling in item by item.
Each resolved entry therefore has to be self-contained enough for a fresh session to
apply it with no prior context: the final English copy, the message keys, and the
mechanical steps.

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
7. **Nothing lands until the list is empty and Kyle says go.** That is the one hard rule
   here. The value of the single pass is that the whole document gets translated and
   reviewed as a piece, by people looking at it together — applying a resolution early
   spends that and cannot be given back.

## Placeholder copy waiting on real content

Each gap below renders a visible "still being written" marker on the page rather than
invented copy or a silently short section, and every programme legal page carries a draft
banner until its copy is signed off.

- [ ] **Child Safeguarding Policy — "During in-person events" section.** Entirely
      missing (was `xyz` in the draft). **The responsibility split is settled; only two
      wording choices are open, and the section is publishable whichever way they go.**

      **Escalated 2026-08-11 — Lynx × SOG Slack, awaiting Lynx.** Re-asked on 2026-09-07
      in a batch of five questions to Joyce; she asked which document the clause sits in
      and for its wording, and the full draft below plus the backstop sentence went back
      the same day. Awaiting her confirmation of both.

      *Why nothing existing filled it:* every control in the "During online sessions"
      section (Sogverse accounts, no child-to-child DMs, no outside invites, sessions not
      recorded) is a property of our platform and none of it carries to a room, and the
      Gedu handbook has no in-person safeguarding protocol to reuse despite SOG running
      plenty of in-person activity. Photography is already handled by the `data` section
      deferring to the Privacy Policy, and emergencies by the `escalation` section.

      *Settled — SOG's position*, from SOG's CEO on 2026-08-11: SOG is the act, not the
      organiser. "We are not the organizer of the event. We are the show number." Whoever
      invites us in owns the venue, arrival and collection, supervision around the
      session, and first aid. Write this as **who does what, never as a disclaimer** —
      the policy's own intro promises a child is safe "whether they're joining online or
      attending an in-person event", so a section that reads as "not our problem"
      contradicts the document two headings above it. The second paragraph below is what
      stops it reading as a shrug, and it costs nothing because it is all already true.

      *Settled — who the counterparty is*, from Lynx on 2026-08-11: **Lynx Educate and
      its venue partners.** Lynx also confirmed that under their contract with Roblox,
      Lynx is ultimately on the hook for ensuring venues and facilitators comply with
      safety and child protection requirements. Frances leads venue partnerships once
      back in office — that gates the venue *negotiations*, not this copy, since the
      policy states who holds the duty and the contracts implement it.

      *Draft* (Lynx proposed the first sentence; the colon-clause is ours, restored):

      > Our Game Educators run the session; they are not the organisers of the event.
      > Lynx Educate and its venue partners are responsible for the venue and the
      > arrangements around it: the space itself and its safety, how children arrive and
      > are collected, supervision before and after the session, and first aid.
      >
      > Inside the session, the group is ours. The standards of behaviour, supervision
      > and escalation set out in this policy apply in a room exactly as they do online,
      > and the same trained, background-checked Game Educators lead both.

      *Open — two wording choices, both strengthenings:* (1) Does the colon-clause stay?
      Lynx's own version stopped at "the arrangements around it", which is the part a
      parent cannot picture — the section's job is letting them see arrival, collection
      and first aid are somebody's named responsibility. (2) Do we publish Lynx's
      backstop? Something like "Lynx Educate is responsible for making sure the venues
      and facilitators it works with meet the Programme's safety and child protection
      requirements." It is the most reassuring sentence available and currently exists
      only in Slack. A reply making both arguments is drafted but **deliberately held**:
      Lynx asked a SOG colleague for her view first, and posting ahead of her would
      pre-empt it — the backstop point especially.

      *Also:* the page subtitle says the document covers "Lynx Educate and School of
      Gaming's broader safeguarding responsibilities for the Programme, including
      in-person events". With this section that overpromises — it covers who *holds*
      those responsibilities. Trim it in the same pass.
## Copy that needs correcting

Wording in the published documents that is wrong or self-contradictory. Now that Sogverse
owns the copy, most of this is ours to fix outright; what is left here is the exception,
where the fix would change what we commit to rather than how it reads.

Nothing open here right now.

## Features the policies promise that the app does not have

- [ ] **The mandatory "I am the parent/legal guardian" checkbox.** The rest of Lynx's
      proposed registration set (2026-08-12) landed on `feat/gamer-photo-consent`: the
      required Terms & Privacy bundle, the optional Lynx email box and one optional
      media box are all asked when a parent enrols a participant in a product that
      attaches them — per gamer for the photo box, editable afterwards on the gamer's
      page under the parent's My SOG, visible read-only to the gamer and to admins, with
      a roster list on the Gedu session editor. The guardian checkbox is the one item of
      that set with no surface, and it is a platform-wide question rather than a
      programme one (every parent account already asserts the relationship implicitly by
      creating the gamer).

      Lynx's set also carried a **non-consent notice** — that photographs may be taken
      during sessions for internal records, safety and reporting regardless of the box.
      That notice is **not** built and the documents now say the opposite: a gamer
      without consent stays out of session photographs entirely. See the finding at the
      top of this file; the two accounts have to be reconciled with Lynx.
- [ ] **Facilitator↔parent messaging without exposing parent contact details.** The
      feature behind the claim removed above. If we ever want the claim back in the
      policies, the feature has to exist first.
- [ ] **Roblox impact-research data export.** The DPA-limited dataset (Roblox username,
      Roblox User ID, programme-account email, activity attended) has to actually reach
      Roblox somehow. No process or tooling exists for producing that export.

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
- **Meta and TikTok pixels ship, behind marketing consent**, using School of Gaming's own
  pixel IDs.
- **The partner prefix convention survives the rename** as a `utm_campaign` naming
  convention: a campaign issued to or for a partner is prefixed with the partner's slug
  and a hyphen (`lynx-summer-a`, `rblx-launch`). It cannot be retrofitted, because the
  value is immutable once written. It is documented in `src/lib/utm.ts` and on the
  `profiles.utm_campaign` column comment.
- **`docs/plans/referral-landing-clicks.md` is deleted**, as the knock-on below proposed.
- **The wrong premise is corrected where it was recorded.** "Nothing is written to the
  device, therefore no banner" no longer appears anywhere in the code: the module header
  now says that reading the params off the landing URL is itself what engages Art 5(3),
  that it happens pre-consent, and that the banner governs the browser scripts rather
  than this. Two of the three files the paragraph below names are gone with the rename
  (`src/lib/referral.ts` → `src/lib/utm.ts`, `referral-provider.tsx` → `utm-provider.tsx`)
  and the third was the deleted plan.

Not resolved, and unchanged: the third-party sharing of children's personal data in
Lynx's schema — see "The half that is bigger than the banner" — and the privacy policy's
answer to the cookie question.

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

### Knock-ons when this resolves

- **`docs/plans/referral-landing-clicks.md` should be deleted, not built.** Its purpose was
  a click *denominator*, which Lynx never asked for; both its rejected-alternative
  arguments (device storage needs a banner; UTM needs the Plus add-on we don't want) have
  collapsed; and it concedes in its own constraints that ad platforms count clicks better
  than we can. **Rescue one thing first:** the partner code prefix convention
  (`lynx-summer-a`, `rblx-launch`), which cannot be retrofitted because the value is
  immutable once written, and which survives the rename as a `utm_campaign` convention.
  Worth settling before the first Lynx campaign link goes out.
- **The privacy policy does disclose the attribution value, and the wording now needs to
  match the rename.** `privacy.sections.infoWeCollect.bullets` carries a bullet in all
  five locales — "If you came to us through a link shared by a school, club or partner
  organisation, a short code telling us which one" — so the Art 13 transparency gap
  claimed here on 2026-08-26 was not real; the bullet had already shipped. What is left is
  smaller and still worth doing: the copy describes *one* short code, and there are now
  three UTM fields, so the sentence should be re-read against what is actually stored. It
  is also written in the register a parent reads, which is why it says "a short code"
  rather than naming the columns — keep that. *(Done — 2026-09-03. The bullet now names
  the campaign tag and its three parts, says it is stored once at account creation, and
  keeps the parent's register; `en`, `fi`, `sv`, `fr`.)*
- **`privacy.sections.cookies` answers the wrong question.** It says Vercel's analytics is
  "cookie-free", which is true and irrelevant — Art 5(3) does not care about the mechanism.
  *(Done — 2026-09-03. The section was rewritten as "Cookies, analytics and advertising":
  strictly necessary cookies first, then the two purposes a visitor actually consents to,
  each naming what runs and what it learns. "Cookie-free" is gone from the Vercel bullet
  under `providers` too, and the answer is now collected by a consent banner rather than
  asserted by the copy.)*
- **The `?ref=` note on the since-closed inert-CTAs item goes stale** if
  the rename happens. It is still correct today, and its underlying point (soft navigation
  keeps the value alive, a hard load destroys it) holds for any payload name. *(Done — the
  note named the UTM params, and the item has since closed: the CTAs and the events
  section are wired, through `next/link`.)*

## Tone — where the programme documents don't sound like Sogverse

The house standard (set by the existing `/privacy` and `/terms-and-conditions` copy):
plain language a parent can read in full without feeling overwhelmed; warm second
person ("you", "your child"); jargon translated inline the moment it appears ("in legal
terms, we're the 'data controller'"); every collected item explained with a "— so we
can…" reason. Tone is ours: the copy has been accepted one-way and Sogverse
holds it now, so a rewrite that changes how a sentence reads without changing what it
commits anyone to needs no upstream pass. Where a rewrite would alter an obligation
rather than its wording, that part goes to Lynx.

**Blocked 2026-08-12 by Kyle: none of this starts until a lawyer has reviewed the copy as
a whole.** Two reasons it has to be that order. A tone pass on text a lawyer may rewrite
is work done twice; and tone edits to legal prose move meaning whether or not they intend
to, so the version a lawyer signs off should be the version families read. **This review
has not been requested yet** — it needs arranging, and it is nobody's job until someone
takes it. Best sequenced after the media-consent structure settles with Lynx, so the
lawyer is not reviewing sections that are about to be restructured.

- [ ] **Programme Privacy Policy — the "short version" fails its own audience.** It is
      titled "for parents and young people" yet leads with the controller/processor/
      sub-processor triangle ("Roblox is the data controller, Lynx Educate acts as
      Roblox's data processor, and School of Gaming acts as Lynx Educate's approved
      sub-processor") — undefined jargon in the one section meant to be readable by
      everyone. The policy itself notes French law "requires information addressed to a
      child to be clear and easily understandable"; the short version as written doesn't
      meet the standard it quotes. The responsibilities split can move to the "Who is
      responsible" body section and be glossed the way the house policy glosses
      "data controller".
- [ ] **Programme Privacy Policy — untranslated jargon throughout.** "Legitimate
      interests" (used five times, never explained), "vital interests", "adequacy
      decision", "Standard Contractual Clauses", "Data Processing Addendum",
      "pseudonymisation", "suppression record", "solely automated decision-making that
      produces legal or similarly significant effects". The house policy shows the fix
      for each: keep the legally required concept, add the plain-words gloss (e.g. its
      "usually the European Commission's Standard Contractual Clauses" sits inside a
      sentence a parent can follow).
- [ ] **Programme Privacy Policy — bullets state *what* without *why*.** House-style
      collection bullets pair each item with its reason ("your child's Minecraft
      username — so they can connect to our Minecraft server"). The programme policy's
      lists ("Roblox username and Roblox User ID.") drop the reassurance that does the
      most to keep a parent unoverwhelmed.
- [ ] **Programme Privacy Policy — institutional passive voice in places.** E.g. "Where
      information is transferred outside the EEA, the responsible organisation uses an
      approved transfer mechanism" vs the house "When your information is sent to them,
      we make sure it's protected". Same content, different temperature.
- [ ] **Length.** The programme privacy policy is roughly three times the house policy.
      Some of that is genuinely required (three organisations, media consents, research
      transfer), but sections like retention and security could compress toward the
      house policy's register without losing legal content.
- [ ] **Terms & Conditions and Safeguarding Policy are broadly on-tone** — friendly,
      short, second person. One small spot: "apply alongside (and take precedence over,
      where they conflict with)" could be said plainly ("if the two ever disagree, these
      programme terms win").

## Open decisions

- [ ] **Lynx's lawyer has not confirmed that one combined media box is compliant.**
      Lynx preferred one box "if it's compliant (the lawyer will tell us)". On
      2026-09-07 the owner decided to build the one box without waiting, on the
      reasoning that public use is the larger of the two scopes — a parent who agrees to
      their child appearing on Roblox's and Lynx Educate's public channels is agreeing to
      more than private sponsor reporting, so a single tick covering both grants nothing
      the wider half did not already grant. The policy sections were merged to match on
      `feat/gamer-photo-consent`: `robloxPrivacy.sections.mediaSponsor` and `.mediaPublic`
      are gone, replaced by a single `.mediaChoice`, and every string that counted two
      boxes was rewritten in all three translated locales that carry the legal
      pages (`tlh` omits them and falls back to English).

      **If the lawyer wants two boxes**, the change is bounded and known: the
      `gamer_photo_consent_type` enum gains a second value beside `lynx_educate`, the
      product attaches both, the enrolment panel asks two rows, and `.mediaChoice` splits
      back into a sponsor-reporting section and a public-use one — the pre-merge wording
      for both is in the `messages/*.json` history at the commit before this branch.
- [ ] **Whether a Gedu's own likeness in a session photo is covered when Lynx or Roblox
      use it.** Raised 2026-09-07 alongside the box question so it rides to the lawyer at
      no extra cost. Gedus working these products expect to appear in photos — it is
      part of the job — and the Gedu contract already grants School of Gaming permission
      to publish their photo and assigns photos taken on assignment to us. What nothing
      yet states is whether that permission extends to a *third party's* use: a session
      photo a Gedu appears in, on Lynx Educate's or Roblox's website. Neither privacy
      policy mentions Gedu images in either direction. If the answer is that it does not,
      the fix is a clause in the Gedu contract, not a line in the parent-facing policies.
- [ ] **Non-identifying wide shots of an event.** Lynx's request, 2026-09-07 (Joyce):
      having confirmed that no internal-records photography is needed, she asked for a
      line saying non-identifying photos of an event or workshop may be taken from a
      distance, the key being that nobody is identifiable in them. This is a carve-out
      from the promise all three documents now make — a child without the consent is
      "kept out of session photographs and footage entirely" — so it is **Kyle's call**
      whether to make it. The sentence proposed to Lynx the same day, to be placed
      directly after that promise in each of `robloxPrivacy.sections.mediaChoice.blocks.3`,
      `robloxPrivacy.sections.mediaChildAgrees.blocks.1`,
      `robloxSafeguarding.sections.data.blocks.0` and `robloxTerms.sections.media.blocks.0`:

      > Wide shots of an event or workshop may be taken from a distance, where no child
      > is identifiable.

      It passes the mechanism test as far as a photograph can — a parent can look at the
      picture and check the claim — and Lynx's confirmation of the wording is still
      outstanding.
- [ ] **Free products, the FREE price, and the waitlist.** Kyle's flag, 2026-08-30.
      Looked into on 2026-09-07, and the machinery is not the gap. The admin product
      form shows the waitlist tick for any capped product of any type, and switching a
      product to free turns the cap on and defaults the waitlist to on — so a free,
      capacity-capped programme event can offer a waitlist today, and its details page
      shows the waitlist CTA once it fills. What the browse card shows is a deliberate
      choice rather than a FREE-specific one: the seat bar is confined to municipality
      clubs, and every other card says nothing about capacity, so a full product with a
      waitlist looks open until it is opened (the card shell's own comment accepts this).
      What is left is Kyle's decision: whether programme events — free, capped, and
      exactly the kind of product that fills — should carry the seat bar or a waitlist
      marker on the card after all.
- [ ] **Draft banners come off** each page as its copy is confirmed final (the banner is
      the "copy pending / in draft" warning added while content is incomplete). Not an
      escalation of its own — it resolves as a consequence of the signoff above, and the
      banner removal belongs in the one pass with everything else.

## Resolved — ready to apply

Decided, with the exact change written out but not yet applied; entries land together in
one pass, and each is deleted once its change is in.

### Safeguarding Policy — the vetting section is School of Gaming's

Decided 2026-09-07 by Lynx (Joyce): "just SOG". "Who this covers" names Lynx Educate's
staff as well as ours, and the vetting section beneath it describes only School of
Gaming's process for its Game Educators; the fix is to say so in the heading rather than
to describe a Lynx process that does not apply.

**Final English copy** — `robloxSafeguarding.sections.vetting.heading`:

> Before a Game Educator works with children

The lead-in paragraph and the five bullets already say whose process it is and are
unchanged.

**To apply:**

1. Change the heading in `en`, `fi`, `sv` and `fr` (`tlh` omits the namespace). Keep it
   sentence case.
2. Delete this entry.

### Privacy Policy — sessions are not recorded, not only routine ones

Decided 2026-09-07 by Lynx (Joyce): "not recorded". The Safeguarding Policy already says
it flatly, so the Privacy Policy is the document that gets edited, in the three places
that said "routine". The announced-photography sentence survives, narrowed to events:
filming at an in-person event with the media consent is a different thing from recording
a session, and the sentence no longer suggests a "selected session" might be filmed.

**Final English copy:**

> `robloxPrivacy.intro.blocks.6`
>
> Online sessions are not recorded. A child will not be photographed or filmed where the
> required permission has not been given or where the child does not want to take part.

> `robloxPrivacy.sections.media.blocks.0`
>
> Online sessions are not recorded. Where photography or filming is planned for an event,
> families will be told in advance.

> `robloxPrivacy.sections.childSafety.blocks.1.5`
>
> Sessions are not recorded.

**To apply:**

1. Change the three strings in `en`, `fi`, `sv` and `fr` (`tlh` omits the namespace):
   drop the "routine" qualifier from each, and in the media block replace "a selected
   session or event" with "an event" in each locale's phrasing.
2. `robloxSafeguarding.sections.online.blocks.0.3` ("Sessions are not recorded.") is
   already right and is not touched.
3. Delete this entry.
