# Session Feedback (gamers, parents, Gedus)

**Status: investigation, not committed.** Researched 7 September 2026; a second pass on
8 September 2026 measured what prod actually does, which turned *placement* into a real
question the first pass had assumed away. Nothing is built — there is no session-feedback
table, route, or UI; the only feedback in the product is the free-text help card and its
rate-limited submit path. The claims about our own code were checked against the repo on
those dates. **The traffic and database figures below cover 30- and 90-day windows ending
8 September 2026 — the very start of the autumn term.** The two windows return almost the
same counts, so there is nearly no history behind them: re-pull after a full term rather
than trusting them. The claims about **email client capability** are external, age faster,
and are flagged where they need re-verifying before anyone builds on them. If this is
committed to, it becomes a `docs/plans/` plan and this file is deleted.

**The question:** if we ask for feedback at the end of a session, what should we ask each
of the three audiences, what should we deliberately not ask, and in what format should
each answer be collected?

---

## The framing that decides everything below

**One session produces three readings, and the discrepancies between them are the
payload.** A gamer answers about the session, a parent answers about the child and the
report, a Gedu answers about the session and the platform. None of the three averages is
worth much alone; the pairs are:

- Gedu says the session went to plan, gamer says it was not fun → the plan is wrong.
- Gamer had fun, parent does not know what happened → the session is fine, the report is not.
- Gamer reports nobody was friendly, Gedu reports everyone took part → look at that group.

**On roughly half of sessions only two of the three readings are obtainable**, because the
in-person half offers a child no moment to answer in — see the measurements below. That
does not weaken the framing; it says which discrepancies exist on which sessions, and it
has to be visible wherever the readings are eventually shown, or a quieter in-person
cohort will read as a calmer one.

**Consequence for storage: a session's three answers must be joinable from day one.**
Retrofitting a join key across three separately-designed instruments is the expensive
version of this feature. Whatever is built first should be keyed so the other two fit.

Two things found on 8 September that constrain how that key can work:

- **The session row is lazily materialized.** A row exists only once a report, a note or
  an attendance mark needs somewhere to live — its own table comment says so. In practice
  almost every past session has one (122 of 123 last month), but an answer must not be the
  *first* writer to want a session row, or collection has to materialize one itself. A
  child answering at the end of a session can easily arrive before the register does.
- **An answer and an inference must not share a table.** Some of what is proposed below
  is asked, and some is derived from behaviour we already record. Storing both as rows of
  one instrument guarantees somebody eventually averages them. Keep derived signals as a
  read over their source and join at the reporting layer.

**Consequence for item keys: one question asked two ways is two items.** The same wording
put to a child directly and put to them through a parent are different instruments with
different biases, and a shared key silently blends them. Whatever the storage shape, the
item identifier has to carry *who was asked and how*, not just what was asked.

**Consequence for item design: each audience gets one short set that never changes.**
Comparability week over week is the whole value; a rotating question set produces three
readings that cannot be compared to last week's three readings.

---

## What prod actually does — measured 8 September 2026

The first pass reasoned about instruments without asking where anyone actually is. These
numbers reorder the conclusions, so they come before them. Traffic is from Web Analytics
(see `../runbooks/vercel-analytics.md`); session and attendance counts are from prod
Postgres (`../runbooks/remote-supabase-psql.md`).

### Where people are — 30 days, production

| Route | Pageviews | Unique visitor ids |
|---|---:|---:|
| `/parent` | 4,623 | 2,077 |
| `/parent/unlock` | 4,198 | 2,735 |
| `/gamer` | 3,322 | 1,533 |
| `/gedu` | 2,170 | 634 |
| `/gedu/clubs/[id]` | 1,572 | 496 |
| `/parent/clubs/[id]` | 939 | 573 |
| `/gamer/clubs/[id]` | 910 | 521 |
| `/voice/group/[id]` | 853 | 533 |

Visitor ids are per-device and reset, so treat them as ordering rather than as headcount.

- **The family session feed is not the backwater it looks like.** The two family product
  pages together out-draw the voice room, and the gamer one alone matches it. It is still
  not where a gamer mostly is: they hit their own dashboard about 3.6× as often.
- **The parent PIN gate is nearly 1:1 with the parent dashboard.** Every parent-facing
  in-app surface is behind it. That is a harder argument for *the mail carries the click*
  than the email-capability section below makes, and it is about our own product rather
  than about mail clients.
