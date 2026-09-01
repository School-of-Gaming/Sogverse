# Session feeds — the shared machinery

The role-agnostic core of the session timeline that two *renderers* draw: the gedu
workspace feed (`src/components/gedu/session-feed/`) and the family club-page feed
(`src/components/family/product-page/`). This module owns everything both feeds must do
identically; the gedu module keeps everything that makes its feed a *workspace*.

Three audiences, two renderers — because the **admin** surface is not a third one. See
the admin rule below.

## The dividing line

- **Shared (here):** the feed shell (one keyed list: entries, month dividers, the
  now-divider, rail markers), the feed-shaping helpers (partition, past window, newest
  past), month labels and session labels, the scroll-anchor machinery, the report
  renderer and its clamp arithmetic, the now-divider, the attendance tone tokens, and the
  `AttendanceMark` type.
- **Gedu-only (stays in `gedu/session-feed/`):** the editors, the completeness ladder and
  owed/attention derivation, attendance rosters and summaries, the staff-note block, the
  alert badge, partial-save handling, and the workspace's mock fixtures.

**Rule: both feeds classify an entry on the session's `endsAt`, and both compute the live
tag as the same conjunction** — `kind === "future" && startsAt <= now < endsAt`, with the
same exclusive end boundary, so the kind flips on the exact tick the tag stops being live
and no dead zone opens between them. A session in progress is `future` on both feeds: it
is the *current* session, not history. The builders stay separate — they emit different
shapes, and that is where the privacy line is drawn — but they must never disagree about
which side of the present a session is on. They are one timeline read by two audiences.

The staff feed used to split on the session's *start*, because its kind was standing in
for "may I take the register yet": making the running session `past` was how it reached
the record editor. That conflation is gone. Editability is asked directly now, against the
session's start, and the live entry carries the record editor exactly as a past entry
does. A daily 8:00–23:00 camp is what made the old behaviour untenable — it spent fifteen
hours calling the session in progress history and naming tomorrow as next.

**Rule: a feed takes its `now` as a prop from whoever owns its entries — it must not call
`useNow()` inside itself.** Entry kind, the live tag and editor selection are all derived
from the clock, so the entries and every derivation over them have to answer off *one*
instant. Every surface that opens a session editor — the gedu workspace, and the admin
product page that reuses it — **freezes** that instant while one is open, precisely so
nothing can be reclassified under somebody typing into it; a feed component
reading the ticking provider itself would step straight around that freeze. The entries
would stay frozen while liveness advanced, and at the session's `endsAt` the mounted
record editor would be swapped for the notes-only one — destroying an unsaved register
mid-roll-call, with no error and nothing to retry. So the rule is structural: the clock
enters the feed as a required prop, and a surface with nothing to freeze simply passes
its own `useNow()`. A page may legitimately run **two** clocks — the gedu workspace's
voice window keeps reading the live one, because a Join button frozen mid-edit would lie
about whether a room is open — and the split is which of them may be stopped.

**Corollary: the predicates deciding which editor an entry opens are the component's own
rule, not a parallel one.** They live beside the gedu feed, take the same `now`, and are
built from one expression and its negation so they are total and disjoint by
construction. A component deriving its own inline version is how the two drift apart —
which they had, silently, because the drift is only observable on the incoherent
entries-and-clock pair the freeze bug produced.

**Rule: family surfaces never import gedu code — enforced, not promised.** One
`no-restricted-imports` zone in the ESLint config covers the whole family *path*, not
only its components: `components/family/`, `components/parent/`, `components/gamer/`, the
lib module that builds the family feed, and the family feed service. It bans two things —
the gedu component tree, and the gedu **session service entire**, which is in practice
the likelier leak, since that service exports the staff document shapes and a family
module importing one would compile, parse and render it. The one exception is the
attendance vocabulary, permitted by name through an allow-list. The point is structural
privacy: the staff note, the roster and the completeness states must be unreachable from
anything a family renders, and the family entry types additionally have no field such
data could arrive in. Widening this module is how a new shared need gets met — never by a
family module reaching into the gedu tree.

