# Chat components

The chat surface, built from scratch for the persisted-chat overhaul. These are
**production** components: the preview scene drives them from fixtures today, the voice
room will drive them from a live subscription, and the wire-up swaps the data and keeps
the UI. The old voice `ChatPanel` (`src/components/voice/ChatPanel.tsx`) is a *reference*
for the two conventions it already had right — sender grouping and an auto-sticking
fixed-height log — and is otherwise untouched by this module.

## The contract: transport-free, props in, intentions out

**Rule: nothing in this directory opens a socket, holds a query, or knows where its rows
came from.** A surface hands the view messages, accounts, who is locked and who is
typing; the view hands back intentions (send these drafts, remove this message, lock this
person). That is what lets one component tree serve a fixture scene, a voice room and a
future direct-message surface with no branch inside it — and it is what makes the design
signed off in fixtures the design that ships.

The one piece of state the view *does* own is which message is being replied to. It is
state about looking at a chat, no page has a use for it, and threading it outward would
only give a second copy the chance to disagree.

**Rule: the image URL is resolved by the container, not by the renderer.** A stored image
arrives as `{ id, src, width, height }` with `src` already servable. Session photos derive
their object name from a row id through a shared helper; chat has no bucket yet, so a URL
somebody else produced is the honest contract. When the bucket lands, the container fills
`src` from that helper and nothing here changes.

## The capability module

`capabilities.ts` derives what a composer and a message menu **offer**, from the viewer's
role and the channel's locks. It is the one piece of chat permission logic that is
genuinely client-side, and it is deliberately a production module rather than a preview
one: the scene feeds it real fixture state and switching account re-runs it for real.

**Rule: no component tests a role itself — every offer comes from this module.** Three
places would otherwise answer the same question and drift: the composer, the message
action bar, and (later) the guards the wire-up writes. Moderation is a **positive
allow-list** of roles (`admin`, `gedu`), never an exclusion — the voice room learned that
the expensive way, where a "not a gamer" test would have handed moderation to parents the
day parent seats shipped. A parent in a chat is a participant with no moderator powers,
exactly like a child.

The rules the module encodes, each with its reason, are in its own header. The one worth
knowing from outside: **a lock takes away everything that writes — replies and reactions
included — except deleting your own message.** A reaction is a message with fewer
characters; taking back something you regret is the one thing a locked member most
plausibly still wants. **A message that *failed* to send can be deleted too** — the
refusal leaves a bubble in the sender's own log with nothing but a retry on it, and
"it did not go and I want it gone" has to have an answer. Nothing is asked of the server
(there is no row yet), so it drops rather than leaving a tombstone, and it is not
confirmed: the confirmation warns about what other people will see, and nobody has seen
it. A *pending* one still has an outcome coming and stays excluded.

**Rule: per-person moderation acts are symmetric — any moderator may apply them to
anyone, fellow moderators and admins included. Lock-class acts are not.** A
platform-wide principle *(owner ruling, 2026-09-01)*, stated in full in the module's own
header and applying wherever there are moderator controls, the voice room included.
Removing a message acts on one thing that was said, in front of the people who saw it: it
is reversible, recorded, and takes nothing away from the person it lands on — and a rule
exempting staff would make the one message nobody could take down the one a moderator is
standing next to. A **lock** is a judgement about the person rather than the message, and
between colleagues it is not moderation but one member of staff silencing another in
front of children they are both responsible for. So `canHide` carries no mod-vs-mod test
and `lockControl` does, and both halves are pinned by tests so neither reads as an
accident later.

## Layout rules this surface leans on hardest

- **The log is a fixed-height scroll region, and the height is the container's to
  choose.** A log that grew with its content would push the composer down the page on
  every arrival, which is a change on data's own schedule. The surface takes a height
  class from whatever embeds it — a voice-room panel, a future full-page chat — and any
  value is fine; growing with content is what is forbidden. The default lives in
  `ChatView` and nowhere else, which is why the list's own height class is required
  rather than defaulted. The preview scene's geometry controls exist to judge the design
  at each reuse shape. The fixed height covers the log *plus the reply strip*: starting a
  reply hands the strip its height out of the log's, so no composer state can resize the
  surface or move anything below it.
- **It sticks to the bottom only for a reader already there.** Somebody who scrolled up
  keeps their exact position and gets a count plus one press to come back.
- **A removal leaves a tombstone, never a hole.** The row keeps its place, so a message
  deleted three screens above a reader does not pull what they are reading upward.
- **Every image box is arithmetic from the stored dimensions**, sharing the session
  gallery's function at this module's own thumbnail height. Nothing measures a decoded
  image — in a scrolling log that is not a nicety, since a row that grew after paint would
  move whatever the reader was on.
