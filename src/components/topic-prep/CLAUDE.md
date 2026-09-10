# Topic prep — the "Before the first session" guide

A product's topic can carry a short guide telling a family what to do before the first
session: create the account, install the software, test it — and, on a remote product,
get the mic and camera ready for the voice room. This directory holds the
component that renders its body, the dialog an enrolment card opens it in, and the cookie
that remembers a family has finished with it — its format, the server-side read, and the
hook that writes it. The steps themselves are declared in the
product topic registry under `src/lib/products/`, and every word a reader sees lives in the top-level
`topicPrep` message namespace.

## About and Prep are two documents with two jobs

The same topic also carries an "About" block, which drives the card on the shop product
page. Keeping the two apart is the whole reason there are two blocks rather than one long
one, and it decides which sentence goes where.

- **About answers "should I buy this".** What the thing is, what it costs, what device it
  needs, what a parent should know about its content and safety. It is read **before** a
  purchase, by someone still deciding. **Requirements are stated as facts, never as
  instructions** — "playing needs a free Epic Games account", not "create an Epic Games
  account".
- **Prep answers "what do I do now".** The steps that make a family ready. It is read
  **after** a purchase, by someone who has already decided. It repeats a requirement only
  as the step that satisfies it.

A how-to sentence in an About note, and a price or an age rating in a prep step, are the
two drifts these definitions exist to catch. When a fact belongs in both, it is written
twice, in the two voices — not moved.

## One voice, for two readers at once

**Rule: a prep guide is written in the second person and the imperative, in one text that
must read well to a parent and to a teenage gamer alike.** The same words render on the
parent's My SOG and on the gamer's, so there are no audience-keyed variants and nothing
may address one reader over the other's head. Where the advice genuinely differs by
reader, write the one neutral sentence that is true for both — naming who does what
inside it ("if there is no account yet, a parent creates it") rather than splitting the
text in two.

The register is the About notes' register: warm, plain, human, no jargon. The brand and
vocabulary rules in `src/CLAUDE.md` bind here like anywhere else, and one of them binds
hard: **never tell anyone to hand a password to a person.** Where source material says to,
the guide says the opposite, as a mechanism a reader can hold us to.

## Every step declares a scope, because in person we bring the machines

**Rule: an `always` step renders on every product; an `ownDevice` step renders only on a
remote one.** At an in-person product School of Gaming supplies the computers with
everything already installed, so an install, sign-in or test step is not the family's to
do there and is scoped to the device. A guide read on a phone the family owns has no
device-scoped steps at all, because the phone is theirs wherever the session happens.

**Rule: an account step is scoped by where the login comes from, not by the fact that it
is an account.** In person we provide the Minecraft login as well as the machine — at our
own venues the gamers play on School of Gaming's Minecraft accounts and are not allowed to
sign in with their own on our devices, and municipality clubs run on School of Gaming's
Minecraft Education accounts. So the Minecraft account steps are scoped to the device
alongside the installs, and all three Minecraft topics have nothing to say in person: no
heading, no intro, no closing. The other four topics keep account steps that survive every
filter, because those accounts are the family's own wherever the sessions happen — the
family creates them, holds them, and brings them to an in-person session the same way they
bring them to a remote one.

## One step belongs to the product, not to the topic

**Rule: getting the mic and camera ready for the voice room is declared once, outside every
topic, and appended as the last step of every remote guide.** It is a fact about a *remote*
product — the session happens in a browser room, and in person there is no room to join —
so writing it into the seven topic blocks would be seven copies of one paragraph, drifting
apart the first time one of them was edited. Its scope is `ownDevice` for the reason the
axis exists: the room runs on the family's own machine, and in person it does not run.

**Consequence: a label-only topic now has a guide, on a remote product only.** The five
topics that name subject matter rather than one piece of software (esports, creator studio,
game studio, programming, AI) brought no steps and rendered nothing; remotely they now
render exactly one step, under a generic intro of its own rather than a topic's. That makes
`null` unreachable on a remote product: every remote guide has at least the room to get
ready for, and the empty answer is now an in-person answer alone.

**Consequence: an intro may not count the steps.** A guide that opened "Three things to sort
out" was true of what the topic declared and false the moment a shared step joined it. The
intros state what the guide is about and leave the numbering to the list.

Two consequences the surfaces have to honour:

- **An in-person guide can filter down to nothing, and then nothing renders** — no
  heading, no intro, no closing. That is the correct answer for a topic where we supply the
  machines *and* the logins: there is genuinely nothing to do beforehand, and a guide
  saying so is furniture. The registry's resolver answers this, and it is the only render
  condition a surface should ask — never "does the topic have a block", which is now a
  narrower question than "is there a guide".
- **The intro has to be true of the form being rendered, so the plan names which intro to
  read.** A guide shortened to its account steps cannot open by promising software to
  install, so a topic with both scopes carries a second, accounts-only intro; a guide that
  is only the shared remote step has no topic to open about at all, so it takes one generic
  intro. Those are the plan's three forms — `full`, `accountsOnly`, `remoteOnly` — and the
  discriminant exists precisely because each reads a different message key and only two of
  them have a topic narrow enough to key by. The **closing** deliberately has no twin:
  there is one, shared by every topic and every form, written so that it is true of all of
  them.

