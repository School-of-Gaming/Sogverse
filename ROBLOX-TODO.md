# ROBLOX-TODO

Everything still open for the Roblox / Lynx Educate programme launch: placeholder copy
waiting on real content, published claims that need correcting, and features the legal
documents promise that the app does not have yet. Same semantics as `TODO.md`: this file
tracks open work only — when an item is fully done, delete it; when the file is empty,
delete the file. The record of what was done lives in git history.

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
   - **The Lynx × SOG Slack channel** — Lynx's call, or an upstream Notion edit. Draft
     it **explicitly framed as coming from Claude**, with the context and a clear ask.
     Keep it short; the channel already has the context that we're editing this copy.

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
- [ ] **/roblox landing page copy** is still pending SOG + Roblox signoff (why the whole
      surface is noindex).

      **Escalated — awaiting SOG + Roblox signoff.** Who was asked, when, and through
      which channel is not recorded; this predates the convention. Fill it in, or re-ask,
      before treating the wait as live — an escalation nobody can date is indistinguishable
      from one that was never sent.

## Claims that need correcting (upstream, in Notion / with Lynx)

- [ ] **The facilitator↔parent messaging claim is gone from our pages but still lives in
      the upstream documents.** Both Notion originals claim Game Educators can reach
      parents through the platform without seeing parent contact details ("Facilitators
      can communicate with parents through Sogverse without seeing the parent's email
      address or telephone number" in the Privacy Policy; the equivalent bullet was
      struck through in the Safeguarding Policy). Not currently true — removed from the
      web copy on 2026-08-11. The Notion documents (and whatever version Lynx's lawyers
      reviewed) need the same edit so the document of record matches the published page.
- [ ] **"Child Safeguarding Policy, available upon request" (Terms & Conditions).** That
      policy now has a page at `/roblox/safeguarding`, so "upon request" undersells it —
      the Terms wording should point at the page instead. The document's name in that
      sentence is now a link to the page, but the words "available upon request" are
      rendered faithfully as written, because changing them is an upstream/Notion edit.
- [ ] **"Sessions are not recorded" wording mismatch.** The Safeguarding Policy says it
      flatly; the Privacy Policy says "*Routine* online sessions are not recorded" and
      contemplates announced photography/filming at selected sessions/events. Align the
      safeguarding wording ("Routine sessions are not recorded") so the two documents
      cannot be read against each other. Also an upstream/Notion edit.

## Features the policies promise that the app does not have

- [ ] **Media-permission withdrawal setting.** Privacy Policy: a parent or child may
      withdraw a media permission "using the available Sogverse setting". Terms &
      Conditions goes further: "you can change your mind at any time in your Sogverse
      profile settings". No such setting exists. Needs a parent-settings surface for the
      two media consents (private sponsor reporting / public impact communications).
- [ ] **Programme registration consent checkboxes.** The Privacy Policy describes four:
      the *required* privacy-acknowledgement checkbox, the *optional* Lynx email
      checkbox, and the two *optional* media checkboxes. None exist — programme
      registration itself doesn't exist yet (planned as a superset of `/register`; see
      the note in `src/components/roblox/partnership-cta.tsx`).
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

## Tone — where the programme documents don't sound like Sogverse

The house standard (set by the existing `/privacy` and `/terms-and-conditions` copy):
plain language a parent can read in full without feeling overwhelmed; warm second
person ("you", "your child"); jargon translated inline the moment it appears ("in legal
terms, we're the 'data controller'"); every collected item explained with a "— so we
can…" reason. These are joint documents, so tone rewrites are upstream (Notion/Lynx)
edits first — the web copy follows the signed-off text.

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
