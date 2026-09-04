# Calendar invitations

An explorer of the iCalendar format, mailed as `invite.ics`. Two files: the RFC 5545
primitives (escaping, octet-counted folding, both timestamp forms, one `VTIMEZONE` per
zone the tool offers) and the builder that composes a message out of them.

**This module answers "what does a client do with this property", not "what do we want to
say".** It replaced a builder that took a seat's schedule and composed a family's
invitation from it, and the replacement is the point: the format's own behaviour has to
be known before any sentence written on top of it can be trusted to arrive. So the input
mirrors RFC 5545 and RFC 5546 — nothing here knows what a club is, and nothing here
composes a sentence.

**The builder is pure, and that is what keeps it honest.** It takes a plain description
of one calendar object and returns a string. No database, no request, no environment, no
clock of its own — `now` is an argument, because a `DTSTAMP` read off the wall clock is
the one input that would make every test true only on the day it was written.

## The support rule

**A property is a knob only if Google Calendar, Apple Calendar and Outlook all honour
it.** Those three are the whole audience, and a field one of them drops on the floor
teaches nothing but its own absence — worse, it makes every send ambiguous, because a
difference that fails to appear could be the client's doing or could be the property
never having been supported in the first place. A knob that cannot produce a clean answer
is not a knob.

Written here and removed for exactly that reason: `X-ALT-DESC`, `GEO`, `CATEGORIES`,
`PRIORITY`, `CLASS`, `X-MICROSOFT-CDO-BUSYSTATUS`, the RFC 7986 additions (`CONFERENCE`,
`COLOR`, `IMAGE`, `ATTACH`), and the explicit `RDATE` list, which Outlook handles poorly.
Adding one back is a decision about the audience, not a tidy-up.

**The alarms are the one deliberate exception, and they prove the rule rather than
breaking it.** The three clients are *known* to disagree about them — Apple keeps what
the organiser sent, Google replaces them with the reader's own defaults for that
calendar, an Exchange mailbox keeps exactly one and keeps the first — and that
disagreement is itself the finding. So all three alarms stay, each with its offset, its
action and whether it counts back from the start or the end. Order is therefore a real
property of the list, not tidiness: whichever reminder matters most goes first, because
on a Microsoft reader it is the only one anybody gets.

## One UID, one or more components

**Every `VEVENT` in the document is under the same identifier.** An iTIP message
describes a single calendar object, and a client handed several *objects* reads the first
and ignores the rest — so the identifier never varies, and it is used verbatim, which is
what lets a later message land on the entry an earlier one created. It follows that the
identifier carries no per-date suffix and that a cancellation withdraws the whole run.

**What may vary is how many components state that one object**: the master event, plus
one per overridden occurrence.

## Overrides: a mixed-time product, and a single moved session

**These are the same mechanism, and this is the knob that expresses both.** A rule states
one clock face, so a club that meets Monday at 16:00 and Wednesday at 14:00 cannot be one
`RRULE` — and neither can a term whose one week shifted an hour. The schema allows both,
so an invitation has to cope with both. RFC 5545's answer is an extra `VEVENT` under the
same `UID`, carrying a `RECURRENCE-ID` that names the occurrence it replaces, and that is
what an override line produces.

**The `RECURRENCE-ID` names the occurrence *as the rule produced it*** — that day at the
rule's own start time, in the document's own time form. Writing the *new* time there is
the classic way to get an override that silently creates a second entry beside the one it
was meant to replace, and by the time anybody notices there are two.

**An override differs from the master in when it happens and in nothing else.** Summary,
description, location, URL, organizer, attendee, status, transparency and the alarms are
all copied, so a client comparing the two components finds one difference. A property
that drifted between them would show up as an occurrence that mysteriously lost its RSVP.

**A line has to name an occurrence the rule actually produces**, or the `RECURRENCE-ID`
matches nothing: a date off the rule's weekdays, a date before the run starts, or a date
already on the excluded list is refused with the line quoted back. `INTERVAL` is
deliberately *not* checked — an override on an off week of a fortnightly rule is a
document worth being able to send, precisely because what a client does with one is
unobvious.

## Times, zones and the three forms

**A weekly slot promises a clock face, so the default is a wall clock under a `TZID`** —
and a zoned document owes the reader the transition rules for the zone it names, or the
note saying why it has none. Which form is used is a knob rather than a consequence,
because what a client shows a reader in *another* zone is one of the things worth
watching.