- **The gedu workspace has the highest repeat engagement of any authenticated page** —
  roughly three views per visitor, against about 1.7 for the family pages.
- **Email → app clickthrough cannot be measured from here.** The session report's button
  does target the family product page, but essentially every hit on that route reports a
  blank referrer, which covers both in-app navigation and the many mail clients that strip
  referrers. Settling it needs a marker on that one link, read back off the request path.

### What sessions look like — 30 days, production

123 sessions ended in the window: **59 online** (`is_remote`) and **64 in-person**. A
report was written for **122** of them, and mailed to parents for **96 (78%)**.

Attendance over 90 days — which returns nearly the same counts as 30 days, because the
term had only just begun:

| | Present | Absent | Absence rate |
|---|---:|---:|---:|
| In-person | 568 | 177 | 23.8% |
| Online | 432 | 88 | 16.9% |

- **Gamer-sessions, not sessions, are the denominator for a per-child instrument** — and
  by that measure the in-person half is the larger one, at roughly 58%.
- **A report is written for practically every session; a report *mail* goes for 78% of
  them.** Anything riding the mail inherits that gap, and what the remaining sessions have
  in common is not yet known.
- **Attendance varies, and varies more in person.** It is a live per-child signal rather
  than a formality, which matters for the in-person section below.

### The constraint nobody had written down

**In prod today no child can reach their own account unaided.** The gamer profile table in
prod carries only the user, date of birth and gender; the sign-in mode column exists in
`schema.sql` but has not been released. Every gamer in prod is therefore in the switch-only
shape — a synthetic internal handle, no password, reachable only by an account switch from
the parent's session. The released sign-in modes are the precondition for any in-person
gamer instrument, and for reading any gamer answer as the child's own rather than the
household's.

---

## Gamers (7–17)

### Ask — four items, every session, never changed

1. I had fun today.
2. My Gedu listened to me today.
3. Someone in my group was friendly to me today.
4. I want to come back next week.

Optional fifth, rotating with whichever Yty-Element the session leaned on: *I felt okay
being myself today* (Harmony), *I helped someone today* (Glow), *the group used one of my
ideas today* (Valor), *I tried something today I had not tried before* (Wit).

### Why these

- **They cover what only a child can answer.** Safety mechanisms, value for money and
  scheduling are parent questions; session quality is a Gedu question. Fun, being heard,
  being treated well and wanting to return are the four things nobody else can report.
- **#3 asks about observable behaviour, not an internal state.** "I felt included" asks a
  young child to name a feeling; "someone was friendly to me" asks them to recall an
  event. The second is answerable across the whole 7–17 band, which is what keeps one
  instrument usable for every gamer.
- **#2 is the most coachable item in the set.** It is about one adult's behaviour in one
  session, so a low week is a conversation with evidence rather than a verdict on a person.
- **#4 is the best churn predictor available from a child** — an intention, not a
  satisfaction rating. It needs a per-product-type variant, because camps and events have
  no next week, and the final session of a club term does not either.

### Do not ask

- **"I felt safe today."** A five-point safety score is a bad safeguarding instrument in
  both directions: a child in trouble does not tick 2, and a high average manufactures
  false comfort. Keep the friendliness item and **route a low or falling score to a human**
  rather than into an average. This is the same standard `src/CLAUDE.md` sets for
  safety copy — a mechanism, not a reassurance.
- **Reverse-worded items** ("I was bored today") mixed among positives. With children they
  cost more in measurement noise than they buy in acquiescence control.
- **Rating the Gedu out of ten.** Asking a child to grade an adult they will see next week
  returns nines and tens.
