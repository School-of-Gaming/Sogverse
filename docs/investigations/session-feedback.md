# Session Feedback (gamers, parents, Gedus)

**Status: investigation, not committed.** Researched 7 September 2026. Nothing is built —
there is no session-feedback table, route, or UI; the only feedback in the product is the
free-text help card and its rate-limited submit path. The claims about our own code were
checked against the repo on that date. The claims about **email client capability** are
external, age faster, and are flagged where they need re-verifying before anyone builds on
them. If this is committed to, it becomes a `docs/plans/` plan and this file is deleted.

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

**Consequence for storage: a session's three answers must be joinable from day one.**
Retrofitting a join key across three separately-designed instruments is the expensive
version of this feature. Whatever is built first should be keyed so the other two fit.

**Consequence for item design: each audience gets one short set that never changes.**
Comparability week over week is the whole value; a rotating question set produces three
readings that cannot be compared to last week's three readings.

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
- **It appears on their own dashboard after leaving the voice room** — not inside the room,
  where a Gedu is on a shared screen and the group is still present. Note that a gamer
  signing in through the parent's session may be answering with a parent beside them, which
  degrades items 2 and 3.
- **Cadence:** every club session; once per camp *day*, not per activity block; once per
  event.
- **Yty-Points for completing, never varying with the answers.** Rewarding the act is
  fine; rewarding an answer buys fives.
- **Labels are icons plus translated words** — the no-emoji rule for `messages/` applies, so
  faces are `lucide-react` icons or nothing. Avoid idiom in the item text: five locales.

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
  completed, which is the moment of maximum recall and minimum remaining obligation.
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

**Lean:** build the gamer set first. It is the cheapest (in-app, no email mechanics, no
token infrastructure), it is the audience with the most sessions, and it produces the
signal — within-child change over weeks — that neither of the others can. The parent item
is second and carries all the email work. The Gedu set is third by volume but first by
information density per response, and could reasonably be built as a plain form long before
anything is instrumented.

**What would change the answer:**

- **If the Gedu population grows past a few hundred**, their Likert scores become a metric
  rather than a router, and the conditional-text-box design is no longer the right shape.
- **If AMP for Email turns out to be alive and supported by Brevo**, the parent flow could
  collect the full periodic set in the inbox — but only alongside the link-based fallback,
  which is the objection above and does not go away.
- **If response rates on the gamer set fall below roughly half**, the instrument is being
  ignored rather than answered, and the fix is fewer items or a different moment, not more
  reminders.
- **If any of this is committed to**, the storage decision at the top — three readings of
  one session, joinable — is the one that has to be right first.
