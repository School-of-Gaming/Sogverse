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
on who is looking — the back link, the voice rooms' way back and the roster rail's heading
are the three that exist, and every one of them defaults to the gedu answer because that
shell is the one with no other. All three are the same kind of thing: a statement about
who brought you here, which is exactly what a shared body cannot know.

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
- **`ParticipantRosterRow.tsx`** — one seat on the rail's roster: identity, age, contact,
  game account editor, and the staff flair (newcomer badge, note button).
- **`GroupNotesPanel.tsx` / `SiteNotesPanel.tsx` / `TwoAudienceNotesPanel.tsx`** — the
  standing notes. The two named panels are the same two-audience editor with different
  copy and a different owner (the group; the venue).
- **`session-entry-saves.ts`** — what a session editor's Save and Send *do* between the
  draft and the writes, taking the mutations as arguments so both shells run one copy.
- **`game-username-save.ts`** — the same split for the roster's username editor: the
  platform dispatch and the checking/verified/unverified machine, taking both platforms'
  mutations and the shell's status setter as arguments.
- **`derive-roster-flair.ts`** — the group feed's roster rows turned into the three sparse
  maps the flair prop carries. Holds the clubs-only badge gate and the absence-is-none
  convention, both of which fail silently, and neither of which needs a React tree to
  test.
- **`types.ts` / `roster-helpers.tsx`** — the roster row alias and the two questions every
  roster consumer has to answer identically (which address, which game account).
- **`BackLink.tsx`** — the workspace's default back link, which is the gedu shell's.
- **`mock-workspace-fixtures.ts`** — the preview scene's fixtures. Scenario slugs are
  runtime values in the preview registry; the identifiers around them are not.
