# ROBLOX-TODO

Everything still open for the Roblox / Lynx Educate programme launch: placeholder copy
waiting on real content, published claims that need correcting, and features the legal
documents promise that the app does not have yet. Same semantics as `TODO.md`: this file
tracks open work only — when an item is fully done, delete it; when the file is empty,
delete the file. The record of what was done lives in git history.

An item has two states. **Open** — still being researched or waiting on a decision;
it sits in one of the topic sections below. **Resolved** — the decision is made and the
exact change is written down, but nothing has been applied to the codebase yet; it moves
to [Resolved — ready to apply](#resolved--ready-to-apply) at the foot of this file. The
copy changes land in **one pass at the end**, once enough of the document is settled to
be worth translating and reviewing together, rather than dribbling in item by item. Each
resolved entry therefore has to be self-contained enough for a fresh session to apply it
with no prior context: the final English copy, the message keys, and the mechanical
steps.

The programme surface (`/roblox` and its child pages) is unpublished — noindex, absent
from the sitemap, no nav links — until copy is signed off by SOG and Roblox. The flip to
published happens for all of it together: nav + sitemap + noindex in one change (see the
comment on `roblox` in `src/lib/constants/routes.ts`).

## How we work through this list

One item at a time, start to finish, before touching the next.

1. **Research it first.** The truth lives in the repo, the database, the internal Gedu
   handbook (`src/data/gedu-docs/`), and the public **sog.gg** marketing site — sog.gg
   already publishes claims we can reuse rather than invent (it is where "trained,
   background-checked Gedus" is already committed to in public, for example).
2. **Propose, then ask.** Bring back a concrete resolution and the specific decisions it
   needs — not an open "what should this say?".
3. **Change no copy until the resolution is settled.** These are joint legal documents;
   the web copy follows the signed-off upstream text rather than leading it. Editing
   ahead of a decision publishes a claim nobody agreed to.
4. **Escalate what isn't ours to decide.** If it's Lynx's call or an upstream Notion
   edit, draft a message for the Lynx × SOG Slack channel — explicitly framed as coming
   from Claude, with the context and a clear ask — and put it on the clipboard to paste.
   Keep it short; the channel already has the context that we're editing this copy.
5. **Put the finalised draft on the clipboard for review.** Plain prose, no Slack markup
   — it is the copy itself, so it has to paste cleanly into Notion or the channel. Verify
   the encoding by codepoint after copying; em dashes and curly quotes are the ones that
   corrupt silently.
6. **Write the resolution down, don't apply it.** Move the item to *Resolved — ready to
   apply* with the final copy and the steps. The edits happen in one pass at the end.

## Placeholder copy waiting on real content

Each gap below renders a visible "still being written" marker on the page rather than
invented copy or a silently short section, and every programme legal page carries a draft
banner until its copy is signed off.

- [ ] **Child Safeguarding Policy — "During in-person events" section.** Entirely
      missing (was `xyz` in the draft). **The responsibility split is settled; only two
      wording choices are open, and the section is publishable whichever way they go.**

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
      the heading needs to say it is SOG-specific. Same conversation as the in-person
      section above.
- [ ] **/roblox landing page copy** is still pending SOG + Roblox signoff (why the whole
      surface is noindex).

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

- [ ] **Should external references become links too?** Internal cross-references are
      now real links: every mention of one of *our* legal documents inside another one's
      copy is tagged in the message files and rendered as a link (see the allow-list in
      `src/components/legal/policy-content.ts`). References to documents we don't own —
      Roblox's own privacy policy and terms, Lynx's standard Terms and Conditions, CNIL,
      tietosuoja.fi — were deliberately left as plain text, on the same reasoning that
      keeps `a` out of the authored-markdown allow-list. Whether a legal page is the one
      place that ban should be lifted is the open question.
- [ ] **Draft banners come off** each page as its copy is confirmed final (the banner is
      the "copy pending / in draft" warning added while content is incomplete).

## Resolved — ready to apply

Decided, with the exact change written out. Nothing here has been applied yet; it all
lands in one pass. Delete an entry once its change is in.

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
