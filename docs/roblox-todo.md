# ROBLOX-TODO

## PAUSED — 2026-08-12

**This effort is on hold until a lawyer has reviewed the programme copy in full.** Kyle's
call. Nothing here is being worked, and **nothing in *Resolved — ready to apply* should be
applied**, until the reviewed copy comes back and has been compared against the platform.

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

- The in-person section's two wording choices, and the vetting-scope question. Our reply
  was drafted and held: Lynx asked a SOG colleague for her view first.
- The photography wording, and whether a written release covers projects shown at the
  closing event.
- The media consent structure. Lynx prefers one combined box "if it's compliant (the lawyer
  will tell us)" — so the direction is chosen and the answer is not.

**Findings surfaced but deliberately not opened as items,** so the pause does not start
work. Pick these up on resume:

- **A published claim we now know is inaccurate.** `robloxSafeguarding.sections.data` tells
  parents that any photography, filming or use of a child's image is "never assumed, always
  optional, always changeable". Lynx has since described Gedus routinely taking photographs
  and screenshots for internal records and safety, which consent does not gate — consent
  gates the external sharing. Proposed replacement wording is in the message drafted for
  Lynx on 2026-08-12. **Highest priority on resume**, and the one thing here that would
  need doing immediately if the surface were published.
- **The media sections assume two consent boxes.** If the single combined box is approved,
  `robloxPrivacy.sections.mediaSponsor` and `.mediaPublic` merge, and two strings that
  count the boxes move with them — see the registration checkboxes item for the exact keys.

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
tractable ones. Nothing is applied along the way. Once no open or escalated items are
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

      **Escalated 2026-08-11 — Lynx × SOG Slack, awaiting Lynx.** Our reply is drafted
      and deliberately held (see the two wording choices below): Lynx asked a SOG
      colleague for her view first. No response as of 2026-08-12.

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
- [ ] **Whose vetting does the Safeguarding Policy actually describe?** Surfaced while
      resolving the vetting list. "Who this covers" says the policy applies to "all Lynx
      Educate and School of Gaming staff, facilitators …, volunteers, and any contractor",
      but the section directly beneath it describes **only SOG's** process, and the
      resolved copy is explicitly scoped to SOG's Gedus. If Lynx staff supervise the
      French in-person events, either Lynx's equivalent vetting belongs alongside it or
      the heading needs to say it is SOG-specific.

      **Escalated 2026-08-11 — Lynx × SOG Slack, awaiting Lynx.** Rides on the same held
      reply as the in-person section above; it has not been put to Lynx separately, and
      should go in the same message when that thread unblocks.