## Four surfaces, two renderers, one guide

The guide is rendered by exactly two pieces of code, and both read the same registry and
the same catalog:

- **The content component**, for the three in-app surfaces — the purchase confirmation
  page, the parent's enrolment card and the gamer's. It draws the body only: no card, no
  dialog, no container. Its heading is a prop, because a page wants one above the intro
  and a dialog has already said the same words in its title. The dialog beside it is a
  container for that body rather than a second renderer of the guide: it titles the guide,
  scrolls it, and carries the one button that finishes with it.
- **The email section builder** under `src/lib/email-templates/`, for the confirmation
  mail, in HTML and in plain text. It cannot share React, so it shares the data instead.

A fifth surface does not add a third renderer. If one is ever needed, it composes one of
these two.

**Rule: the resolver runs once per surface, and what travels afterwards is its answer.**
Every surface has to ask `resolveTopicPrep` before drawing anything — a card around
nothing is still a card, and an empty dialog is worse — so both renderers take that plan
rather than a topic to resolve again for themselves. Whoever holds a plan holds a guide,
which leaves neither renderer with an empty case to have an opinion about, and it is also
what makes the mail's two forms one document: the HTML body and its plain-text twin are
composed from the same plan, so they cannot be filtered differently.

## On an enrolment card the guide is offered once, and then it is gone

The confirmation page and the mail both carry the guide because they *are* the moment
after the purchase. A My SOG card is different: it is on screen every week for the
length of the run, and a family six weeks into a club has a working setup. A card still
pointing them at "create the account, install the software" is spending its one
affordance slot on something they did in February.

**Rule: the card offers the guide until the viewer says they are ready, and then never
again — no reopen link, nothing left behind.** The affirmative inside the dialog is the
only thing that counts as saying so: closing the overlay by any other means leaves the
affordance exactly where it was, because opening a guide to check one step is reading it,
not finishing with it.

**Rule: the dismissal is remembered in a cookie, keyed by the viewer *and* the
enrolment.** It is deliberately not a profile column: no migration, no route, no write
path from a child's session, and the whole feature stays a rendering decision. A cookie
rather than browser storage for one reason, and it is the reason the whole design turns
on: **a cookie is the only store the machine drawing the page can read.** The dashboards
are server-rendered, so an answer the server cannot see is an answer that can only be
applied a tick after hydration — which means every card first paints the state the family
has already finished with, and then corrects itself under them.

What the key buys is the case a family actually hits — a parent and a child sharing one
computer, where a parent finishing with the guide must not take it away from the child
who has not read it — and, per enrolment, a second child in the same club being a second
setup on a second machine. What it costs is that a second device is offered the guide
again, which is a click.

**Rule: the value is read on the server and written by the browser, and neither end owns
the format.** The parse, the serialise and the key's spelling live in one isomorphic
module that both ends import; the server helper beside it is a thin wrapper over the
request's cookie jar. A dashboard route resolves the reader's id, filters the cookie down
to that person, and hands its page body a plain set of participation ids — so what
travels through the page is already about the reader, and a card asking whether *this*
enrolment is finished with cannot accidentally answer for the other person sharing the
browser. The write is a read-modify-write against the live cookie on every answer,
because one dashboard draws many cards and a value captured at render time would let the
second answer of a visit overwrite the first.

**Rule: the cookie is capped, and the oldest answers are what go.** It rides on every
request to the site, so it is not a store to let grow: past its cap the entries at the
front are dropped. The newest answer is the one a reader has just given and would notice
being ignored; an old one dropped costs a click.

**Rule: a browser that refuses cookies is a family who gets offered the guide.** Every
read and write is wrapped, and anything that throws, is missing or cannot be parsed means
"not dismissed". Of the two ways to be wrong, offering a guide twice costs a click and
swallowing it costs somebody the instructions. The reader who has just answered the
dialog still sees the affordance go away, because the card holds their answer in local
state for the visit — a refused write must never leave the button under the cursor of
somebody who has just pressed it.

**A fixture surface states the answer rather than seeding a store.** The style guide
draws several enrolment cards whose subject is what sits in the locked Join's slot, and
every remote fixture has a guide behind it, so left alone each of those demos would show
"Get ready" instead of the state it is named for. Because the answer is a prop, the page
simply hands those cards a literal set and hands the one demo that *is* about the guide
an empty one — and nothing a demo does touches, or is touched by, what a real family's
browser has stored.

## The offer is bounded by the family's first two sessions

**Rule: the guide is offered from the moment the seat became this family's until the end
of the second session that starts after it, and after that the card offers nothing —
answered or not.** The dismissal alone was never enough. A family six weeks into a club
has a working setup, and a rule that only stops offering once they *confirm* a dialog
about their first session means the platform introduces itself to every long-standing
family by asking them to do exactly that, on the day the feature ships. The window is
what makes a release quiet: for everyone whose second session is behind them, nothing
changes at all.

