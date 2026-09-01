# Group workspace

One group of one product, as the people running it work it: the masthead, the standing
group and site notes, the reference rail with its roster, and the session feed that is
the page's spine. This directory holds that body and every piece only it renders.

**Rule: one body, two shells.** `GroupWorkspace` is rendered by the gedu's product
details page (`/gedu/clubs|camps|events/[id]`, shell in
`src/components/gedu/session-details/`) and by the admin's group details page (shell in
`src/components/admin/products/group-details/`), and by the preview scene that renders it
over fixtures. None of the three is an adaptation of it. An admin's claim on that page is
precisely that they see what the gedu teaching the group sees, so an admin-shaped variant
of any part of this body would be the drift the shared body exists to prevent. A feature
added here is a feature on every surface the moment it ships.

**What a shell owns is where the data comes from, and nothing else.** The body takes
everything as props — no query, no clock of its own beyond the shared providers. The
shells differ in which documents they read (an assignment plus a group feed on the gedu
side; an admin session record plus the same group feed on the admin side), which
mutations they bind, and what their chrome is. Where a shell genuinely needs the body to
differ, the difference enters as a prop with a documented default rather than as a branch
on who is looking — the back link, the voice rooms' way back, the roster rail's heading
and the site's `editHref` are the four that exist, and every one of them defaults to the
gedu answer because that shell is the one with no other. All four are the same kind of
thing: a statement about who brought you here, which is exactly what a shared body cannot
know. Note what none of them is — a *capability*. The body renders the same fields with
the same ones writable on both shells; where the shells differ is only in where they can
send you.

**Rule: nothing in here is named for a role.** The directory is the shared half, so a
`Gedu*` or `Admin*` name in it is a claim the code does not make. Role-specific shells
keep their role names and stay in their own trees. What does *not* move is domain
vocabulary that happens to name a role — a group's gedus are gedus on both surfaces, and
renaming the helper that chips them would obscure what it builds.

**Message keys stay where they are.** The body reads `gedu.sessionDetails.*`, and moving
the copy to a shared namespace would buy nothing and cost a rename on every locale — the
same reasoning `src/components/session-feed/CLAUDE.md` states for the reused gedu
components' own strings. There is one renderer and one copy of each string.

**This is staff-only code, and the family-privacy import zone names it.** The body draws
the staff note, the roster and the completeness ladder, so `components/group-workspace/`
sits beside `components/gedu/` in the `no-restricted-imports` zone that bars family,
parent and gamer surfaces from importing either. Role-agnostic here means agnostic
between *staff* roles; a piece moved out of the gedu tree into this one has not left the
ban, and the ESLint config says so.

## What lives here

- **`GroupWorkspace.tsx`** — the body, and the props every shell fills.

  **Rule: the body owns the one per-member dialog, because more than one thing
  opens it.** Every roster row's button opens it, and so does every name in the
  final session's creations block down in the feed. A page can only ever have
  one open, so what the body holds is *which member* — an id, never a copy of
  their values — and both callers ask it to change. Holding that state in either
  of the two surfaces would mean two dialogs with two drafts for one question,
  and the two would be free to disagree about what is stored.
