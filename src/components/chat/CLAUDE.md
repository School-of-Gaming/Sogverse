# Chat components

The chat surface: persisted messaging in the scheduled voice rooms. Two things drive these
components, and they drive the same tree — the preview scene at `/preview/chat/session`
from fixtures, and a container beside the voice room
(`src/components/voice/GroupSessionChat.tsx`) from a live query, one realtime subscription
and the guarded write RPCs behind `src/services/chat/`. Nothing in here can tell which.

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
arrives as `{ id, src, width, height }` with `src` already servable, and nothing here asks
where one came from. The address itself is now derivable — a stored picture is served by
the authenticated read route at a stable path built from the message id — but the
*decision* is not: which of the three kinds of `src` a picture gets (the read route's
path, the sender's own staged blob, fixture art), and whether it gets one at all rather
than the placeholder (a row whose bytes have not landed yet draws nothing servable), is a
function of row state and viewer that only the container holds. Producing the answer is
therefore still not this module's job. See "The wire behind the props" for what the
container does.

## The capability module

`capabilities.ts` derives what a composer and a message menu **offer**, from the viewer's
role and the channel's locks. It is the one piece of chat permission logic that is
genuinely client-side, and it is deliberately a production module rather than a preview
one: the scene feeds it real fixture state and switching account re-runs it for real.

**Rule: no component tests a role itself — every offer comes from this module, and the
write RPCs' guards mirror it.** Three places would otherwise answer the same question and
drift: the composer, the message action bar, and the server. A UI offering what the server
refuses — or refusing what it would allow — is what that pairing prevents, so a change to
what is offered here is unfinished until the matching guard moves with it. Moderation is a
**positive
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

**Because a lock is about the person, it is derived per person and a message menu is only
one of the places that asks.** The voice room's participant rail offers the same control
beside a name — a moderator lifting a lock should not have to hunt the log for something
that child wrote — so the derivation takes a viewer, a target and whether the target is
locked, with no message in it, and the message menu calls it with the message's sender.
The rail is handed the conclusion as a prop and derives nothing itself (the seam is
described in `src/components/voice/CLAUDE.md`). Two rules the person-shaped version adds
to the message-shaped one: **a target the roster cannot name is offered nothing** — a
voice-only guest in the room is not a member of the channel, and locking somebody whose
name the control cannot print is a moderation act aimed at a blank — and the same
mod-vs-mod and not-yourself exclusions hold, because they were always about the person.

## Layout rules this surface leans on hardest

**The hard rule, from which most of the rest of this section follows: the chat surface
has exactly one height, granted by its container, and it never grows** *(owner ruling)*.
A chat is placed somewhere with only that space allotted to it — a panel beside a video
grid, a column in a dashboard — so whatever a person does inside it has to happen inside
it. Nothing on the page below a chat may be moved by anything that happens in the chat.

The mechanism is one flex column carrying the whole surface (`ChatView`), in which **the
log is the only flexible child** and everything else is `shrink-0`. So the log is the
budget: every interaction that needs room is paid for out of it, and the reader at the
bottom sees the conversation slide up to make room rather than the page change shape.
Three instances of the one rule, none of them a separate story:

- **A reply strip borrows its height from the log.** It appears between the log and the
  composer, inside the column, so starting a reply cannot resize the surface.
- **The composer grows *upward*, to five lines, then scrolls internally** *(owner
  ruling)*. Adding a line takes the line out of the log; five is where growth stops,
  because growth paid for out of the log has to stop before the log is gone. The field
  sizes itself in a layout effect — measured on the user's own keystroke, on the field
  their hands are in, which is a user-caused change and not the kind the layout rule
  forbids. The staged-thumbnail row and the refusal line are the same bargain a step
  simpler: they live in the composer's box and so come out of the same budget.
- **The mention suggestion list takes no space at all.** It floats above the composer,
  overlaying the bottom of the log, anchored to the top of the composer's box (so it
  follows a growing field) and layered above the log's own absolutely-positioned children
  by z-index rather than by DOM order. In flow it grew the box on every keystroke after an
  `@`, which is a different thing from the field fitting the words: one is the box
  reacting to a list of names, the other is the box fitting what was typed into it.