**Rule: the admin session surface renders the gedu components themselves — the same
feed, the same editors, the same notes panels — never an admin-styled copy of them, and
the same goes for what those editors' Save and Send buttons *do*.** An admin sees the
gedu presentation with a group selector in front of it, and that is the whole of the
difference. A parallel admin renderer would be a second skin over the same rows whose
only job is to look like the first, and it rots the day somebody changes what a card
says: one of the two surfaces goes on saying the old thing, silently, and nobody finds
out until an admin and a gedu disagree about the same session. So the admin path adds no
component to this module and none to the gedu one — it composes what is there, and a
gedu feature is an admin feature the moment it ships.

**The composition runs one layer deeper than the components: the save orchestration is
shared too.** What a session editor's Save does between the draft it is handed and the
writes it makes — which marks count as changed, that the two written fields go before any
mark, that the marks settle rather than race to the first refusal, and which mixtures of
outcome count as a partial save rather than a failed one — is a rule about the integrity
of the record, not about who is looking at it. The two surfaces differ only in which
mutations they bind (one keyed by group and refreshing the gedu feed, one keyed by product
and refreshing the product document), so the orchestration takes those mutations as
arguments and lives once, in the group workspace module, with both containers calling
it. A copy on the admin side would be free to drift, and the drift would be invisible until
an admin and a gedu saving the same sheet got different answers out of it.

The admin *tree* is deliberately **outside** the family-privacy import zone above, which
is what makes reaching into `components/gedu/` and `components/group-workspace/` from
admin code allowed rather than a hole: the zone exists to keep staff-only data away from
families, and an admin is staff. The zone names both directories for the same reason —
the group workspace is role-agnostic between *staff* roles only, so moving a piece out of
`components/gedu/` into it is not a way out of the ban.

**Corollary: the gedu components' own strings travel with them.** A string rendered by a
reused gedu component stays in the namespace that component reads, because there is one
component and one copy of the string — moving it to a shared namespace would buy nothing
and cost a rename. That is not in tension with the namespace rule below, which is about
two *different* renderers of one string.