**Two sessions, not one**, because the first session is where a setup problem is
*discovered* rather than where it stops mattering: a family who could not get the account
working on Monday is precisely the family who wants the steps again before Wednesday.
**Sessions, not days**, because a weekly club and a daily camp are the same amount of
experience at wildly different distances from the purchase.

**Rule: the moment the seat became theirs is the later of when they signed up and when
they were placed in a group.** A family promoted off a waitlist joined the queue weeks
before the seat was theirs, and counting from the day they queued would hand them a
window that closed before they had anything to prepare for. A family who bought outright
is placed within a day or two, where the two stamps are near enough that either would do
— so the later one is right in both cases and needs no branch.

**Only occurrences that *start* after that moment count.** A family placed mid-session
did not attend that one, so it teaches them nothing and must not spend half their window.
A family placed a quarter of an hour before one gets that session and the one after it.

**No occurrences means no end at all, and that is the deliberate answer rather than a
degenerate one.** A seat nobody has been placed in yet, and a product with nothing on its
schedule, are both a family with the whole setup ahead of them and no date to measure it
against; closing the offer on them would withhold the guide from precisely the reader it
is written for. A single-occurrence product — an event — ends with that one occurrence.

**Rule: the summary carries the window's *end*, not a verdict, and the card decides
against the live clock — except on the two additive placements.** In the locked Join's
slot the swap is button for button in one slot, so a window closing while a page is open
may close on the card too and nothing moves. On the placements that *add* a button — the
quiet link beside a lit Join, and the button under a footer sentence — there is nothing
underneath to take the space back, so a button vanishing on time's own schedule would
shrink the card and pull the column up under whoever was reading it. Those two freeze the
answer at the card's first render and keep it until the page is loaded again.

## Where the affordance goes on a card, and what it may displace

The card has one footer, and what the guide does there depends on what else is in it.

- **In the locked Join's slot, while the room is closed.** That button is inert and
  restates the schedule row above it, so it is the one thing on the card the guide may
  take the place of. It comes straight back once the family says they are ready, which is
  what makes the exchange cost a parent who is already set up exactly one click.
- **Beside a lit Join, as a quiet muted link.** **Rule: an open room is never gated,
  delayed, or dressed down by this guide.** A session happening now is the whole reason
  the card exists; the guide steps down into the same subordinate treatment the
  leave-waitlist affordance uses and sits underneath.
- **Under the footer sentence, on the cards with no Join at all** — the in-person one
  naming its site, and the seat nobody has been placed in yet. The unplaced card is inert
  *as a link* because there is no page behind it; a dialog is not a page, and the wait for
  a placement is exactly the window this guide is written for.
- **And on a card whose footer would otherwise not be drawn**, which is the same placement
  with nothing above it. The footer is populated rather than reserved, so a card where
  every sentence branch comes up empty — an in-person seat whose location has no name yet,
  a remote one with a room but nothing on its schedule — normally has no footer at all.
  The guide is enough to draw one for: those families have just paid and have the whole
  setup ahead of them, so a card that dropped the row would be withholding the guide from
  precisely the reader it is written for. **Anything deciding whether that row renders has
  to count the offer**, and this is the way to get this feature wrong that a card's own
  rendering will not show you.
- **Nowhere on a queue place or a finished run.** There is no seat to get ready for in the
  first, and the second's first session is years behind it.

**Rule: the affordance is a control, so it lifts itself above the card's stretched link,
and the dialog it opens is portalled out of the card entirely.** The card is one big
anchor; anything with a click of its own has to sit above it, and anything that is merely
text must not, or the card grows a strip that swallows clicks and does nothing.

## A first paint that is final

The dashboards are server-rendered, and **the first client paint is identical to the
server's because both are drawn from the same value** — the cookie, parsed once by the
route and handed down as a prop. There is no third "not answered yet" state anywhere in
this feature, and nothing about the affordance arrives, disappears or swaps at hydration.

That is a fix rather than a refinement, and the shape it replaced is worth remembering.
The answer used to live in `localStorage`, which a server cannot read, so a card had to
render its *undismissed* state first and correct itself once the browser had spoken. In
the locked Join's slot that cost a visible flash of the Join button in the frame before
"Get ready" took the slot — the button a family was reaching for, appearing and vanishing
under them. On the two additive placements it cost a shift: the button arrived a tick
after hydration and grew the card downward, pushing every card below it down the column.
Neither is a cost this design pays any more, and no future arrangement that reintroduces
a post-hydration read is an acceptable trade for it.

What the card still holds for itself is one thing: the reader's own answer, this visit.
A dismissal changes the card the instant the dialog's affirmative is pressed, without
waiting for a navigation and whatever the browser does or does not store — a change the
reader asked for, which is the one kind the layout rule permits freely.

## Where the pieces live

The registry holds **structure and literals only** — a step's key, its scope, its URL, and
the keys of any list-shaped prose beneath it (per-platform notes, a checklist). Every
string a reader sees is in the message catalog, keyed by what the registry declared. That
is the same relationship the About block already has with its own namespace, and it is
what lets the compiler check that a step the registry names has prose to render.