The height class is the *whole surface's*, and its default lives in `ChatView` and
nowhere else — which is why the message list's own height class is required rather than
defaulted. The preview scene's geometry controls exist to judge the design at each reuse
shape, and the shortest one is where a five-line draft has the least log to take from.

The rest of the section is the log's own behaviour under that budget:

- **It sticks to the bottom only for a reader already there.** Somebody who scrolled up
  keeps their exact position and gets a count plus one press to come back.
- **A reader at the bottom stays glued to the bottom through *any* change of size** —
  a reaction row appearing, an edit growing a message, and equally the log's own *box*
  shrinking when the composer takes a line. The content half is a dependency-free layout
  effect that re-pins after every commit; the box half is a `ResizeObserver` on the log,
  deliberately not a prop somebody above has to remember to bump, so it holds for any
  future control that takes a slice of the column. A reader scrolled up is the browser's
  job: native scroll anchoring holds their place while content above them changes.
- **A removal leaves a tombstone, never a hole.** The row keeps its place, so a message
  deleted three screens above a reader does not pull what they are reading upward.
- **Every image box is arithmetic from the stored dimensions**, sharing the session
  gallery's function at this module's own thumbnail height. Nothing measures a decoded
  image — in a scrolling log that is not a nicety, since a row that grew after paint would
  move whatever the reader was on.
- **A pending row and the settled row it becomes are the same height, to the pixel.** An
  optimistic echo reconciles on the *server's* schedule and the body survives the change,
  so the rule binds outright: what a pending row is allowed to change is its *appearance*
  (it wears `opacity-60`) and never its geometry. So the delivery note draws nothing in
  flow for `pending` — the announcement is `sr-only`, which is the same out-of-flow trick
  the indicator uses — and reserving the line in both states was rejected as the other way
  to get it wrong: a strip held open under every bubble in the log for a state almost no
  message is ever in. It is also what the loading-affordance rule asks for, a guarded RPC
  on an indexed write being a near-instant call that earns no affordance at all. **The
  `failed` row is the deliberate exception** and takes its line: it is not the ordinary
  path, and the retry has to be readable and reachable. Pinned by a test that compares
  the two renders' in-flow elements, because jsdom cannot measure and the class list is
  what decides the height.
- **Everything that appears on hover, on a tap, or on somebody else's schedule is
  absolutely positioned**: the message action bar, the unread pill, and the typing
  indicator. None of them can move a row. That is also what lets the bar have a touch
  path at all (below): revealing it costs no height, so the gesture that reveals it
  cannot move anything either. The indicator's spot took three tries to land (its doc
  comment tells the story): it overlays the *embedding container's bottom padding*,
  just past the surface's own bottom edge — space that already exists, holds nothing
  it could cover, and is not read as an empty slot while nobody is writing. It is also
  the one thing drawn outside the fixed column, and it takes no space there either. The
  contract that buys it: whatever embeds the chat leaves at least one text line of
  bottom padding under it.
- **Menus and pickers portal out** (`ChatPopover`), because the log clips its own
  children. It measures the trigger at open time — a user gesture, the one moment
  measuring is free — and closes on a scroll rather than following one. **Its alignment
  is a preference and the viewport is the constraint**: right-aligned to the trigger and
  hung above it, then pushed back inside an 8px margin on whichever edge that would have
  escaped, with the box capped at the window's own width so a clamp always has somewhere
  to put it. A `fixed` overlay off the edge of the screen is unreachable by any scroll,
  and the case that found it is real — a small thumbnail at the *start* of a picture run
  anchors the bar far enough left that a right-aligned picker begins off-screen. The
  arithmetic is a pure function (`placeChatPopover`) because jsdom cannot measure, so
  the clamp can only be pinned apart from the DOM.

## Reaching the actions without a hover

