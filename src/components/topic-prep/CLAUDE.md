# Topic prep — the "Before the first session" guide

A product's topic can carry a short guide telling a family what to do before the first
session: create the account, install the software, test it. This directory holds the
component that renders its body, the dialog an enrolment card opens it in, and the hook
that remembers a family has finished with it. The steps themselves are declared in the
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
everything already installed, so a family only has to bring the accounts. Account steps
are `always`; install, sign-in and test steps are `ownDevice`. A guide read on a phone the
family owns has no `ownDevice` steps at all, because the phone is theirs wherever the
session happens.

Two consequences the surfaces have to honour:

- **A topic can filter down to nothing, and then nothing renders** — no heading, no
  intro, no closing. That is the correct answer for a topic where we supply the machines
  *and* the logins: there is genuinely nothing to do beforehand, and a guide saying so is
  furniture. The registry's resolver answers this, and it is the only render condition a
  surface should ask.
- **The intro has to be true of the filtered form.** A guide shortened to its account
  steps cannot open by promising software to install, so a topic with both scopes carries
  a second, accounts-only intro and the resolver says which one this render takes. The
  **closing** deliberately has no twin: there is one, shared by every topic and both
  forms, written so that it is true either way.

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

**Rule: the dismissal is remembered in the browser, keyed by the viewer *and* the
enrolment.** It is deliberately not a profile column: no migration, no route, no write
path from a child's session, and the whole feature stays a rendering decision. What that
costs is that a second device is offered the guide again, which is a click. What the key
buys is the case a family actually hits — a parent and a child sharing one computer, where
a parent finishing with the guide must not take it away from the child who has not read
it — and, per enrolment, a second child in the same club being a second setup on a second
machine.

**Rule: a browser that refuses storage is a family who gets offered the guide.** Every
read and write is wrapped, and anything that throws or is missing means "not dismissed".
Of the two ways to be wrong, offering a guide twice costs a click and swallowing it costs
somebody the instructions.

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
- **Under the footer sentence, on the two cards with no Join at all** — the in-person one
  naming its site, and the seat nobody has been placed in yet. The unplaced card is inert
  *as a link* because there is no page behind it; a dialog is not a page, and the wait for
  a placement is exactly the window this guide is written for.
- **Nowhere on a queue place or a finished run.** There is no seat to get ready for in the
  first, and the second's first session is years behind it.

**Rule: the affordance is a control, so it lifts itself above the card's stretched link,
and the dialog it opens is portalled out of the card entirely.** The card is one big
anchor; anything with a click of its own has to sit above it, and anything that is merely
text must not, or the card grows a strip that swallows clicks and does nothing.

## A dismissal a server cannot know, and a first paint that must not move

The dashboards are server-rendered and the browser holds the answer, so **the first client
paint has to be identical to the server's**. The storage is read the way React reads any
external store, with a server snapshot that says "no answer" — which is the truth about a
machine with no browser storage — so the two paints agree by construction rather than by
care. That leaves the affordance *arriving* just after hydration rather than disappearing
just after it, and the two placements pay for that differently.

In the Join's slot it costs nothing: the slot holds a button either way, so the swap is
button for button and no pixel moves. On the two additive placements the button appears
one tick after hydration and grows the card downward, pushing the cards below it down the
column. That is accepted rather than reserved, and the reasoning is worth keeping: a
button's worth of held-open space would sit under the footer of every card whose family
has already said they are ready — permanently, on the common card — to save one shift on
the first visit of a card that has not been dismissed. The button lands at the very end
of the footer, which is where the layout's slack already is, so nothing above it moves.

## Where the pieces live

The registry holds **structure and literals only** — a step's key, its scope, its URL, and
the keys of any list-shaped prose beneath it (per-platform notes, a checklist). Every
string a reader sees is in the message catalog, keyed by what the registry declared. That
is the same relationship the About block already has with its own namespace, and it is
what lets the compiler check that a step the registry names has prose to render.