- **The mention suggestion list floats above the composer, overlaying the log.** In flow
  it grew the composer with every keystroke after an `@`, which changed the height of the
  whole surface — the same defect the fixed log and the reply strip's borrowed height
  exist to prevent, arriving from the other end *(owner ruling)*. It is anchored to the
  top of the composer's box and layered above the log's own absolutely-positioned
  children by z-index rather than by DOM order.
- **Everything that appears on hover or on somebody else's schedule is absolutely
  positioned**: the message action bar, the unread pill, and the typing indicator. None
  of them can move a row. The indicator's spot took three tries to land (its doc
  comment tells the story): it overlays the *embedding container's bottom padding*,
  just past the surface's own bottom edge — space that already exists, holds nothing
  it could cover, and is not read as an empty slot while nobody is writing. The
  contract that buys it: whatever embeds the chat leaves at least one text line of
  bottom padding under it.
- **A reader at the bottom stays glued to the bottom through *any* row-height change**
  — a reaction row appearing, an edit growing a message — not just arrivals; a
  dependency-free layout effect re-pins the bottom edge after every commit. A reader
  scrolled up is the browser's job: native scroll anchoring holds their place while
  content above them changes.
- **Menus and pickers portal out** (`ChatPopover`), because the log clips its own
  children. It measures the trigger at open time — a user gesture, the one moment
  measuring is free — and closes on a scroll rather than following one.

## The mention token

A mention rides *inside* the body as `@[Name](id)` — not a join table. A v1 mention is a
chip plus emphasis for the person named: no badge, no sound, no out-of-room notification.
The name is a snapshot so the sentence reads wherever the body travels; the **id** is the
truth, so a renderer that has the account draws its current name and the highlight keys on
an account rather than on a string anybody could type.

**Rule: no field a writer types into ever shows that token — the composer and the
in-place editor alike.** Picking a name inserts `@Name`, the form the sentence reads in;
the substitution happens once, on the way out, over the whole draft
(`resolveChatMentions`). A writer watching brackets and a UUID appear inside their own
half-finished sentence is watching the plumbing *(owner ruling)*, and the character cap
would be counting characters they cannot see. The stored format is unchanged; what
changed is that nobody has to look at it.

**The editor is the composer's mirror and has to stay one**, because it opens on a body
the composer already wrote: it seeds the field by flattening the tokens back to `@Name`
(`chatBodyPlainText`) and resolves again on save, against **the same roster array in the
same order** — `ChatView` derives that array once and hands it to both. The order is what
settles two accounts sharing a name, so a second list built somewhere else would let one
word mean two different people depending on which field it was typed into. The
consequence a reader should expect: a name typed for the first time *during* an edit
becomes a mention, exactly as it would have in the composer.

Two consequences follow, and they pull in opposite directions if you read them quickly:

- **Hand-typing `@Name` of a real account now becomes a mention at send.** Resolution is
  case-insensitive, tries the longest name first so a name that prefixes another does not
  strand the rest of it, requires a letter or digit *not* to follow (`@Ainoa` is not
  Aino), and leaves anything matching no account exactly as typed. Two accounts sharing a
  name resolve to whichever the caller listed first — an accepted v1 tolerance, stated in
  the function's own header with what fixing it would cost.
- **A bare `@name` inside an already-stored body still renders as plain text.** That rule
  governs *rendering* and is untouched: a body reaching a renderer has already been
  through resolution, so an unresolved `@` in one is a mention of nobody.

**Rule: mentions are the `info` token, everywhere they show** *(owner ruling)* — the chip
inside the body and the tint-and-ring on a row that names the reader are one colour,
because they are one concept. Primary stays the surface's own emphasis (a sender's name,
a quote bar) and, specifically, the **jump flash**: that is the log pointing at where a
reply landed, not a mention, and it fades.

**Rule: the character cap counts the *composed* text, so the stored body can run longer —
and the cap therefore bites *before* resolution, never after.** The send takes the display
text and resolves it itself, in that one order, so there is no call spelling for "already
resolved, do not cap": a cap applied to the token form would cut a draft that is at the
limit and names somebody, possibly mid-token, leaving `@[Väinö](789a4f…` in the log as
literal text. Pinned by a test at exactly the cap. The wire-side half is in the constant's
own header: the send RPC either measures the display length or caps the column high
enough, and must not apply the composer's number to the stored string.

## The reaction set is a constants edit

`src/lib/constants/chat.ts` owns the approved codes and the character each one draws.
Glyphs live in code because `messages/` may not hold emoji; a reaction's *name* is a
translated string keyed by its code. Changing the set is that tuple plus the matching
`chat.reactions.*` labels in every locale — which is what makes the owner's final pick a
code edit inside this surface rather than a follow-up feature. When the wire-up lands, the
DB stores the code and CHECK-constrains it against this same list, so no raw emoji ever
reaches a column.