The action bar was revealed by `group-hover` and nothing else, which on a phone left
reply, react, edit and every moderation act unreachable — on the surface a family is
most likely to meet the product on. **A tap on a message now reveals the same bar a
cursor reveals**, in the same place, at the same size, so the touch path costs the
layout nothing.

**The two halves are one bar and one state class, never two components.** Hover is
still CSS; the tap is a `revealed` prop the log holds, because the rule that makes the
gesture usable — *one row's bar at a time* — is a fact about the log rather than about
a row. Any act taken from the bar puts it away, so a reply never costs a second press
to dismiss what offered it, and a press anywhere outside the revealed row closes it.

**A finger is told apart from a cursor per gesture, by `pointerType`, never by asking
what kind of device this is** (`touch-gesture.ts` carries the reasoning). A media query
describes the device's *primary* input, so a finger on a touchscreen laptop would be
told it is a mouse. A browser that reports nothing is treated as a mouse, which is
exactly the behaviour that shipped before the touch path existed.

**The precedence on a picture: a finger's first tap reveals, its second opens; a cursor
and a keyboard open on the first press as they always have.** A thumbnail fills its
whole cell, so there is no margin beside the picture for a tap to mean something else
in — the choice was only ever which of the two gestures comes first. What settles it is
what a mouse already has for free: hovering a thumbnail has shown the bar *before* the
click lands, so making that click a reveal would take away a one-press open and buy
nothing. A finger has been shown nothing, so its first tap is the one that has to say
what is there. The cost is one extra tap per picture, paid only by touch, and it buys
back reply, react and remove on a photograph.

**Hidden means untouchable, not merely invisible.** The bar straddles its row's top
edge, so an `opacity-0` bar that still hit-tests is a strip of invisible buttons over
the bottom of the message *above* it — survivable with a cursor, which reveals whatever
it passes over, and on a phone a tap that opens a reaction picker out of nowhere. So
`pointer-events` travels with the opacity in every state. Keyboard reach is untouched
and must stay so: `pointer-events: none` takes nothing out of the tab order, the bar is
never hidden by `display` or `hidden`, and focus turns opacity and pointer events back
on together.

**It is reviewed in the scene with device emulation on, and there is deliberately no
control for it.** The scene drives the production components, so the tap path is live at
`/preview/chat/session` — but a desktop pointer honestly reports `mouse`, so the gesture
only exists once the browser is emulating a phone, which is the same mode the 360px
width is judged in anyway. A scene toggle that forced every click to count as a tap
would be a preview-only branch inside the components the scene exists to show
unbranched.

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
literal text. Pinned by a test at exactly the cap. **The server measures the same thing**:
the column's own CHECK flattens the stored mention tokens back to `@Name` before counting,
so one number governs both ends and there is no second backstop to drift from it. A flat
cap on the stored string would refuse precisely the messages that name the most people.

## The reaction set is a constants edit

`src/lib/constants/chat.ts` owns the approved codes and the character each one draws.
Glyphs live in code because `messages/` may not hold emoji; a reaction's *name* is a
translated string keyed by its code. Changing the set is that tuple plus the matching
`chat.reactions.*` labels in every locale — which is what makes the owner's final pick a
code edit inside this surface rather than a follow-up feature — plus, now that reactions
are stored, one migration widening the CHECK that constrains the column against this same
list (there is no database enum; the code is what is stored, so no raw emoji ever reaches
a column). **A code a build does not recognise is dropped rather than drawn**, which is
what lets a deploy trail its migration without leaving a hole in somebody's tally.

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

**Staging is the normalize pass, not a preview of one.** A picked file is decoded,
downscaled under the edge cap and re-encoded as JPEG once, at pick time, and the composer
keeps that output — so the thumbnail on screen and the bytes that get sent are one
artifact, and a file the browser cannot open is refused while the person is still choosing
rather than at Send. Its numbers are then treated as stored, which is what every box on
this surface is arithmetic from: measuring at *ingest* is the pipeline doing its job,
measuring at *render* is what the layout rule forbids.

