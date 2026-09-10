# Topic prep — the "Before the first session" guide

A product's topic can carry a short guide telling a family what to do before the first
session: create the account, install the software, test it. This directory holds the one
React component that renders it. The steps themselves are declared in the product topic
registry under `src/lib/products/`, and every word a reader sees lives in the top-level
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

- **This component**, for the three in-app surfaces — the purchase confirmation page, the
  parent's enrolment card and the gamer's. It draws the body only: no card, no dialog, no
  container. Its heading is a prop, because a card wants one above the intro and a dialog
  has already said the same words in its title.
- **The email section builder** under `src/lib/email-templates/`, for the confirmation
  mail, in HTML and in plain text. It cannot share React, so it shares the data instead.

A fifth surface does not add a third renderer. If one is ever needed, it composes one of
these two.

## Where the pieces live

The registry holds **structure and literals only** — a step's key, its scope, its URL, and
the keys of any list-shaped prose beneath it (per-platform notes, a checklist). Every
string a reader sees is in the message catalog, keyed by what the registry declared. That
is the same relationship the About block already has with its own namespace, and it is
what lets the compiler check that a step the registry names has prose to render.