**Rule: the tally row is drawn in the approved set's order, never in arrival order.** A
row that reshuffled whenever somebody was first to press a different face would move a
button under a reader's cursor.

**Rule: a removed message draws no reactions, for any viewer** *(owner ruling)*. Six
laughing faces standing under a tombstone tell a reader what kind of message it was,
which is exactly what removing it took away — so the tally goes with the words. This is a
rendering decision and nothing else: the reactions are untouched in the data, and a
moderator still reads the dimmed original above, because the people who can see the body
are the only ones the tally could have told anything new.

## Text XOR one image

The composer stages and the send fans out: one image-only message per picture, then one
text message. That removes captions, an attachment child table, and the question of what a
caption on the third of five pictures means. The grouping folds a burst back into one
wrapping thumbnail row, so the same gesture reads as one set — but the pictures are still
**several messages**, which is why the row takes a per-thumbnail overlay: a moderator
removes one picture, not the set.

Decoding a picked file happens once, at staging, and its numbers are then treated as
stored. Measuring at *ingest* is the pipeline doing its job; measuring at *render* is what
the layout rule forbids.

**Rule: a staged picture's object URL is released by whoever last holds it, and a *sent*
one is deliberately never released here.** Staging mints an object URL per file, and there
are exactly three ends for one: the ✕ revokes it, the over-cap refusal revokes the tail it
turned away, and a send hands ownership to the message it became — the log is drawing that
blob, so revoking it at the composer would blank the thumbnail the sender just posted. The
message's URL is freed when the page goes, which is the honest lifetime until a bucket
exists to re-point `src` at.

**Rule: the fullscreen overlay is not this module's — it is the shared
`FullscreenImageViewer` in `components/ui`** *(owner ruling: the two forks are combined)*.
Opening, paging with wrap-around, the counter, closing and where focus lands are one set
of expectations wherever a picture is opened to be looked at, and the session feed has
exactly the same ones. What stays here is the *collection*: a chat set is one send's
burst, its images already carry a servable `src`, and the words are chat's own — handed
to the overlay as labels, which is what lets a chat say "image" where a session card says
"photo" without a shared namespace forcing one vocabulary on both. `ChatImageRun` passes
its images straight through; nothing adapts them, which is why chat has no viewer file at
all where the session feed keeps a thin one to resolve ids into URLs.

**Rule: every chat image renders `unoptimized`, and the wire-up has to revisit that.** It
is right today because every `src` this surface meets is a blob URL or fixture art, neither
of which Next's optimizer can fetch — but the renderer takes a URL somebody else produced
and cannot tell one kind from another, so it cannot make the decision per image. When real
stored images land, the choice belongs wherever the container resolves `src`, and leaving
the flag on unexamined would ship an unoptimized image pipeline to every family.

## One home: the preview scene, not the style guide

**Rule: these components have no style-guide demo, and must not gain one.** A chat is
judged by how a run of messages sits against the run above it, at the width the panel
actually gets, inside a log that scrolls — none of which a demo card can show. The scene
at `/preview/chat/session` is where every state lives side by side, and two homes for one
thing is worse than either alone, because it is the style guide's copy that goes stale.

The shared fullscreen viewer is not an exception to that: it is a `components/ui`
overlay two surfaces render, it opens above whatever summoned it and so can be judged
alone, and the style guide demos it there. What has no demo and must not gain one is
chat's *composition* of it — a burst of thumbnails in a scrolling log.

The scene is one scenario because the account switcher is what a second scenario would
have been: child, locked child, parent, Gedu and admin are all reachable without leaving
the page, so they compare themselves rather than being compared from memory.

## Fixtures

`mock-chat-fixtures.ts` is deliberately **not** a client module — the preview route calls
its scenario guard on the server to decide whether a slug is a 404. Its roster ids are real
literal UUIDv4s, and most of them are *borrowed* from the session-feed and voice-room
fixtures: an identicon is hashed from the id, so a reviewer comparing the chat panel with
the room it will live in is comparing the same faces rather than two unrelated crowds.

## Not here yet

No schema, no API route, no realtime — those are the wire-up's, planned from
`docs/investigations/chat-overhaul.md`. Two shapes this module already assumes and the
wire-up has to keep: the optimistic echo (a sender's own message is on screen as
`pending` before anything acknowledges it, and a refusal offers a retry), and the soft
delete (the row and the bytes survive a removal, and a moderator keeps reading it, because
a moderator deleting something is the moment the record matters most).