Three forms, and each one decides whether a zone is described at all:

- **Wall clock with `TZID`** — the zone block travels with the document.
- **Absolute instant (`…Z`)** — names no zone, so no block is written; there is nothing
  to resolve and no gap to warn anybody about.
- **All-day (DATE-valued)** — no clock face and no zone either, `DTEND` on the day after
  the last, and an override can only restate the day, because there is no time to move.

**UTC is the exception at both ends, and it is one decision rather than two.** A schedule
authored in UTC has no clock face to promise — there are no transitions for one to
survive — so its times are written as absolute instants whatever the form field says.
Naming the zone anyway beside an absolute timestamp would be redundant on a forgiving
reader and contradictory on a strict one.

**The zone table is hand-written, one block per zone the tool offers, and what it covers
is worth knowing.** Four of the five European-rule zones are the *same* rule seen from
different offsets: the switch happens at 01:00 UTC on the last Sunday of March and the
last Sunday of October, which is 01:00 local in London, 02:00 in Paris and Stockholm and
03:00 in Helsinki — and one hour later in each in the autumn, because the autumn clock is
read in the summer offset. `America/New_York` is the fifth and is a genuinely different
rule (second Sunday of March, first Sunday of November, both at 02:00 local), which is
the point of having it: a document that only ever described the EU rule could not show a
client getting a US transition wrong. Anything outside the table still gets its `TZID`
plus a note saying no rules travel with it.

**The day walk that counts occurrences is UTC-pinned end to end**, which is the only
shape that survives a daylight-saving transition inside a run: stepping a zoned wall
clock by 24 hours repeats or skips a calendar date once a year, and UTC has no
transitions for the arithmetic to fall into.

## Presence, absence, and the baseline

**Every field either emits its property or omits it, and nothing else.** A blank value is
an absence rather than an empty property, because "what does this client do when the
property is missing" is half of what is being explored. No field is derived from another
and no default is invented in the builder.

**That is what makes the baseline usable.** An untouched form composes an ordinary,
unremarkable invitation, and every send after the first changes exactly one thing — so a
client that renders the baseline and mangles the next send has told you which property it
mangled. The inference only holds if nothing is ever written that nobody asked for, which
is why the test suite asserts absence as hard as it asserts presence.

**Every name is written as a quoted string, whether or not the format forces it.** The
rule is that quoting is required only around a value carrying a colon, semicolon or
comma, and following it exactly is how an organiser name arrived on one client with a
word missing. Quoting always costs two characters and leaves no client guessing where a
value ends. A quoted string has no escape for a quote of its own, so a quote inside a
name is dropped rather than smuggled through.

**A document with no occurrence in it is refused rather than serialised.** An empty
calendar says nothing to a client, and sending one would still open a conversation the
recipient's calendar has no entry for — and the caller is the one that knows what to say
about it.

## The template is the only caller, and it must carry a plain-text body

A calendar invitation is an email template like any other — it lives in the email
template registry, composes its parameters from a form, and is sent and previewed from
the admin email testing tool at `/admin/testing`. What is not like any other is the text
body: an Exchange mailbox fills the calendar entry's own notes from the message body, and
with only HTML to work from it flattens the markup into them. So the mail that carries
this document states its own words as text, and that text is what a Microsoft reader
finds inside the entry.

The mail itself is incidental — a typed subject and a typed body in the house shell,
nothing composed from the calendar's values. The shell rather than a bare paragraph
because every mail this codebase can send is swept for house style, and a document that
opted out would be the one render none of that reaches.

## What is verified, and what is not

Gmail renders this document, attached as `invite.ics` through the transactional REST API,
as a full inline invitation with RSVP buttons; Outlook on Windows renders it as a meeting
request with the recurrence stated in prose; an iPhone reading an Exchange mailbox shows
it in Calendar and honours the free/busy answer. All tested 2026-09-04, against the
builder as it stood before the explorer replaced it — the primitives are unchanged, so
those findings still hold for the properties they covered.

What is still open is iCloud, a Gmail account read through Apple Mail, the per-client
answer for every knob the explorer now exposes, and the assumption the whole design rests
on: that re-stating the same identifier with a higher revision number replaces the entry
a client already holds rather than adding a second one. Those questions are answered by
sending from the explorer and looking, not by a document: the template is the living
record of this feature, by the owner's decision, and there is no investigation file.