**What the row stores is the server's own measurement of those bytes**, because a modified
client can simply skip everything above — the upload route re-encodes again, which is also
where the EXIF/GPS strip becomes a mechanism rather than a habit. The client-side pass is
the honest path's pre-shrink; it makes the upload small and the preview truthful, and it
guarantees nothing.

**Rule: a staged picture's object URL is released by whoever last holds it, and a *sent*
one is deliberately never released here.** Staging mints an object URL per file, and there
are exactly three ends for one: the ✕ revokes it, the over-cap refusal revokes the tail it
turned away, and a send hands ownership to the message it became — the log is drawing that
blob, so revoking it at the composer would blank the thumbnail the sender just posted. The
message's URL is freed when the page goes, and that lifetime is deliberate rather than
provisional: the container keeps a sender's own staged blob for as long as the page lives
and prefers it over the read route's path, so a sender never waits for a fetch, never
watches their own picture re-download, and is the one viewer who cannot see the window in
which a row exists and its object does not.

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

**Rule: every chat image renders `unoptimized`, and that holds for stored pictures too.**
A stored chat image is served by the authenticated read route, which answers on the
viewer's own session cookies — and the optimizer's server-side fetch carries no cookies,
so an optimized request could only ever meet the route's 404. Bypassing it is also what
keeps the private chat-image surface out of `images.remotePatterns`, where a pattern
would be a standing optimizer permission on a boundary that is one storage policy. The
other two kinds of `src` this surface meets, a staged blob and fixture art, the optimizer
cannot fetch at all. So the flag is right for every picture this renderer can be handed,
which is what keeps it a property of the component rather than a decision per image — the
renderer still cannot tell one kind of URL from another, and now it does not have to.

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
the room it lives in is comparing the same faces rather than two unrelated crowds.

## The wire behind the props

These components are transport-free and stay that way; what follows are the properties of
the thing on the other side of the props — the ones a reader of this module cannot see
from here and has to know anyway. The transport itself is the voice-room container and
`src/services/chat/`.

**The two shapes this module assumes are kept.** The optimistic echo: a sender's own
message is on screen as `pending` before anything acknowledges it, under an id the client
generated, reconciled by that identity. It is held outside the query cache and always
appended *after* every settled row, so a device with a skewed clock cannot insert itself
into the middle of a log everyone else agrees about, and a reconciling row never travels
upward past anything already painted. And the soft delete: a removal is an update, so the
row and the image bytes survive and a moderator keeps reading what was said. **The one
refusal that offers no retry is a lock** — the composer is already disabled by the lock's
own arrival, so the echo is dropped rather than left under a button that cannot work, and
the composer's lock notice is what explains where the message went.

**Rule: a hidden message's body still travels to every subscriber, and safety copy must
never claim otherwise.** Rows are scoped by channel membership and nothing else, so the
tombstone-for-participants / dimmed-original-for-moderators split is drawn here, on the
client. That exposure is accepted rather than overlooked: everyone in the room received
the body before it was hidden, and redacting it on the wire would protect only a late
joiner reading removed text out of network traffic with devtools. **Hidden pictures are
stricter for free** — the storage policy admits a hidden message's object only to
moderators, and every read re-answers it at fetch time through the read route, so hiding
retracts the image from the next fetch onward; what survives is what the **browser
profile** already cached, for at most an hour. Not "that member's cache" — a family shares
one browser profile across an account switch, and an HTTP cache is keyed to the profile
rather than to whoever is signed in — which is why the read route caches for an hour
instead of forever. Same already-received exposure as the text, bounded in time.

**Rule: the typing indicator rides a Realtime broadcast that is not RLS-gated, so its
payload is an account id and nothing else.** Realtime authorization policies are machinery
this repo has never used, so anyone authenticated who learns a channel id could listen —
and send. What the payload's shape buys is narrower than "nothing", and the line is worth
stating exactly: the name a bubble draws is resolved from the roster, so **no
attacker-chosen text can reach the screen**, which is the exposure that would matter in a
room of children. What a crafted ping *can* do is carry a real roster member's id, and the
room is then told that person is writing when they are not — a false signal about a real
person, expiring in seconds, accepted at that size. It is a repeating ping with a short expiry rather than a
start/stop pair, so there is no "stopped writing" message to lose and a client that closes
mid-sentence heals itself. Nothing it carries touches the database. The viewer's own
writing is detected by an input-capture listener wrapped *around* this surface — these
components take no typing handler, and giving them one would be the first crack in the
transport-free contract.