- **Double-barrelled items** ("fun and educational"), and abstractions ("did the session
  meet your expectations").
- **Platform or tech satisfaction.** That is a Gedu question, and partly a telemetry
  question.

### Format

- **Five points, fully labelled in words**, never bare numbers: *No · Not really · A bit ·
  Yes · Yes, a lot*. Children anchor on labels, not on a numeric range.
- **One scale for every age.** The youngest will skew high; that is acceptable because
  **the level is nearly meaningless and the within-child change over weeks is the signal.**
  A single scale keeps that change comparable, which a per-age-band scale would destroy.
- **A skip is recorded as a skip, never as a middle value.** Rising non-response is the
  earliest warning that the instrument has gone stale.
- **Four taps, one screen, under fifteen seconds, no required fields.** Past that, gamers
  straight-line and the data is worse than none.
- **The moment is leaving the voice room — not inside it**, where a Gedu is on a shared
  screen and the group is still present. The first pass said "on their own dashboard
  afterwards"; the dashboards argue against that. Both family dashboards are dense pages
  whose cards have an explicit three-part grammar and a corner badge reserved for *this
  needs attention*, and a survey fits none of those slots. **Leaving the room is already a
  full-page navigation to a validated internal path** — the voice session components take a
  back target, default it to the role dashboard, and resolve it through
  `resolveInternalPath()` — so a question can be interposed on that hand-off and then
  forward to the destination the child was going to anyway. That costs no dashboard real
  estate, inherits the redirect rule rather than restating it, and puts the question at the
  moment of maximum recall. The same hand-off carries Gedus, so it must be role-aware.
- **It only reaches online sessions**, which is the smaller half — see the in-person
  section below.
- Note that a gamer signing in through the parent's session may be answering with a parent
  beside them, which degrades items 2 and 3. Under the switch-only shape prod is currently
  in, that is not an edge case but the only way in.
- **Cadence:** every club session; once per camp *day*, not per activity block; once per
  event.
- **Yty-Points for completing, never varying with the answers.** Rewarding the act is
  fine; rewarding an answer buys fives.
- **Labels are icons plus translated words** — the no-emoji rule for `messages/` applies, so
  faces are `lucide-react` icons or nothing. Avoid idiom in the item text: five locales.

### The in-person half, which has no moment at all

The larger half of gamer-sessions happens in a room, and three blockers stack there. None
of them is a UI problem:

1. **No signed-in device.** Prod is switch-only; see the constraint above.
2. **No moment.** The child walks out of a hall. There is no navigation, no hand-off, no
   page to interpose anything on.
3. **The room is the place this document already refuses to collect in.** A code on the
   projector answered by nine children with the Gedu present is exactly the shape the
   gamer format section rules out — so an in-person instrument would be worse data even
   once built.

**Which suggests not asking.** Attendance is already recorded per child per session, it
covers every in-person session, it needs no login, no new UI and no new consent
conversation, and the figures above show it genuinely varies. This document calls *I want
to come back next week* the best churn predictor obtainable from a child; where the
question cannot be put, the behaviour it predicts can be observed instead, and observed
behaviour is the better measurement of the two.

What it cannot do is say **why** — it will not separate boredom from a cold from a house
move. That is what the Gedu leg covers for those same sessions, and it is the argument for
treating the three instruments as one set with a known hole rather than as three surveys.

**The alternative, if the child's voice on this half is wanted sooner**, is a
child-addressed row in the parent's mail — *ask {name} whether they had fun*. It is proxy
data through an adult, which the parent section refuses on its own terms, and it should
only be considered against a distinct item key so it can never blend with answers children
gave themselves. It is a different instrument wearing the same words.

---

## Parents

### The constraint

**The parent was not there.** Any item asking them to rate the session is really measuring
their child's account of it, laundered through an adult. Parents are the sole authority on
exactly two things: what their child was like afterwards, and whether our report told them
something they did not already know.

### Ask — one item in every report email

> **I know what {name} did in this session.**

If a second row is affordable — two is the hard ceiling — it is **{name} seemed happy
after this session.**

### Why these

- **The first grades the artifact it is attached to.** The report *is* the mail, so the
  question is "did this work?", answerable in two seconds from what is directly above it.
  A report scoring low is one that named the activity but not the child, which is a fixable
  Gedu conversation.
- **The second is the churn signal.** A child who comes off the third session flat is a
  cancellation weeks before it reaches Stripe.
- **One item, not five.** The mail's job is to deliver the report; a questionnaire the
  reader must scroll past to reach their child's photos degrades the thing we are actually
  selling.

### The periodic set — three times a term, never in the weekly report

1. {name} looks forward to their session each week.
2. {name} talks to me about what happens in their sessions.
3. I can see {name} getting better at something through these sessions.
4. {name} has made friends through these sessions.
5. I trust the way {name} is looked after in sessions.
6. The reports tell me what I want to know.
7. This is worth what we pay for it. — termly only, timed before the renewal decision.

**#5 is a safety item asked of a parent, which the gamer set deliberately refuses.** The
asymmetry is the point: a child ticking four on "I felt safe" is not a safeguarding
instrument, but a parent's confidence in an institution is precisely the number that moves
before a family leaves.

### Do not ask

- **Anything about how the session was run.** They were not there.
- **The Gedu's performance by name.** A parent grading an adult they have never met, from
  one report, is unfair and noisy. Ask about the report, not the person.
- **NPS in a session report.** "How likely are you to recommend" is a relationship question
  worth asking once or twice a year; asked weekly beside a report about Thursday it stops
  meaning anything, and the metric is spent.
- **Price weekly.**
- **Free text in the mail body.** Forms do not submit from email, so a box that looks
  typeable and is not is worse than no box.

### Format

- **Standard five-point agreement with the full adult anchors** — deliberately different
  from the child scale, which reads as talking down to an adult.
- **Anchors translated once, centrally.** Per-item anchor variants are how a survey becomes
  untranslatable across five locales.
- **The mail carries the click; the web carries the survey.** See the email section below.
- **The strongest argument for that is our own PIN gate, not mail clients.** The parent
  dashboard sits behind an unlock that is hit nearly once per dashboard view, so any
  parent instrument placed in-app is answered only by a parent willing to pay that toll
  first. A tokenised link from the mail is the one parent path that does not.
- **Coverage is 78% of sessions, not all of them** — that is how many get a report mail,
  against a report being *written* for practically all of them. An instrument riding the
  mail inherits that ceiling. What the unmailed sessions have in common has not been
  checked, and it matters: if they skew in-person they are sessions with no gamer
  instrument either, and nobody would be heard from at all.

---

## Gedus

### The constraint that reframes this one

**There are tens of Gedus, not thousands of parents.** At that n a Likert mean is noise —
one rough week moves it half a point. So **the scales are not the metric; they route you to
the prose.** Every item landing at the bad end opens one optional text box, and those boxes
are the deliverable. Gedus are adults, literate about the product, and gamers: they will
write, if it is cheap and they believe it is read.

### Ask — the session leg (three items)

1. This session went the way I planned it.
2. Every gamer in the group took part today.
3. I had what I needed to run this session.

**#2 is the counterpart to the gamer's friendliness item** and exists for the discrepancy:
a group where the Gedu says everyone took part and a child says nobody was friendly is
visible through no other instrument we have.

### Ask — the platform leg

**Do not ask a Gedu to rate what the logs already know.** A room that failed to create, a
403 on a token, a failed photo upload — those are observable. "The platform worked well
today" is unactionable and costs a Gedu's evening. What telemetry structurally cannot see
is confidence, time-cost and avoidance, and those are exactly Likert-shaped:

1. **I was confident using the voice room's tools today.** — zones, mute, moving people,
   screen share. This is the item that finds hidden problems: a Gedu who avoids private
   zones because they are unsure what happens to the child they place there appears in
   metrics as *low usage*, which reads as "feature not needed". Only this question tells
   the two apart.
2. **I trust that what I recorded was saved.** — a low score is a perception-integrity
   problem worth treating as seriously as real data loss, because a Gedu who distrusts the
   register keeps a second copy and now there are two records.
3. **When something went wrong, I knew what to do.**
4. **Writing up this session took about as long as it should.** — calibrated against their
   own expectation, and time is what a contractor actually spends.
5. **The platform stayed out of my way while I was teaching.** — the best summary item for
   a tool whose success is invisibility.
6. **There was something I wanted to do today that the platform would not let me.**

**#6 is reverse-worded on purpose**, which the gamer set forbids. With adults it is safe,
and here it is the highest-value item in the survey: a high score is a feature request with
a session attached. It carries the conditional text box above all others.

### Ask — the incident checklist, which is not a Likert

A multi-select: *audio dropped for someone · a gamer could not join · I could not hear a
gamer · someone's volume was wrong and I could not fix it · photos would not upload · the
register or report would not save · the voice room would not open · a gamer's game account
was wrong · something else.*

**Scales are the wrong instrument for incidents, because you need which, not how much.**
Each box maps to a log query with a session id attached. The volume entry is deliberate:
the playback constraint documented under the voice components is a standing platform limit
rather than a bug, and this is the only way to learn how often it actually bites a session.

### Ask — the staff set, termly and separate

1. I know what is expected of me.
2. I get the support I need from School of Gaming.
3. I am confident about what to do if a child tells me something worrying.
4. The reports I write are read.
5. I would recommend being a Gedu to a friend who games. — once or twice a year.

**#3 is a safety item asked of staff, and it works where the child version does not**: it
measures preparedness, which is trainable, rather than asking someone to disclose on a
scale. **#4 is a motivation item with a downstream cost** — a Gedu who believes nobody
reads their write-ups writes worse ones, which shows up in the parent's "I know what my
child did" score.

### Do not ask

- **Anything the logs answer.** See above.
- **The staff set per session.** The per-session form must not drift into an HR survey.
- **Anything identified, in the staff set.** See the conflict of interest below.

### Format

- **It lives in the workspace, not in a mail** — at the end of the session they have just
  completed, which is the moment of maximum recall and minimum remaining obligation. The
  traffic supports it: the workspace has the highest repeat engagement of any authenticated
  page. The write-up a Gedu already owes is the obvious host, since it is the one thing
  they open for **every** session — which also makes this the only one of the three legs
  that reaches the in-person half at all.
- **It must sit outside the completeness ladder.** A session owes three things (four on a
  final session), with a dashboard badge and a SQL derivation that has to agree with the
  client's. Feedback must not become a fifth: an opinion with an owed badge attached is
  unpaid work, and it returns fours for ever.
- **Split identification deliberately, and say so on the form.** Per-session tech items are
  **identified** — the session and the client are needed to chase a bug, and Gedus accept
  that reason. The termly staff set is **aggregate only, with a minimum group size before
  anything renders.** A Gedu is contracted, admin-verified, and assigned groups by us; a
  new or unverified Gedu asked to rate the platform under their own name gives sunshine,
  and theirs is the feedback we most need. Someone who does not know who reads it assumes
  the worst.
- **Cadence is not uniform.** Per session: the incident checklist (fast, usually empty)
  plus one or two Likert items. The full platform set monthly. The staff set termly.
- **Close the loop visibly.** The strongest predictor of continued response is whether
  anything changes. A "you said / we did" line on the Gedu dashboard, naming the fix and —
  with permission — who raised it, is worth more than any item-design decision here. Gedus
  read it as patch notes.

---

## Collection format: what email can and cannot do

**External, ages fastest — re-verify before building.** Checked 7 September 2026.

The parent's item is the only one landing in a mail, so this section is about that mail.
The conclusion: **the mail carries one click; the web carries the survey.**

### The three kinds of "interactive email", and how each fails

- **HTML forms in the message.** Gmail strips form and input elements; Outlook's Word
  engine has no concept of them; Apple Mail submits, often behind a security warning. A
  form that works for a minority, warns some of them, and silently does nothing for the
  rest, with no way to tell which happened.
- **The checkbox hack (`:checked` plus sibling selectors).** Genuinely works in Apple Mail
  and nowhere that matters to us — Gmail strips the inputs it depends on, and the Word
  engine supports none of the CSS. The fatal flaw is independent of support: **the state
  never leaves the client.** The widget lights up and transmits nothing; a link click is
  still required to send anything. It buys presentation, not data.
- **AMP for Email.** The only one designed for the job — real submission, live data. Gmail
  in practice; Microsoft never meaningfully shipped it; Apple Mail never will. Requires
  per-sender allowlisting with the provider, a third MIME part beside the HTML, strict
  validation, and CORS-configured endpoints, and the standard has been contracting rather
  than growing. **The structural objection stands regardless of its current status:** the
  plain HTML fallback has to be built anyway, because that is what non-Gmail parents see —
  so the survey is built twice and most families get the simple one. Build only that one.
  *(Its present status and Brevo's support for it are both unverified here.)*

### What works everywhere

**One link per answer** — five table cells, each an anchor with its own token URL.

- No CSS support required, so it survives the Word engine.
- No images, so it survives the blocked-image render the mail templates are already
  written for.
- No JavaScript, no MIME parts, no provider allowlisting.
- The parent's experience is **one tap**, which is the only interaction that affects
  response rate. Whether the tap happened inside the mail or bounced through a page is
  invisible to them.

Everything genuinely interactive then happens on the landing page. The shape that collects
more than one item: tap → answer recorded → page opens saying what they answered and
offering to change it, with the remaining items already on screen. **The first answer costs
one tap and no login, and the rest costs a parent who has already engaged** — which
converts far better than "click here to take our survey". The lever is not in-mail
interactivity; it is that **the first click is the first answer.**

### Constraints specific to our mail

- **Five cells is the maximum, and that is arithmetic rather than taste.** Clients do not
  reflow table columns, so a rating row is five fixed cells at 360px too — roughly 56px
  each once the card's padding is out, which clears a tap target only just. There is no
  breakpoint to rescue it without extending the shell's single media query. Label the two
  ends, leave the middles as short marks; this is the one place unlabelled middles are the
  lesser evil.
- **Link prefetchers will submit answers no human gave.** Corporate scanners and safe-link
  services follow every URL in a message; five links means five phantom answers. Two fixes,
  both needed: the click lands on a page that **shows and confirms** the answer, and the
  token is per-parent-per-session and idempotent so the last human answer wins.
- **Token links follow the existing origin rule** (`getOrigin`, never the request URL's
  origin) — these carry a credential, which is the case that rule exists for.
- **Placement: below the report and photos, above the My SOG button, and it must not read
  as a button row.** The mail has one action it is asking for; a second CTA-shaped element
  splits the click.
- **This is transactional, not marketing.** Service feedback riding a transactional mail
  must not be gated on a marketing consent, and must not become a reason to mail a parent
  who holds none.
- **Two children in one club means two mails.** Guard against counting one parent's answer
  twice, and against asking the same person the same question twice in five minutes.
- **Brevo's link tracking default is unverified.** The send wrapper sets no tracking
  options, so hrefs inherit the account default; if click-tracking is on, every URL is
  rewritten to a redirect domain. Functional, but it means the token link is not visibly
  ours and adds a hop for scanners. Decide it deliberately for these links.

---

## Where we lean, and what would change it

**The 8 September measurements changed the shape of this.** The first pass ranked the three
audiences by cost and picked the gamer set to build first. The right question turned out to
be *where is each audience already standing*, and each answers it differently — so the
ordering matters less than it looked, and coverage is the open problem instead.

**Where each leg wants to live, on the evidence above:**

- **Gedus — the session write-up they already owe.** It is the only surface opened for
  every session, and the one with the highest repeat engagement. It is also the cheapest
  build of the three, and the only leg that reaches in-person sessions.
- **Parents — a tokenised link in the report mail.** Our own PIN gate rules out the in-app
  alternative more decisively than any mail-client argument does. Ceiling: 78% of sessions.
- **Gamers — the voice-room leave, for online sessions only.** Roughly 42% of
  gamer-sessions, and the honest answer for the rest is probably not to ask at all.

**Nothing here is decided, and the one that is not settled is the gamer leg.** The other
two have obvious homes; the in-person half of the gamer population has no moment, no
signed-in device, and a room this document already refuses to collect in. Whether the
attendance derivation is an acceptable substitute for a question is the open call.

**What would still be true whatever is decided:** the storage rule at the top, and the fact
that partial coverage is the design rather than a defect to be engineered away later — a
set of three instruments with a stated hole beats one instrument stretched until it
measures nothing.

**What would change the answer:**

- **If the Gedu population grows past a few hundred**, their Likert scores become a metric
  rather than a router, and the conditional-text-box design is no longer the right shape.
- **If AMP for Email turns out to be alive and supported by Brevo**, the parent flow could
  collect the full periodic set in the inbox — but only alongside the link-based fallback,
  which is the objection above and does not go away.
- **If response rates on the gamer set fall below roughly half**, the instrument is being
  ignored rather than answered, and the fix is fewer items or a different moment, not more
  reminders.
- **If the gamer sign-in modes reach prod**, the in-person half stops being structurally
  unreachable and every gamer answer stops being potentially the household's rather than
  the child's. That is the single change that most alters the gamer leg, and it is already
  written — it just has not been released.
- **If the report mail's button gains a marker**, the unanswerable question of whether
  parents click through from the mail becomes answerable in a week, and the parent leg
  stops being designed against a guess.
- **The attendance derivation is worth starting whatever else is decided.** It costs
  nothing, needs no UI, and is the only signal here that gets more valuable the earlier it
  begins accumulating — and as of this writing there is barely a month of term behind it.
- **If any of this is committed to**, the storage decision at the top — three readings of
  one session, joinable — is the one that has to be right first.