**Rule: a string both feeds render lives in a shared namespace, never under a role's.**
`sessionFeed`, `sessionBadge`, `productType`, `activityCard` exist for this. A shared
string under `gedu.*` means a copy edit for the workspace silently rewrites what a parent
reads — that bug shipped once; the namespaces are the fix. New strings a *surface* owns
(a panel heading, a selector's accessible name) belong to that surface's namespace
instead — an admin panel's chrome is not a shared string just because it sits above a
shared feed.

## What a session owes

**Rule: an owed session owes three things, and the third is that its report
reached the families.** Every current roster member marked, a report written,
and that report emailed to the group's parents. Any one of them missing leaves
the session outstanding on the staff feed and in the dashboard count behind it;
all three present is the finished state. The third exists because a write-up
nobody was told about is a write-up nobody reads — the report is the main thing
a family gets back between payments, and a family that never learns it is there
gets nothing.

**Rule: exactly one session of a run can owe a fourth thing, and it is the last
one.** On a product flagged as requiring a creation from every member, the run's
**final session** — the last occurrence the schedule projects on or before the
end date — is not finished until every current roster member has at least one.
The framing is what makes it fit: creations are that session's work, so they
ride the owed pattern the other three already have rather than inventing a
second one, and the badge's unit is unchanged — the final session simply has one
more way to need attention, never a second entry in the count. An open-ended
product has no final session and therefore never owes; that is documented
behaviour, not an error. What the session pattern *cannot* say is which members
are missing, because that is per-member data: the roster answers it, on the same
page, routing to the same dialog.

**Rule: the send is asked of *owed* sessions only, and the other two are asked
of every past one.** What is owed is dated from the recording epoch, and the
finished state has no epoch floor of its own — a session from before the epoch
that somebody goes back and completes still earns its mark. So asking every past
session for a send would have taken that mark off a year of history and offered
it back only in exchange for mailing months-old write-ups to families. The
server-side count already floors at the epoch, so it needs no equivalent guard
and the two still agree.

**Rule: there is no exemption for a group nobody can be mailed.** Such a group
is sent to anyway — the mail goes to nobody, the session is recorded as sent,
and staff are told through the copy that lands in their inbox. An exemption
would leave the session outstanding for ever with nothing anybody could do about
it, and would force the server-side count to grow its own notion of who is
mailable in order to keep agreeing with the client.

**Rule: whether a report has been sent is read from the instant stored on the
session row, never from the send that produced it.** That is what makes the
sent state survive a reload, a second tab and a second assigned gedu. Counts
from a single send — how many mails went out, how many the provider refused —
are the opposite kind of fact: they are a receipt for the send just made, not
part of the record. A receipt has to survive long enough to be read, so it is
held in the sending surface's own state for as long as the educator stays on the
page — through the refetch that flips the affordance into its sent state, which
is the very moment they would otherwise vanish — and it is gone on a reload or a
navigation, because nothing stores it. What says the report was sent is the
record; the counts beside it never pretend to be.

**Rule: the send affordance is one control in three states, not a control
replaced by a message.** Offer, in flight, and sent are the same button in the
same slot — so its own height is the slot, nothing under it moves when a send
lands, and no space has to be held open for a second element that could never
share the row with it. The sent state is that button disabled, carrying the time
the mail went and dropping to a lighter weight, because a finished action is a
record rather than an invitation and must not go on drawing the eye of somebody
scanning for the next thing to do.

**Rule: the send is not confirmed, and its outcomes are quiet.** The server
claims the session before it mails anybody, so at most one send exists however
many times the button is pressed, from however many tabs — the guarantee is the
route's and never the interface's. That leaves a dialog with nothing to add but
a headcount nobody was deciding anything with, so pressing the button *is* the
gesture. The same reasoning governs what is said afterwards: a send that lands
says nothing beyond the button's own change of state, and being refused because
the report has already gone says nothing at all, since the sent state that
follows is both the news and the truth. Only a refusal that leaves the session
genuinely unsent — nothing delivered, or no report left to deliver — hands the
button back with one short line under it, cleared the moment the next attempt
starts.

**Rule: this derivation exists twice — in TypeScript for the card and in SQL for
the dashboard badge — and a change to one is a change to both, in the same
commit.** They answer the same question for two surfaces, and a badge counting a
session the card calls finished is worse than either being wrong alone. The two
places already share the whitespace-trimmed test for "has a report"; they also
share the emailed test and its epoch gate, and now the creations condition —
which means they share a **third** derivation as well, the one that says which
occurrence is a run's last. Both walk the seven days ending at the end date,
floored at the start date, and take the greatest whose weekday a slot names;
seven is enough because slots are weekly. The creations condition sits inside
the epoch-floored half on both sides, exactly as the emailed test does, so a
pre-epoch final session keeps its check rather than losing it to a term that
finished before the platform asked.

## The attribution chip

**Rule: a card carrying a write-up is signed, in its bottom-right corner, on both feeds.**
The chip is one shared component in this module rather than a copy per surface: a report is
attributed the same way wherever it is read, and a chip that sat somewhere else — or said
something else — on the staff side would be inventing a distinction neither surface has. It
renders only where there is both a write-up (the shared trimmed test, so a report of one
newline signs nothing) and somebody to name. The corner is chosen for what it is far from:
both cards spend their header's right-hand side on a status, so the top corner would stack
against whichever status is up, and the bottom one is empty on every card in both feeds. Its
label comes from the shared `sessionFeed` namespace, and the positioned wrapper carries that
label as the accessible name for the whole chip — a bare first name read out on its own says
nothing about why it is there.

**Rule: the relative wrapper around a card is unconditional, on both feeds.** It is there to
give the absolutely-positioned chip a positioning context of *exactly one card* — without it
the offsets resolve against whatever ancestor happens to be positioned, the list or the page.
(It is not about clipping: the card primitive sets no overflow, so a chip rendered inside one
would not be cut in half either.) What makes it unconditional is a different concern
entirely: **the card's subtree identity has to survive every state flip**, and a wrapper that
came and went with the chip meant an entry toggling its editor was returning a structurally
different tree. React discarded the whole card mid-flush, which took the Edit button the feed
refocuses on close and the report's expanded Read-more state with it. So the wrapper is
present on every carded entry and only the chip inside it is conditional. The quiet dashed
rows are not cards and keep their own shape.

**Rule: a signed card reserves bottom padding for the chip, computed from the chip's own
geometry.** The chip stands 30px tall plus its ring and hangs 10px below the card's border
box, so ~22px of it rises *above* that border — past the card's ordinary 16/20px padding and
across whatever the last block of content is (the staff-note box's border on the gedu feed, a
report line's descenders on a narrow viewport). The reservation is decided at render from
data the card already has, so it is stable and shifts nothing; it is the same on both feeds
and at both breakpoints, because the chip's size does not change with the viewport. Move the
chip's height or its offset and the padding is re-derived in the same change.

**Rule: the chip names the session's LAST EDITOR, not the report's author, and that
imprecision is a settled product decision.** The stored row's audit column is stamped by
every recorded touch — materializing the row, saving either written field, and each
attendance mark or unmark — so a gedu who only corrected a tick is named beside a write-up
somebody else typed. In practice the gedu who touches one part of a session touches all of
it, and a per-field author column was judged not worth the schema for that edge. **Do not
close the gap by adding a report-author column**; that is a new product decision, not a
refactor, and the field is named *last edited by* rather than *author* precisely so the
claim on screen stays true. Both halves of the pair — the id that seeds the identicon and
the first name — are required before anybody is named; either half missing is nobody.

**Rule: the staff feed hides the chip while that entry's editor is open.** Cancel and Save
sit in the bottom-right corner of the expanded card, exactly where the chip hangs, and a
chip floating over an unsaved draft would be claiming authorship of text that is not stored
yet. It returns when the editor closes, over whatever was actually saved. Folding a saved
draft into an entry locally carries the existing editor through rather than rewriting it,
for the same reason: the stamp belongs to the database, and the authoritative answer arrives
with the refetched row.

## Session photos

**Rule: the gallery and its viewer live here because a family surface cannot import a
gedu one.** Photos are *content*, like the report beside them, so both feeds draw the
same row in a card's read state whether an editor is open or not. The staff-only half —
adding and removing — is a separate block that stays on the gedu side; only the read
half is shared.

**Rule: every editor a staff card can open carries the block, on both sides of the
present.** A past session, the one running now, a pre-epoch row and a session still ahead
all take the same block in the same slot. It was withheld from the future session's plan
editor on the reasoning that photos document what happened; that is overruled *(owner)* —
a gedu who may write notes about next Monday has no reason to be refused a picture of it,
and a rule that let one half of a card's draft cross the present but not the other half
was a distinction the model does not have. What still separates the two editors is the
register, which a session that has not started cannot take.

**Rule: the staff block is draft scope, exactly like the register and the two written
fields.** A picked file is prepared in the browser and *held*; the ✕ on a stored photo
crosses it out without deleting anything; one Save commits the whole card and Cancel
throws the whole card away. Photos used to attach the instant they were picked, which made
them the one thing on an open editor that was already stored and cost a whole idiom to say
so; the edit is one edit now, and the block greys with everything else while it commits.
What still happens at pick time is any refusal the *browser* can make — a file the decoder
will not open — because learning at Save that one of five files was never usable is the
worst possible moment to be told. What waits for Save is the network, not the verdict on
the bytes.

**Corollary: a crossed-out photo leaves the strip rather than greying inside it.** That is
what deleting a paragraph of the write-up looks like, and the two are held to one grammar:
nothing is stored yet, so nothing needs an undo of its own — Cancel is the undo, for the
whole card at once. A per-tile restore control would be a second, photo-only notion of
"unsaved change" inside an editor that already has one.

**Rule: the staged photos belong to whatever awaits the save, not to the block that edits
them.** A save can half-land — a deletion goes through and an upload is refused — and the
only honest thing to leave behind is exactly what still needs doing, so each operation
drops out of the staged set the moment it lands and a second press of Save retries the
remainder and nothing twice. That state therefore lives with the component that runs and
awaits the save, and the block is controlled by it; a block holding its own copy would
have no way to learn which half of a save survived.

**Rule: the save's photo operations are ordered deletions, then uploads, then the written
record.** Deletions first because swapping a photo at the cap is remove-one-add-one and
the insert counts stored rows under a lock, so an upload sent before the deletion it is
making room for is refused for a report the gedu has already made room in. Photos before
the write-up so the last thing the sequence does is the notes-and-marks save whose own
partial-failure classification the editor's two error lines are about — a photo refusal in
the middle of it would leave the card choosing which of two unrelated failures to report.

**Rule: the staff block takes files two ways and treats them as one.** Its whole recessed
area is a drop target as well as a picker — gedu surfaces are desktop-default, and a
screenshot is one drag from the folder it landed in — but a dropped file joins the very
same pipeline: one accept list, one trim to the remaining slots, one normalize-and-stage
pass, one refusal line. The drop path owns only the two answers a file dialog gives by
construction, because a drop has neither: the accept list has to be applied by hand, and a
drop at the cap has to say so in words where the picker simply has no button. A drag over
the block is always accepted at the event level even when the drop will be refused — an
unhandled drop makes the browser navigate the tab to the file and takes an open editor
with it.

**Rule: the cap counts what the report *would* hold** — stored, minus what is crossed out,
plus what is staged. It is the number on the strip, which is the only one the affordances
may be derived from, and it is what lets a photo be swapped at the cap without the gedu
ever meeting a refusal.

**Rule: a refusal during the save keeps the editor open with the draft intact, and says
what was refused in the photo block's own vocabulary.** A deletion the route would not make
leaves its photo crossed out rather than restoring the tile — the strip draws the edit as
the gedu has left it, and one line under it says why that edit has not landed, which is the
same promise a refused write-up save makes about the text still on screen. Restoring the
tile would throw away an intention the gedu still holds; a general "nothing saved" line
would be the wrong words for something only a file-level refusal can explain.

**Rule: the photo type this module renders is declared here, structurally, and is not
imported from either feed's contracts.** The two documents each carry their own image
summary with the same three fields (id, width, height), and the ESLint privacy zone
forbids a family module from reaching for the gedu one — so a locally-declared shape both
arrays satisfy is what lets one component serve both without an adapter or a hole in the
zone.

**Rule: every box is arithmetic from the stored dimensions, and nothing measures a
decoded image.** That is what makes the server's HTML and the browser's first paint agree,
and it is the only reason a card holding five photos does not reshuffle itself as the
JPEGs land one after another — the same discipline the report clamp above follows, for the
same reason. The id is also the only address a renderer needs: the object name is derived
from it by the shared session-image URL helper, whose leading-slash passthrough is what
lets fixture art travel in that same field, so the gallery carries no preview-only prop.

**Rule: thumbnails share a height, keep their own widths, sit centred in the row, and
wrap.** Photos arrive as mixed ratios — mostly 16:9 screenshots, with the odd square or
portrait — and cropping them to a common box would cut a build in half to make a grid
tidy. A shared *height* gives the row a baseline and a cap while wrapping absorbs whatever
width is left, which is what makes one layout work at the 360px floor and on a desktop
card. Centring is what the wrap costs nothing to buy: a run of natural widths almost never
fills its last line, and a left-packed remainder reads as a row that failed to finish
rather than as a set — the wrap points and every box are unchanged, only the slack moves.
Because a box's ratio comes from data the database only sanity-bounds, the derived width
is clamped and pictures are drawn contained: a degenerate stored pair letterboxes rather
than stretching the row off the page.

**Rule: the fullscreen overlay is one shared component (`components/ui`), and what stays
here is the *collection*.** Opening, paging with wrap-around, the counter, closing and
where focus lands are one set of expectations wherever a picture is opened to be looked
at, and the chat log has exactly the same ones — so there is one overlay and it takes a
list of `{ src, width, height }` plus a position. What differs between the two surfaces is
what a set *is* and where its pictures live, and that is what the thin viewer in this
module still owns: a session photo is addressed by its **id** through the shared
session-image URL helper, and the words are the feed's own (photos, not images), handed to
the overlay as labels rather than pulled from a namespace of its own. Chat needs no
equivalent adapter because its images already carry a servable `src`. The gallery, the
strip and everything about what belongs in one set are untouched by that split.

**Rule: the viewer is built on the shared dialog primitive, at a near-fullscreen size the
primitive itself expresses.** The primitive already owns the portal, the backdrop, the
z-layer and an Escape answered by exactly one dialog when several are stacked; a lightbox
of its own would be a second answer to all four, free to disagree. A photo opened in order
to be *looked at* wants the screen — dark ground, the picture contained in nearly the whole
viewport — and that is a width-and-height cap, so it is a size on the dialog rather than a
fork of it. Anything else wanting the same treatment takes that size, and never a second
overlay.

**Rule: the viewer holds the whole set and pages through it, wrapping at both ends.**
Somebody who opened a photo is looking at the report's photos, not at one file, so closing
the overlay to reach the next thumbnail costs a gesture and puts the reader back on a page
they deliberately left. Paging is two side arrows plus the left/right arrow keys, and it
wraps because a short ring keeps both controls able to act at every position — the same
reasoning that removes them outright for a set of one, where an arrow could never do
anything at all.

**Corollary: everything in the overlay closes it except the controls, which stop the
click.** The backdrop, the margins beside a portrait photo and the picture itself all
close, because touch has neither hover nor an Escape key and the forgiving gesture has to
be the ordinary one. The arrows and the close button stop propagation, so pressing next is
never also a request to leave.

**Rule: which photo is open belongs to the gallery, not to the page around it — and it is
held as a position in the list the gallery drew.** The answer is per-gallery and no surface
has a use for it, so a feed never threads viewer state through itself; the viewer is
handed that list and that position and is otherwise controlled, so there is no second copy
of the set to fall out of step. A position is what "the next one" can be said against,
which is what paging needs; the viewer reads through it defensively because a list can
shorten underneath it, and an empty list takes the gallery and its overlay off the page
outright. Focus returns to the thumbnail that was *pressed*, never to whichever one the
overlay ended on — the reader's place on the page never moved — and the overlay cannot do
that itself, because it does not know which thumbnail that was.

## Contracts the shell holds (and why they are load-bearing)

- **One keyed list, one boundary.** Future entries, month labels, the now-divider and the
  past render as a single keyed run. The divider's key is constant so its DOM node
  survives the future-toggle — the scroll correction measures against that node, and a
  remounted divider would take the measurement's anchor out from under it.
- **The future reveals upward with the viewport pinned, instantly.** The anchor is
  captured synchronously in the click handler, the scroll corrected in a layout effect
  before paint. Nothing animates that geometry: a correction chasing a transition re-runs
  every frame and is how the pattern breaks.
- **The past reveals downward by scrolling, over fully-loaded data.** An
  IntersectionObserver sentinel below the list reveals the next already-loaded chunk and
  re-arms after each reveal; it unmounts when nothing remains. Reveals are instant — no
  spinner, no skeleton — because the data is already in memory: feeds arrive as one
  document (a weekly club is ~52 sessions/year; paged fetching was rejected because the
  client projects past occurrences from the schedule, and a partial fetch makes stored
  reports silently render as "no write-up").
- **The report clamp is arithmetic, never measured**, so server and first client paint
  agree; the tolerance is documented beside the constants. In practice only the gedu feed
  clamps — the family feed renders every report in full, because reports are that page's
  content and the clamp exists for a work queue. Whether a report *exists* is a trimmed
  test on both sides of the stack: the dashboard's SQL twin uses `btrim` with an explicit
  whitespace list so a report of one newline is "no report" to badge and feed alike.
- **Attendance tones are tokens, not glyphs.** Present is a small success-toned positive,
  absent is muted neutral (never destructive — the data cannot yet distinguish a planned
  absence from a no-show). Each surface picks its own glyphs: the gedu's three-state set
  spends the dash on "unmarked", the family's two-state set uses it for "absent". When a
  `planned_absent` enum value lands, the tone decision extends here, once.