**Rule: there is no rate limiting on this surface — backend or UI — by decision** *(owner,
2026-09-01)*. A hostile-but-authenticated client can spam sends, reaction toggles and
image uploads up to whatever the moderator lock and account removal catch; the lock is
the per-person control that was asked for, and it is immediate. This is a decision, not
an oversight — do not add a limiter as a drive-by hardening. If real usage ever shows
abuse the lock cannot handle, the repo's shipped shape to follow is
advisory-lock-then-count (a plain count is bypassed by parallel requests), with the
window sized so a full image burst plus its text cannot refuse itself.

**Rule: a stored picture is read through one storage policy, and that policy is the whole
boundary.** The bucket is private, an object's name is its message row's id, and the
bytes are served by the authenticated read route (`GET /api/chat/images/[id]`), which
downloads the object ON THE VIEWER'S OWN session — so membership, the family time bound
(a participant can read a channel only around its own session window; staff have none,
because after-the-fact review is the point of keeping the rows) and the hidden state are
all enforced by one predicate, re-answered on every fetch, on a path nobody has to
remember to call. **No signed URLs are minted anywhere** *(owner decision, 2026-09-01,
recorded in migration 00233)*: a signed URL is a bearer token any viewer could copy out
of devtools and share for its whole lifetime, and the read route deletes that exposure
along with the entire client-side machinery the expiring tokens demanded — the
accumulated URL map, the staleness timer, the batch-mint economy. The route's path is a
pure function of the message id, with immutable bytes behind it, so a re-render, a remount
or a reload costs nothing — but the cache is **private and one hour**, not forever: what a
browser can cache is keyed to the browser profile, which a family shares across an account
switch, so an unbounded entry would serve one principal's fetch to the next and outlive
both a hide and the family read window. The route's own header carries the full reasoning,
including why `Vary: Cookie` cannot replace the bound.

**A row lands before its bytes, and the row itself says when they have landed —
`image_stored_at`, written by the upload route the moment the storage write returns.**
Row first keeps the send guard in front of the stored bytes; the flag closes the window
that ordering opens. Its realtime UPDATE reaches every subscriber on the same stream the
row did, and the container resolves a stored picture's `src` only for a flagged row — so
by the time any client fetches, the object provably *landed* (the flag commits strictly
after it, in the same database the route reads), and "asked too early" is unreachable
rather than retried. **What the flag does not promise is that the object is still there**:
one interleaving — the mark commits, its response is lost, and the route's compensation
then sweeps the object and hides the row — leaves a flagged, hidden, objectless message.
Participants draw the ordinary tombstone and a moderator meets the broken-image box, which
is the accepted outcome recorded in the upload route's compensation comment. Until the flag lands the renderer draws the placeholder in the same
arithmetic box; when it lands, the `src` flips inside a box that never changes shape.
The flag is **monotone** — never cleared — which is what lets the history read merge it
across refetch races exactly (`cached ?? fetched`), and the container subscribes before
it takes its first history snapshot (buffering payloads that beat the snapshot) so no
flag can fall between the two. There are no timers, no re-asks and no bounded retries
anywhere on this path: a picture whose flag never comes (an upload failure whose
compensating tombstone also failed, a server that died mid-send) stays the quiet empty
box, generates zero traffic, and a moderator's remove control is its repair.

**Rule: reviewing a past session's chat is a psql session, not a screen.** Messages and
image bytes are kept indefinitely and nothing deletes them, but the app reads only the
latest 200 messages of the channel a room is currently in and never shows a past session's
log at all — so an incident reported that evening is answered through
`docs/runbooks/remote-supabase-psql.md`. That path is also why the row records who removed
a message: nothing on this surface draws it, and "who took this down" still has to be
answerable.