- **`ParticipantRosterRow.tsx`** — one seat on the rail's roster: identity, age, contact,
  game account editor, and the per-member flair (newcomer badge, and the button that opens
  that member's dialog).

  **Rule: the button at the end of the row has three tones and no siblings.** Dimmed is
  "nothing recorded", lit is "a note, a creation, or both", and the warning tone is "this
  group's final session is still owed a creation from this member" — which also renames
  the control, so the reason reaches a screen reader as words rather than as a colour.
  Every creations signal routes into the one dialog, so a *second* mark beside the button
  would be either a second way in or something a reader cannot act on; and a tone costs no
  layout, where a new element in the row's right-packed trailing group would have to be
  ordered against what is already there.
- **`GroupNotesPanel.tsx` / `SitePanel.tsx` / `TwoAudienceNotesPanel.tsx`** — the standing
  notes, and the site. Both named panels are built on the same two-audience editor with
  different copy and a different owner (the group; the site); the site's puts two more
  fields behind the same Save.

  **`SitePanel` is the one component rendering a site anywhere staff meet one** — its
  name, its address, the note families read and the note only staff do, laid out
  identically on every surface. It has two consumers outside this workspace, and that is
  the point of it rather than a leak: the admin site page (`/admin/sites/[id]`), which
  *is* the site record, and the admin product add/edit form's site field, which mounts it
  under the chosen-place card as soon as that field holds a resolved `site` row. A site
  belongs to the *building*, not to any product running in it, so the gedu prepping a
  session there and the admin editing the record are looking at one set of fields — and a
  second editor with its own copy and its own layout would be a second way to say the same
  thing, free to drift the moment either changed. It replaced exactly that: an address
  that was editable in one card on the site page and printed again a card below, edited
  through a different affordance on each surface, plus the product form's own pair of note
  fields, which committed out of band inside a form nothing else committed until its foot.

  **Edit access is which saves the caller supplies, never a role flag — three
  capabilities, widest last.**

  1. **Neither save: a pure view.** No pencil, no editor, no ghosts. The one consumer is
     the product form's site field.
  2. **`onSaveNotes`: the two notes.** The gedu shell, the admin group shell and the
     preview scene. This is the whole of what a group surface may write.
  3. **Both saves: the record too.** The name and the address join the same editor behind
     the same one Save. **Exactly one supplier: the admin site page.**

  **Where the record may be edited is a scope rule, not a permission one.** An admin may
  rename any site; what they may not do is rename one from a page scoped to something
  else. On a product page or a group page, "Edit → rename → Save" reads as a change to
  *this* product and lands on every product in the building — a camp, an after-school club
  and a birthday party at the same library share the row. So the record is edited where its
  scope is legible from the URL down, and nowhere else. Both of those pages briefly
  supplied `onSaveDetails` and no longer do.

  **`editHref` is the way through, and it is a link rather than a capability.** An admin
  surface showing a site it does not own passes the route to `/admin/sites/[id]`; the panel
  renders it as a quiet link in the header row, left of the pencil. Absent is the default
  because it is the gedu answer — there is no admin site page to send a gedu to — which is
  the same rule the back link, the way back and the roster heading follow. It is also what
  keeps **"an admin sees what the gedu sees" literally true of the site section**: both
  shells now pass the notes save and neither passes a details save, so the two render the
  same fields with the same two writable, and differ only in whether there is somewhere to
  go. It preserves the create-then-fill flow at one navigation — name the new building in
  the picker's create dialog, follow the link, write the door code down on the page that
  says whose door it is.

  **The empty address is a ghost line, and it belongs to capability 3 alone.** A site with
  no address renders an italic-muted invitation to write one, in the imperative, in the
  slot the address itself occupies — the grammar the two note ghosts already use, for the
  reason the notes' own record gives: structure that is invisible until the editor is open
  is a feature nobody discovers. A viewer who cannot write it gets *nothing* there instead.
  The same reasoning runs one level down and is why a **read-only panel renders no ghosts
  at all**, the two notes' included: a ghost is an imperative, and both of its jobs — teach
  that the split exists, offer somewhere to write — need an editor behind them.

  **A consumer that mounts it inside a `<form>` used to owe it one thing** — Enter in a
  text input is a browser's implicit submit of whichever form the input sits in — and no
  longer does, because the one such consumer is the read-only one and has no text input.
  Every other control here is a `type="button"` or a link and reaches its own route
  directly. Re-establishing an editable panel inside a form would bring the debt back with
  it.

  This does not widen the directory's claim — the panel is still the group workspace's
  component, still staff-only, and still inside the family-privacy import zone; it simply
  has a second staff surface rendering the same site.
- **`session-entry-saves.ts`** — what a session card's writes *do* between what is on
  screen and the mutations behind them: the Save's diff and ordering, the Send's failure
  classification, and the photo attach and remove. All of them take the mutations as
  arguments so both shells run one copy. The photo pair is the thinnest of the five and is
  here anyway, because turning an entry id back into the (group, date) pair Postgres keys a
  session by is the same arithmetic every other write on this page makes. **Both are called
  by the card's Save, never by the picker** — a photo is held in the browser with the rest
  of the draft — and the *sequencing* of the three writes is the feed's rather than this
  module's, because dropping each photo operation from the staged set as it lands is what
  makes a retry after a half-landed save do only what is left.
- **`site-details-save.ts`** — the same split for the site panel's details save: which of
  the two routes each field travels on, and what a half-failed save leaves behind, taking
  both mutations as arguments. It has one caller now (the admin site page) and had three;
  it stays a module because what it holds is the record's save rules, and where they may
  be invoked from has already moved once.
- **`game-username-save.ts`** — the same split for the roster's username editor: the
  platform dispatch and the checking/verified/unverified machine, taking both platforms'
  mutations and the shell's status setter as arguments.
- **`derive-roster-flair.ts`** — the group feed's roster rows turned into the four sparse
  maps the flair prop carries. Holds the clubs-only badge gate and the absence-is-none
  convention, both of which fail silently, and neither of which needs a React tree to
  test. The creations map extends the convention rather than bending it: the RPC emits
  `[]` where a note is null, so an empty list is left *out* on length — which makes the
  map's key set "who has a creation", exactly what the owed derivation reads.

  **The obligation itself is derived in the body, not in either shell.** Whether this
  run's final session is owed creations comes from the product's flag, the schedule's last
  occurrence on or before the end date, and that map — all of which the shared body
  already holds. A copy in each shell would be a second place for a gedu and an admin to
  disagree about whether the last session of a term is finished. The same value feeds
  three things — the session feed's completeness, the block on the final session's own
  card, and the roster's per-row marker — so a row can never be marked while the card
  beside it reads finished, and whenever the card's block is warning-toned the rail
  marks the same people. Only that direction holds: before the run's final session
  ends nothing is owed yet, so the block states the obligation informationally — every
  member chipped, nobody marked on the rail — and a card naming somebody the rail
  leaves unmarked is that state rather than a disagreement.
- **`types.ts` / `roster-helpers.tsx`** — the roster row alias and the two questions every
  roster consumer has to answer identically (which address, which game account).
- **`BackLink.tsx`** — the workspace's default back link, which is the gedu shell's.
- **`mock-workspace-fixtures.ts`** — the preview scene's fixtures. Scenario slugs are
  runtime values in the preview registry; the identifiers around them are not.
