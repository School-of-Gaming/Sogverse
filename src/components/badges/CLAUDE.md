# Badges

Badges are things a person is proud to have earned, in the spirit of scout merit badges.
Admins award them to gedus today (`src/services/gedu/`); gedus will award them to gamers
later. **That overlap with the gamer Achievement Badges vocabulary is intentional**: a
badge is one idea across the platform, not two features that happen to share a word.

**`BadgeArt` is the single place a badge's art lives.** Every surface draws a badge
through it, so real art replaces the temporary medals inside it and no caller changes. It
is not `Badge`: that name is the status pill in `ui/`. Its colours are artwork, exempt
from the colour bans by name in `eslint.config.mjs`.

**An unearned badge is greyed and static** — the same shape as the earned one, never
animated, never asking for attention.

**Adding a badge is three things**: the enum value (by migration), its art in
`BadgeArt`, and its copy in every locale (`badges` for the name, plus each surface's own
line). The art is keyed by the enum, so type-check fails until it exists; the copy keys
are composed from the badge, so it fails there too.