- [ ] **/roblox landing page copy.** Open work like everything else here, not a wait —
      no signoff was ever separately requested for it. Signoff is the **final gate on the
      whole surface**, taken once with the rest of the list (see the publish-flip note at
      the top), so the landing page gets researched, proposed and resolved on the same
      terms as every other item, and joins the same pass. Nothing about it is blocked on
      anyone today.

      *Reviewed 2026-08-12.* The copy is written and complete — this was a review, not a
      drafting job, and every factual claim on the page has now been checked against the
      Terms and the Privacy Policy. Three findings, all written up: the age range
      (15–18 against the documents' 8–17), Roblox described as a partner rather than a
      sponsor, and an unconditional publishing promise. All three are in *Resolved*.
      Verified correct and left alone: "free", "in France", the online/in-person split,
      and the parent sessions.

      **Escalated 2026-08-12 — Lynx × SOG Slack, awaiting Lynx.** One claim could not be
      settled here: `why.recognised` sells showcasing at the closing event as a benefit,
      but the Privacy Policy says the registration media boxes cover "photographs and
      footage only" and that participant-created content needs a **separate written
      release**. So the page markets something registration does not consent to. Asked
      whether a release is collected at the event, and whether the checkbox set should
      cover participant-created content — raised while their lawyer still has the wording,
      since adding a consent later means re-review. **This item closes when that answer
      lands and `why.recognised` is either confirmed or softened.**

## Copy that needs correcting

Wording in the published documents that is wrong or self-contradictory. Now that Sogverse
owns the copy, most of this is ours to fix outright; what is left here is the exception,
where the fix would change what we commit to rather than how it reads.

- [ ] **"Sessions are not recorded" wording mismatch.** The Safeguarding Policy says it
      flatly (`robloxSafeguarding.sections.online.blocks.0.3`); the Privacy Policy says
      "*Routine* online sessions are not recorded" in three places and contemplates
      announced photography/filming at selected sessions and events. The two cannot both
      be read as written.

      *The directions are not equivalent.* Qualifying the safeguarding line to "Routine
      sessions are not recorded" makes it accurate and matches the Privacy Policy — but it
      is a **weakening of a safety promise**, and the safeguarding policy is where a parent
      goes looking for the strong version. Tightening the Privacy Policy the other way
      would mean committing that nothing is ever recorded, which the announced-filming
      provision contradicts.

      **Escalated 2026-08-12 — Lynx × SOG Slack, awaiting Lynx.** This one changes what
      the documents commit us to rather than how a sentence reads, so it is Lynx's call
      under the rule at the top, not ours. Asked which is the real commitment: routine
      sessions only, or no recording at all. Whichever comes back, the other document is
      the one that gets edited.

## Features the policies promise that the app does not have

- [ ] **Media-permission withdrawal setting.** Privacy Policy: a parent or child may
      withdraw a media permission "using the available Sogverse setting". Terms &
      Conditions goes further: "you can change your mind at any time in your Sogverse
      profile settings". No such setting exists. Needs a parent-settings surface for the
      two media consents (private sponsor reporting / public impact communications).
- [ ] **Programme registration consent checkboxes.** The Privacy Policy describes four:
      the *required* privacy-acknowledgement checkbox, the *optional* Lynx email
      checkbox, and the two *optional* media checkboxes. None exist.

      **Where they now live has changed — Kyle, 2026-08-13.** The programme is no longer
      getting its own registration form. The superset of `/register` is **dropped**:
      programme families sign up through the same registration everyone uses, and a
      product can be marked as requiring additional consents, which are then collected
      at the point of joining that product. So these four checkboxes are a
      *product-join* surface, not a sign-up surface, and the mechanism behind them is
      generic platform work rather than anything Roblox-specific. This does not change
      **which** consents are needed or what they say — only where a parent meets them.

      *Lynx's proposed set, 2026-08-12, wording with their lawyer:* (1) mandatory "I am
      the parent/legal guardian", (2) mandatory "I have read and agree to the Programme
      Terms & Privacy Policy", (3) optional Lynx marketing emails, (4) optional consent to
      external use of the child's photo/video — plus a **non-consent notice** that photos
      or footage may be taken during sessions for internal records, safety and reporting.
      It differs from the Privacy Policy in two ways: it adds the guardian checkbox, and
      it collapses our **two** media choices into **one**.

      **Lynx's preference, 2026-08-12: the one combined box, "if it's compliant (the
      lawyer will tell us)."** So the direction is chosen but the answer is not — do not
      restructure the policy's media sections until the lawyer confirms. If one box wins,
      `robloxPrivacy.sections.mediaSponsor` and `.mediaPublic` merge, and two other
      strings that count the boxes have to move with them:
      `robloxPrivacy.sections.mediaCaseStudies.blocks.0` ("The **two** registration media
      boxes cover photographs and footage only") and
      `robloxPrivacy.sections.useMedia.blocks.0` ("Declining **either** media option").
- [ ] **Facilitator↔parent messaging without exposing parent contact details.** The
      feature behind the claim removed above. If we ever want the claim back in the
      policies, the feature has to exist first.
- [ ] **Roblox impact-research data export.** The DPA-limited dataset (Roblox username,
      Roblox User ID, programme-account email, activity attended) has to actually reach
      Roblox somehow. No process or tooling exists for producing that export.
- [ ] **/roblox CTAs and events are deliberately inert.** Hero CTA, "For parents"
      button, closing CTA card go nowhere; Upcoming Events renders its empty state.
      They come alive when programme products + registration exist (the events section
      is presentational and takes rows — wiring is a data shell fetching Roblox-topic
      products).

      **When they are wired, they must become in-app `next/link` navigations, not
      `<a href>` full page loads.** Referral attribution (`?ref=` on a partner's link)
      is held in memory for the visit: a soft navigation keeps it alive, a hard load
      destroys it silently, with no error and no visible symptom — the code is simply
      absent at registration.

## Attribution, cookie consent, and the Lynx data export

**Opened 2026-08-26.** Research is complete and written up here; every decision in it is
still open. Nothing has been applied. The `?ref=` system is untouched and still live.

This sits in this file rather than `TODO.md` because Lynx's original ask is what created
it and Lynx's data schema is what resolves it — but note that the **cookie-banner half is
platform-wide, not programme-specific**, and would be true if the Roblox programme did not
exist.

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
- **The privacy policy still says nothing about the referral code, in any locale.** That
  was item 1 on the "non-negotiable" list from 2026-08-13 ("Update the privacy policy. This
  is important, needs to happen." — Kyle) and it never shipped. It is a GDPR Art 13
  transparency gap sitting in production **independent of how the banner question
  resolves**, and it is the cheapest thing on this page to fix.
- **`privacy.sections.cookies` answers the wrong question.** It says Vercel's analytics is
  "cookie-free", which is true and irrelevant — Art 5(3) does not care about the mechanism.
- **The `?ref=` note under "/roblox CTAs and events are deliberately inert" goes stale** if
  the rename happens. It is still correct today, and its underlying point (soft navigation
  keeps the value alive, a hard load destroys it) holds for any payload name.

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

- [ ] **Draft banners come off** each page as its copy is confirmed final (the banner is
      the "copy pending / in draft" warning added while content is incomplete). Not an
      escalation of its own — it resolves as a consequence of the signoff above, and the
      banner removal belongs in the one pass with everything else.

## Resolved — ready to apply

Decided, with the exact change written out. Nothing here has been applied yet; it all
lands in one pass. Delete an entry once its change is in.

### Landing page — Roblox is a sponsor, not a partner; and the publishing promise

Decided 2026-08-12. Two findings from the landing page's factual sweep, both ours: they
change how the page reads, not what anyone is obliged to do, and the legal documents
already settle the facts.

**Roblox is described wrongly, and it is the page Roblox signs off.** The Terms say
"Roblox Corporation ("Roblox") sponsors the Programme and provides the platform your child
will build on. **Roblox is not a party to these Terms.**" The Privacy Policy's subtitle
says "sponsored by Roblox". The landing page's hero says "in **partnership** with Roblox"
and the logo lockup is headed "A **partnership** between" over all three marks. The page
already disagrees with itself — `what.paragraph1` says "supported by Roblox", which is
fine. Aligning down is the safe direction: understating the relationship cannot offend
Roblox, overstating it can, and a company whose lawyers wrote "is not a party" into the
Terms is the one most likely to object to "a partnership between" above its own logo.
Deliberately not asked of Lynx — the documents are unanimous, and if Roblox's brand team
did approve "partnership" for promotional use, signoff is the gate that surfaces it.

**The publishing promise is unconditional and the Terms' is not.** The page says
participants "**will have published** their own original creation"; the Terms say sessions
culminate "in publishing their own game or item" — a destination, not a guarantee for
every child.

**Final English copy:**

> `roblox.hero.subtitle`
>
> A free Roblox game design programme for teens — brought to you by Lynx Educate and
> School of Gaming, sponsored by Roblox.

> `roblox.lockup.heading`
>
> Made possible by

> `roblox.what.paragraph2`
>
> The programme builds towards publishing their own original creation on Roblox. No
> experience necessary — just curiosity.

**To apply:**

1. Change those three keys in all five locales. `tlh` carries the `roblox` namespace (it
   is not a legal page), so it is included.
2. `roblox.what.paragraph1` keeps "supported by Roblox" — it is accurate and claims no
   partnership. **Do not also edit it here:** the age-range entry below rewrites that same
   string, and two entries editing one string is how one of them gets silently reverted.
   The page carrying both "sponsored by" and "supported by" is fine; neither is a false
   claim.
3. `roblox.lockup.heading` sits above the three logos, so keep the replacement short —
   "Made possible by" covers a sponsor and two deliverers without asserting a relationship
   between them.
4. Delete this entry.

**Checked and correct, so leave alone:** "free" (matches the Terms' cost section), "in
France" (matches eligibility), the online/in-person split and the parent sessions (both
match `robloxTerms.sections.whatsInvolved`).

### Landing page states the wrong age range

Decided 2026-08-12 by Kyle: **8–17 is correct.** The landing page says 15–18 and the legal
documents say 8–17; the landing page is the one that is wrong.

**Why this outranks a wording fix.** The range is load-bearing in both legal documents —
it is the Terms' eligibility criterion, and the Privacy Policy leans on it for parent-led
registration and its child-safety reasoning. The two ranges also disagree at *both* ends,
so it is not a typo: 15–18 excludes the 8–14s the documents cover and admits 18-year-olds,
who are adults and cannot be registered by a parent, which is the structure both documents
assume. And it is the page families meet first, so the error costs real registrations.

**Scope: one string per locale, five in total** — `roblox.what.paragraph1`. Nothing else in
the catalog states a programme age; the four legal mentions (`robloxPrivacy.intro.blocks.0`,
`robloxPrivacy.sections.applies.blocks.1` and `.4`, `robloxTerms.sections.eligibility.blocks.0`)
already say 8–17 and are **not** to be touched.

**Final English copy** — the paragraph is otherwise unchanged:

> This programme gives 8–17 year-olds in France the chance to design, code, and publish
> their own Roblox game — with the people who matter most cheering them on. Delivered by
> Lynx Educate and School of Gaming, and supported by Roblox, it is a hands-on introduction
> to game design, digital creativity, and safe online collaboration.

**"Teens" stays where we speak generally** — Kyle's call. `roblox.hero.subtitle`,
`roblox.how.step3.title` and `roblox.parents.body` keep it in every locale; they name no
range, and a general word for the audience is not a claim about eligibility.

**To apply:**

1. Change `15–18` to `8–17` in `roblox.what.paragraph1` in all five locales — `tlh` carries
   this namespace (it is not a legal page), so it is included. `fi` reads
   `15–18-vuotiaille`, `sv` `15–18-åringar`, `tlh` `15–18 ben`; each takes the digits only.
2. **French needs one more word changed.** It reads `aux ados de 15–18 ans` — `ados` means
   teenagers, which was consistent with 15–18 and is not with 8–17. Use `aux jeunes de 8 à
   17 ans`. This is the one place a general term sits directly against the explicit range in
   the same breath, so it is the one place the general/specific split above does not hold.
3. Delete this entry.

### Programme Terms — drop "available upon request"

Decided 2026-08-12. `robloxTerms.sections.safety.blocks.0` currently invites a reader to
*request* a document the same sentence is already offering them a click away: the policy
name is a cross-reference link to `/roblox/safeguarding`, and that page **is** the policy.

**Ours, not Lynx's.** Removing the clause strengthens the commitment rather than weakening
it — "on request" means you have to ask, a link means you do not — so it changes how the
sentence reads, not what anyone is obliged to do.

**Final English copy** — the whole block, unchanged but for the deleted trailing clause:

> Every session is supervised by a trained facilitator. Our approach to behaviour and
> safeguarding is set out in our joint <linkRobloxSafeguarding>Child Safeguarding
> Policy</linkRobloxSafeguarding>.

Nothing replaces the clause. A "you can read it here" would restate what the link already
says, and the link is the only pointer these pages ever use.

**To apply:**

1. In each locale, delete the trailing clause and close the sentence after the link tag.
   Each language phrases it differently, so it is a per-locale deletion, not one string
   swap — `en` ", available upon request.", `fi` ", joka on saatavilla pyynnöstä.",
   `sv` ", som finns tillgänglig på begäran.", `fr` ", disponible sur demande.". Leave the
   `<linkRobloxSafeguarding>` tag and its label exactly as they are. `tlh` omits
   `robloxTerms` and falls back to English.
2. Delete this entry.

**Also verified:** this was the only "upon request" anywhere in the programme copy, so
nothing is left inconsistent with it.

### External references become links — regulators only

Decided 2026-08-12. SOG's CEO was asked and declined the call ("no opinion nor knowledge
on this, do what Claude thinks is best"), so this is Claude's decision, recorded here so
it can be overturned by a person rather than rediscovered.

**Decision: the two regulator references become links. Everything else external stays
plain text.**

**Why the ban does not cover this.** The no-off-site-links rule governs *staff-authored*
copy shown to families — a gedu typing into a field nobody reviews. Legal copy is ours,
reviewed, translated and versioned. `/attributions` is already a legal-register page that
links out, and its own note scopes the rule exactly that way. Its reason for not building
on `PolicyPage` was that admitting *arbitrary* outbound URLs was a bad trade for one page;
that does not bite here, because the allow-list holds hrefs in code and only tags in copy,
so an external entry is a named destination, not an arbitrary one, and the existing
tag-parity test covers it unchanged.

**Why regulators and nothing else.** The external references are three kinds:

- *Regulators* are **rights-enabling** — the copy grants a right to complain, and a right
  nobody can act on is decoration. Both are broken today in different ways: the Finnish
  one renders the bare string `tietosuoja.fi`, which looks like a link and is not, and the
  French one names no address at all, in the document written for French families.
- *Third-party documents* (Roblox's own policy and terms, Lynx's standard Terms) sit at
  URLs we neither control nor watch. A dead link in a binding document is worse than a
  name the reader can search, and linking them implies we point at the version that
  applies, which we cannot guarantee.
- *Legal instruments* (Standard Contractual Clauses, adequacy decisions, the Roblox–Lynx
  DPA) are not linkable at all — the DPA is a private contract.

**No wording changes anywhere.** Every edit below wraps words already on the page, so
nothing needs retranslating and no Notion/Lynx pass is involved. Adding a visible address
("at cnil.fr") to the French sentence *would* be a wording change to a joint document —
deliberately not done. Link the homepages, not deep paths; both verified 200 on
2026-08-12:

- `linkTietosuoja` → `https://tietosuoja.fi`
- `linkCnil` → `https://www.cnil.fr`

**To apply:**

1. `src/components/legal/policy-content.ts`: add a `POLICY_EXTERNAL_HREFS` map beside
   `POLICY_LINK_HREFS` holding the two URLs above, and give `PolicySegment` a flag marking
   a segment as outbound. Both maps feed the same tag-matching path, so an unknown tag
   still unwraps to its words. **Correct the doc comment on the internal allow-list** — it
   currently says only our own documents are in there and that a regulator's site stays
   plain text, which this change contradicts. State the new rule and why third-party
   documents are still excluded.
2. `src/components/legal/policy-page.tsx`: `PolicyText` renders an outbound segment as
   `<a target="_blank" rel="noopener noreferrer">` with the `ExternalLink` glyph and an
   `sr-only` "opens in a new tab" label, matching `/attributions`'s `OutboundLink`
   exactly; internal segments keep `next/link`. `PolicyPage` takes the label as a required
   prop so a page cannot silently ship an unlabelled outbound link.
3. Move `opensInNewTab` from the `attributions` namespace to `legal` (the shared legal
   chrome) in `en`, `fi`, `sv`, `fr`, and update `/attributions` to read it from `legal`.
   `tlh` carries neither namespace, so there is nothing to move there.
4. Pass the label from all six legal pages. The three Roblox pages already pull a `legal`
   translator for `draftNotice`; `/privacy`, `/terms-and-conditions` and
   `/anti-bullying-and-discipline` need one added.
5. Wrap the tags in all four locales — `tlh` omits both namespaces. In
   `privacy.sections.contact.paragraphs.1`, wrap the existing `tietosuoja.fi` (en "at
   tietosuoja.fi.", fi/sv "(tietosuoja.fi)", fr "sur tietosuoja.fi."). In
   `robloxPrivacy.sections.rights.blocks.6`, wrap the existing `CNIL` (the dash before it
   differs by locale — en/fr em dash, fi/sv en dash — leave it alone).
6. Tests in `tests/unit/components/policy-cross-links.test.tsx`: the tag catalog and the
   "turns each known tag into a link to its route" case both need to know a segment can be
   outbound. Add cases pinning that an outbound segment renders an `<a>` carrying
   `rel="noopener noreferrer"` while an internal one still renders `next/link`, and that
   no legal string links a regulator this list did not approve.
7. Delete this entry.

**Deliberately excluded — do not add without a new decision:** links on Roblox's privacy
policy or terms, Lynx's standard Terms and Conditions, the Standard Contractual Clauses,
adequacy decisions, or the Roblox–Lynx DPA.

### The SOG contact address in the two "If you have a concern" sections

Decided 2026-08-12. Two questions, both closed.

**The address is `help@sog.gg`**, decided by the team: one customer-facing address
everywhere, replacing a three-way split (`help@` in the app chrome, `hello@` in the
Privacy Policy, `kanslia@` in the Terms and the discipline policy) that was one address
per document by accident. **That sweep is already applied** across all four locale files
that carry these strings, and the address is no longer written in `messages/` at all:
legal copy names it with a `{supportEmail}` placeholder that the policy renderer fills
from the `SUPPORT_EMAIL` constant, which is now the single source of truth. So the copy
below writes the placeholder, never the address — a unit test fails any legal string
that spells one out.

**We add it only where the copy is already asking for it.** Both documents render a
visible pending notice at "If you have a concern" saying a School of Gaming contact
address is still being confirmed; that is the gap, and it closes here. Everywhere the
programme copy names Lynx alone and shows no pending marker, Lynx stays the only
address — `robloxTerms.intro`'s "If anything's unclear, email support@lynxeducate.com"
is complete as written and is **not** part of this change. (The list previously recorded
these as `xxx@sog.gg` / `xx@sog.gg` placeholders in the copy. They are not literals in
the message files; the pending notices are how the hole is shown.)

**Final English copy.** SOG is named first because the escalation section directly above
already says concerns are handled by School of Gaming in the first instance; Lynx's
address is unchanged and stays alongside.

> `robloxSafeguarding.sections.concern.blocks.0`
>
> If you or your child have a safeguarding concern, please contact School of Gaming at
> {supportEmail} or Lynx Educate at support@lynxeducate.com.

> `robloxTerms.sections.concern.blocks.0`
>
> If you’re concerned about your child’s experience in the Programme, contact School of
> Gaming at {supportEmail} or Lynx Educate at support@lynxeducate.com — we’ll make sure
> it reaches the right people.

The apostrophes above are curly (’) and the dash is an em dash, matching the surrounding
message strings — paste them through, don’t retype them straight.

**To apply:**

1. Replace those two strings in each locale file that carries the namespaces. Keep
   `{supportEmail}` exactly as written — it is filled at render, and the
   translation-completeness script fails a locale that drops or renames it. `tlh` omits
   legal pages and falls back to English, so check before translating.
2. In `src/app/(public)/roblox/safeguarding/page.tsx`, change the `concern` entry in
   `SECTIONS` from `pending: "pendingContact"` to `pending: null`.
3. In `src/app/(public)/roblox/terms/page.tsx`, change the `concern` entry in `SECTIONS`
   from `pending: true` to `pending: false`.
4. Delete the now-unused `pendingContact` key from `robloxSafeguarding` and `robloxTerms`
   in every locale file — it is the last thing referencing it, and the completeness
   script flags a key present in one catalog and absent from another.
5. Delete this entry.

**Still open upstream:** the Notion originals carry the `xxx@sog.gg` / `xx@sog.gg`
placeholders these notices stand in for. Resolving them there to `help@sog.gg` keeps the
document of record matching the published page — same class as the other entries under
*Claims that need correcting*, and worth folding into the next Lynx/Notion pass.

### Child Safeguarding Policy — vetting & training list

Decided 2026-08-11 by SOG's CEO. The section "Before someone works with children" ended
on "This includes:" with the list missing (`xxx` in the draft), so the page renders the
`pendingSection` marker instead.

**Grounding, so nobody re-litigates it:** sog.gg already commits to this publicly —
"Our educators undergo thorough background checks and are trained by School of Gaming for
their role" (`/lessons/…`), "trained, background-checked Gedu" (`/partnerships/schools`),
and over-18 plus "successfully finish School of Gaming's Basic Course" (`/jobs`). The
mechanics come from the Gedu handbook (`src/data/gedu-docs/Gedun Perusopas 2026.md`):
framework contract walked through with SOG staff before signing, the written three-step
warning procedure attached to it, and the criminal record extract shown but not retained.

**Final English copy** — the lead-in paragraph is unchanged; the bullets are new. Plain
prose with no markup: the policy renderer only understands cross-reference link tags, and
none apply here.

> All Game Educators (Gedus) are required to complete School of Gaming's own vetting and
> training process before working with children on Sogverse. This includes:
>
> - Being over 18. Every Game Educator is an adult.
> - A background check. Every Gedu shows us a criminal record extract of the kind issued
>   for people who work with children, before they're assigned to any group — so we know
>   who is spending time with your child. We check it ourselves, and we're not allowed to
>   keep a copy, so we don't.
> - School of Gaming's Basic Course for game educators, which every Gedu has to complete
>   successfully.
> - Our Game Educator handbook, which sets out how we expect a Gedu to behave and makes
>   the atmosphere of the group their responsibility.
> - A signed agreement with School of Gaming, talked through with a member of our staff
>   before it's signed. It sets out the written procedure we follow — starting with a
>   warning and a conversation — if a Gedu doesn't meet those expectations.

**To apply:**

1. In each locale file that carries the namespace, append the five bullets as a second
   entry in `robloxSafeguarding.sections.vetting.blocks` — an array of strings, after the
   existing lead-in paragraph string. Check whether `tlh` carries `robloxSafeguarding` at
   all before translating: `tlh` omits legal pages and falls back to English for them.
2. In `src/app/(public)/roblox/safeguarding/page.tsx`, change the `vetting` entry in
   `SECTIONS` from `pending: "pendingSection"` to `pending: null`.
3. Delete this entry.

**Two claims deliberately excluded** — do not add them back without a new decision:

- *Any re-check or ongoing monitoring.* The extract is valid six months and, per the
  handbook, is never re-shown.
- *That unverified educators cannot reach the platform.* In Sogverse today `verified`
  gates only group assignment and instant-voice-room moderation, and the assignment gate
  is UI-only — `apply_group_changes` does not re-check it.

**Rejected:** a bullet for the *Nepsy-lasten ohjaaminen pelikerhossa* course — the CEO
confirmed it is optional, mandatory only for ND-specific groups, so it fails the test
every bullet here must pass (true of every Gedu, before any group). The conditional
version was rejected too: ND groups are a Finnish municipality arrangement, and raising
them in a France programme policy poses a question the document never answers.

**Also rejected:** a bullet for the in-Sogverse verification step. It is one admin button
with no recorded criteria, every pre-existing gedu was bulk-verified with `verified_by`
NULL, and the gate it controls is UI-only — publishing it would imply a control that is
not really there.
