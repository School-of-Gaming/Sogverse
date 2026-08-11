# ROBLOX-TODO

Everything still open for the Roblox / Lynx Educate programme launch: placeholder copy
waiting on real content, published claims that need correcting, and features the legal
documents promise that the app does not have yet. Same semantics as `TODO.md`: this file
tracks open work only — when an item is fully done, delete it; when the file is empty,
delete the file. The record of what was done lives in git history.

The programme surface (`/roblox` and its child pages) is unpublished — noindex, absent
from the sitemap, no nav links — until copy is signed off by SOG and Roblox. The flip to
published happens for all of it together: nav + sitemap + noindex in one change (see the
comment on `roblox` in `src/lib/constants/routes.ts`).

## Placeholder copy waiting on real content

Each gap below renders a visible "still being written" marker on the page rather than
invented copy or a silently short section, and every programme legal page carries a draft
banner until its copy is signed off.

- [ ] **Child Safeguarding Policy — vetting & training list.** The "Before someone works
      with children" section ends with "This includes:" and the list is missing (was
      `xxx` in the draft). Needs the real, publicly-committable vetting/training steps.
- [ ] **Child Safeguarding Policy — "During in-person events" section.** Entirely
      missing (was `xyz` in the draft).
- [ ] **SOG contact address, needed in two documents.** The Safeguarding Policy says
      `xxx@sog.gg` ("If you have a concern") and the Terms & Conditions says `xx@sog.gg`
      (same section). Decide: `hello@sog.gg` (matches the privacy policy) or a dedicated
      safeguarding address, and use it consistently in both.
- [ ] **Terms & Conditions — "[contact]" placeholder.** "The short version" ends with
      "If anything's unclear, email [contact]." Which address — Lynx's
      `support@lynxeducate.com`, the SOG address above, or both?
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
