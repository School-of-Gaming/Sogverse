# The Guidebook excerpt

This folder is Sogverse's excerpt of the **School of Gaming Brand Voice & Identity
Guidebook v2.0 (Jul 21, 2026)** — SOG-UI's input, not its authority. For anything the
library does not yet cover, these files are the source of truth consulted while deciding;
for anything the library covers, the library is the truth and these files are not cited
beside it.

**Rule: the change that covers a piece of the Guidebook deletes that piece here, in the
same change.** Covered means the library holds it in its own form and produces it
correctly every time — a token, a generated value, a component, a test, a lint rule. The
form is rarely the Guidebook's words and need not be; what it must be is a mechanism that
makes the claim true by construction, verified before the cut. A claim merely restated as
prose is not covered. Cut whole paragraphs or subsections, never a clause, and never
reword what stays; a paragraph the mechanism only partly covers stays whole; a file that
empties is deleted and its row leaves this index. A piece the owner has overruled leaves
the same way, with the ruling listed below, since a rejected value is no longer input.
What this folder holds is exactly what is not yet covered, its size is the measure of what
remains, and the day it is empty the library has forgotten the Guidebook exists. A later
sweep is not the mechanism: a piece left behind by the change that covered it is the
defect.

**Rule: open the one file that answers your question, never the set.** The split exists so
a session spends context on one topic; reading the folder end to end costs what the single
file it replaced cost. Content is verbatim — do not reword, tidy or re-sync it by hand.

| File | The question it answers |
| :---- | :---- |
| `foundation.md` | What is School of Gaming for, what does it value, what are the Yty-Elements, the mantras, the Scouts anchor, the loop, and how do the four names relate? |
| `audience.md` | Who am I writing to, and what register does that audience take? |
| `voice-pillars.md` | Does this draft sound like us, and which habit is it failing? |
| `lore-density-dial.md` | How much of the world belongs in this piece, and when must it drop to plain language? |
| `vocabulary.md` | Is this word ours, banned, or cased wrong — and why (Human Skills, screen time, Discord, metaverse)? |
| `princi-pal.md` | When does the Princi-Pal speak instead of the brand, and how is he attributed? |
| `hard-moments.md` | How do we write billing, safeguarding, an incident, an outage, and proactive safety copy? |
| `channels.md` | What does the website, a parent email, a platform surface or the store demand of copy? |
| `formatting.md` | How is a date, time, duration, price or link written? |
| `worked-examples.md` | What does a finished piece look like at a given lore level? |
| `quality-checklist.md` | Is this draft ready to ship? |
| `visual-identity.md` | Logo, colour palette, typography, trademark and the ® rules (Appendix A). |
| `campaign-toolkit.md` | The recurring visual devices (Blobs, window frame, topic pill) and the basic UI components (Appendix B.2, B.4). |
| `decision-log.md` | Which rulings constrain copy downstream, and where the live site currently drifts from the guide. |

## What was left out, and why

Dropped because it governs a channel or a document outside this repo:

- **6, the Princi-Pal in long form** — blog and newsletter writing. When he speaks and how
  he is attributed is kept; how to write his 700 words is not ours.
- **8.4 Social**, **8.5 In-lesson Gedu language**, **8.7 Gedu Academy** — social platforms,
  live spoken language in a lesson, and a separate site with its own voice. The Gedu levels
  and the aspiring-Gedu register survive in `vocabulary.md` and `audience.md`.
- **10.5 mid-lesson**, **10.6 Instagram**, **10.10 LinkedIn** — worked examples for those
  same three channels. Seven examples remain, so the kept intro's "Eight" is the original's
  own miscount, not a lost file.
- **B.1 Photography**, **B.3 Social post templates** — shooting and campaign-asset rules.
- **12, the Notion reconciliation and Settled tables, and Still open** — provenance and
  cross-document sync. The two subsections that constrain copy are kept in `decision-log.md`.

Overruled by the owner, 2026-09-08: **the Yty-Element strong/soft colour pairs** (the A.2
table and the hexes in the foundation table). SOG-UI holds one colour per element, the
accepted one, typed in its token source; Valor's orange is a declared departure.

Dropped because it is navigation or metadata for a document that no longer exists in one
piece: the **front matter**, the **table of contents**, the **colophon**, and the reading
order in **"How to use this guide"** — whose two discipline paragraphs (the brand is not a
keyword cannon; Sogverse is a gift we give, not a test we set) open `foundation.md`.
