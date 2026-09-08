# The brand-first shift: "School of Gaming" ahead of "Sogverse"

**Status: complete and frozen. Landed August 2026; recorded 2026-09-08.**

The rules this shift produced are living, and they live in `src/CLAUDE.md` under "Brand vs.
Platform". This record is only the story of the sweep that made them true, kept because two
of its cuts look like omissions to anyone who did not watch them happen.

## What changed

"School of Gaming" is the brand and "Sogverse" is the platform. Before the sweep the
codebase reached for whichever of the two names the author had in mind, so a stranger could
meet the platform word with nothing to attach it to — in a browser tab, an inbox row, the
opening line of the public About page. The shift made outward-facing copy lead with the
brand and left the platform name where a reader has already been introduced to it.

Four parts were finished, and each was a sweep rather than a rule:

- **The lockups.** Every string carrying both names was reordered to lead with the brand,
  in the fixed form `School of Gaming – Sogverse` with a spaced en dash. The codebase had
  previously accumulated three different dashes in one lockup, because the separator was
  left to whoever typed the string.
- **The cold uses in `messages/`.** Everything a stranger could meet with the platform word
  un-introduced was changed to the brand: the public About page's opening line, the
  contact-card copy under the `helpSection` namespace (the public help page it was written
  for is gone; the wording survives verbatim on the dashboards' contact card), the public
  Gedu registration title, and the transactional-email copyright footer, which names the
  company that holds the copyright and so matches the site footer exactly.
- **Every document title and `og:site_name`.** The sub-page template became
  `"%s | School of Gaming"`, and the site name on a shared link is the brand on every page,
  signed in or not. A tab title is read while scanning a row of tabs, and what a parent is
  scanning for is the name they were given by a school or another parent — a recognition
  context even when the page behind the tab is their own dashboard. The root title kept the
  lockup, because it is the one title with room for both.
- **The account possessive moved to the brand.** The verification mail, the password- and
  PIN-reset mails and the auth pages' descriptions were all reworded to "your School of
  Gaming account" / "password" / "parent PIN", in all five locales. The sweep is complete.

## Three things that look like omissions

**The product pages' hand-built absolute title was retired.** Product pages used to set an
absolute `… | School of Gaming` title of their own. That existed only to step around a
sub-page template that said something else; once the template said the same words, the
absolute title was dead weight. A product page now passes a plain name and inherits the
template. **Do not re-add it** — a page that opts out of the template is a page that will
drift away from it.

**The login card's sub-line was deleted.** The card welcomes you on behalf of the brand
("Welcome to School of Gaming") and puts the form directly under it. It used to carry
"Sign in to your account" beneath that title; the key is gone, because a heading over an
email field, a password field and a Sign in button does not need a second line restating
what the form plainly is. **Do not re-add it** — its absence is the decision, not a gap.

**And `tlh` keeps its Klingon calque of the brand.** The Klingon locale translates "School
of Gaming" and keeps "Sogverse" as-is, and the about-page easter egg puts that pair in a
table as one of its jokes. A brand-name rule applied mechanically would "fix" it and delete
the joke. The living rule in `src/CLAUDE.md` says so; this is the record of why it is
written down at all.

## Where it stopped

Nothing was left open. What still names the platform in `messages/` — a legal page defining
who runs Sogverse, a switcher asking who is entering it, the lore naming the world it is
set in — is prose decided case by case by the subject-of-the-sentence rule, not a residue
of the sweep. Those are weighed one string at a time as they are touched, and that
instruction lives in `src/CLAUDE.md`, not here.
