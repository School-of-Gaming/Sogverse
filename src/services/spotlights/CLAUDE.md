# Spotlights

Admin-written notes, each with a picture, appended to the bottom of every session report
email a parent receives, and to the staff copy that records what the parents were sent.
A child's own copy of the report never carries them, which the template decides rather
than any caller (`src/lib/email-templates/CLAUDE.md`, "Family mail").

**A spotlight is a single copy, and `enabled` is what makes it live.** There is no working
and published split, no publish step, no start or end date and no position. Every enabled
spotlight goes into every report, **newest first by `created_at`, `id` breaking a tie** —
there is no ordering column to sort by or to add.

**It may be saved without a picture, but never enabled without one.** A CHECK on the table
holds it. **Whether it is enabled is part of the one whole save** — the create and the save
each write the switch, the picture and the version set together, so the rule is judged on
the state the save asks for and no ordering of two writes can trip it: switching off and
taking the picture away is one save, as is adding a picture and switching on. The writers
refuse an enabled spotlight with no picture with a sentence first (`check_violation`). The
editor disables the switch without a picture and unticks it when the picture is taken off,
so the refusal fires only on a state the UI cannot produce. The list only reads the switch.

**A version per site locale, both fields required.** One row per (spotlight, locale) in
`spotlight_translations`: a title and a markdown body (links allowed, no headings — the
renderer's use case decides that, not the column). The editor's save writes the whole
version set, so a language left out is removed, and a save with no version is refused —
which is what lets every reader pick theirs with `resolveTranslation()`. The service hands
versions back in `SUPPORTED_LOCALES` order for its last step.

**The picture is a `spotlight_image` entry of the shared image catalogue**
(`src/services/catalogue-images/`), in the `spotlight-images` bucket, stored at exactly
the size its purpose declares in `src/lib/images/`; a mail sizes the picture from that,
never from a measurement. **A catalogue replace repoints every spotlight on the entry and
leaves each enabled; a catalogue removal takes the picture off and switches the spotlight
off in one statement**, since an enabled spotlight cannot be without one. A removed picture
therefore drops its spotlights out of the mails until an admin picks another picture and
switches each back on in its editor.

**The session report email reads with the service role.** Both tables are admin-only to
the Data API, and the route sending a report is a gedu's, so it calls the service's
enabled-spotlights read on the service-role client it already holds; the service module
is safe on the server, unlike the client hooks beside it.

**Delete is allowed and outright**, versions with it; the picture stays in the catalogue.
