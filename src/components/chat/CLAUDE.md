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
plausibly still wants.

## Layout rules this surface leans on hardest

- **The log is a fixed-height scroll region.** A log that grew with its content would push
  the composer down the page on every arrival, which is a change on data's own schedule.
- **It sticks to the bottom only for a reader already there.** Somebody who scrolled up
  keeps their exact position and gets a count plus one press to come back.
- **A removal leaves a tombstone, never a hole.** The row keeps its place, so a message
  deleted three screens above a reader does not pull what they are reading upward.
- **Every image box is arithmetic from the stored dimensions**, sharing the session
  gallery's function at this module's own thumbnail height. Nothing measures a decoded
  image — in a scrolling log that is not a nicety, since a row that grew after paint would
  move whatever the reader was on.
- **The log is a fixed-height scroll region, and the height is the container's to
  choose.** The surface takes a height class from whatever embeds it — a voice-room
  panel, a future full-page chat — with a default beside the log itself. Any value is
  fine; growing with content is what is forbidden. The preview scene's geometry
  controls exist to judge the design at each reuse shape.
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
an account rather than on a string anybody could type. A bare `@name` somebody typed by
hand stays plain text, because it is a mention of nobody.

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
