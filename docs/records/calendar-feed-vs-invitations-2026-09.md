# Calendar: the subscribed feed, and why it lost to the mailed invitation

**Status: closed, 2026-09-04.** A frozen record of research that ran its course. The
subscribed-feed design was built as an admin tool, measured against real calendar
clients, and dropped; the mailed invitation replaced it. The live half of the story —
what the invitation still has to answer — is an open investigation under
`docs/investigations/`, and this file does not track it.

## The question

Families should learn about upcoming sessions without us running per-session scheduled
jobs. Two mechanisms were candidates: put the sessions into the calendar the family
already uses, or mail them a reminder. The calendar route was preferred because it needs
no timer at all — the family's own calendar app does the reminding, with the family's own
notification settings — so it was the one that got built and measured.

Inside the calendar route there were two shapes, and they are genuinely different
designs rather than variants:

- **A subscribed feed.** One URL per family, polled forever by the vendor's servers. We
  publish a document; nothing is stored, nothing is remembered, and a schedule change
  reaches the family whenever their vendor next polls.
- **A mailed invitation.** One calendar object per seat, sent as a message, revised by a
  second message and withdrawn by a third. It arrives immediately and can be answered —
  and it obliges us to remember every identifier and revision number we have ever stated.

## What was verified about the feed

A full feed was built and subscribed to from real clients. What it established:

- **The vendors decide when a change lands, and one of them decides slowly.** Google
  polls a subscribed calendar on its own schedule — hours, sometimes approaching a day —
  and there is no way to force a refresh. That is acceptable for a weekly schedule of
  record and useless as a channel for a change made this morning.
- **A published alarm is a suggestion, not an instruction.** Apple Calendar honours an
  alarm the feed carries, and lets the subscriber strip alarms per-calendar with an
  all-or-nothing toggle — which is why exactly one conservative alarm is the right thing
  to emit rather than a day-before and hour-before pair. Google and Outlook discard the
  alarm entirely and apply the subscriber's own defaults for that calendar.
- **Handing a feed to a client takes three different vendor gestures, and none of them
  accepts a plain `https://` address.** Apple wants the address under the `webcal://`
  scheme, which is not a transport — the client fetches the same HTTPS address behind it
  — but is what marks the address as a subscription rather than a file to download once.
  Google's add-by-URL screen rejects an `https://` value outright and requires the
  `webcal://` form. Outlook.com takes an add-from-web screen carrying the address and a
  name. All three nest the feed address inside their own URL, so it has to be
  percent-encoded or the feed's first `&` is read as the host's next parameter; and all
  three are fetched by the vendor's servers, so a machine-local address produces a link
  that opens and then fails on their side.
- **The URL is a credential, and the right credential was never built.** A feed address
  exposes a child's weekly whereabouts and is polled unauthenticated forever, so expiry
  is the wrong tool and revocation is the right one — a random per-customer secret
  stored in the database, reissuable. What the tool actually shipped was a signed HMAC
  standing in for that, adequate for an invented sandbox household and not for a real
  family. Closing that gap was a prerequisite nobody had paid for.
- **The occurrence expansion is a live trap for any outbound artifact.** Three
  expansions exist and they disagree about holidays: the shared walker the dashboards and
  session feeds use is holiday-blind, deliberately, while the public product calendar and
  the SQL session predicate are holiday-aware. A dashboard row that ignores a holiday is
  tolerable; a calendar entry or a reminder mail for a session that is not happening is
  flatly wrong. Unifying the three is the first brick of *any* feature in this area, and
  it is still unbuilt — the tool inherited the holiday-blind walker.
- **Nothing in the schema records that a session moved**, so neither shape can say
  "tonight's session is cancelled". Both are schedule-of-record features until a change
  model exists.

## What was verified about invitations

- **A bare `.ics` attachment is not an invitation.** Gmail renders one as an "Add to
  calendar" link, and the entry it creates is a *copy* — nothing sent afterwards can find
  it again, so next week's update lands on nothing. This is the failure the whole design
  has to avoid.
- **The same file sent through the transactional REST API as an `invite.ics` attachment
  renders as a full inline invitation with RSVP buttons.** Tested on Gmail, 2026-09-04,
  for both schedule notations — a weekly rule, and an explicit list of dates. This is the
  finding that settled the whole comparison, because it removed the reason the invitation
  design had needed a separate mail transport.
- **A reminder inside an invitation lands the same way it does in a feed** — honoured by
  Apple, replaced by the recipient's own defaults on Google and Outlook.
- **One seat is one calendar object** (owner's decision). RFC 5546 gives a message one
  calendar object to describe, and a client handed several reads the first and ignores
  the rest — so a two-slot club split across two events arrives as one of its sessions.
  The whole product schedule therefore rides in a single event under a single identifier,
  accepted in one gesture and withdrawn in one.

## The decision

**Owner's decision, 2026-09-04: the subscribed feed is dropped, and a calendar
invitation is an email template.**

What the invitation buys is everything the feed's cost centres were: no URL that is a
credential, no revocation story, no vendor poll schedule to wait on, no fake household in
the database to make the thing testable, and no second mail transport — it goes through
the one REST wrapper every other mail in the app already goes through. What it costs is
bookkeeping: an identifier and a revision number per seat, and a change model to say when
an update is due. Those are the open items, and they belong to the invitation's own
investigation rather than to this record.

Production schedule shapes were checked the same day and they make the simple notation
sufficient: every product runs at one clock time across all its days — the summer camps
are consecutive weekdays at one time, the term camps and every club are a single weekly
slot — so a weekly rule covers every real product and the explicit date list is a
comparison option rather than a requirement.

**Reminder mail was never ruled out and was never built.** It is the other candidate
mechanism, and it stayed deferred for reasons that have not changed: an email that
arrives before an event needs something to wake up, so it needs a scheduler this
codebase does not have, and recurring mail cannot ship at all until an unsubscribe and
notification-preference mechanism exists. Whether it is wanted once families have
calendar entries is a question for after, not before.

## What was thrown away, and what to read first if it comes back

The feed's route, token, sandbox table, option parsing, subscribe links and its half of
the admin tool were deleted rather than left standing; git history holds them. Anyone
reviving the idea should read the two prerequisites above first — the holiday-aware
expansion and the revocable per-customer credential — because neither was solved and both
gate a real feed regardless of what the document looks like.
