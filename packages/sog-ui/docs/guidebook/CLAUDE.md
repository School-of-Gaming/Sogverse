# The Guidebook excerpt

This folder is SOG-UI's excerpt of the **visual half** of the **School of Gaming Brand Voice
& Identity Guidebook v2.0 (Jul 21, 2026)** — SOG-UI's input, not its authority. For anything
the library does not yet cover, these files are the source of truth consulted while
deciding; for anything the library covers, the library is the truth and these files are not
cited beside it. The Guidebook's voice half (how School of Gaming writes, its vocabulary, the
trademark and legal-name rules for copy) left this folder on 2 Nov 2026 for the
`sog-brand-voice` skill, which is the one source of truth for copy; a section reference in
these files to a numbered voice section (Section 1, 2.2, 5.2, 6, 12) points at what is now
in that skill.

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

**Rule: open the one file that answers your question, never the set.** Content is verbatim
— do not reword, tidy or re-sync it by hand.

| File | The question it answers |
| :---- | :---- |
| `visual-identity.md` | Logo, colour palette, typography and the logo's trademark registration (Appendix A). |
| `campaign-toolkit.md` | The recurring visual devices (Blobs, window frame, topic pill) and the basic UI components (Appendix B.2, B.4). |

## What was left out, and why

Dropped because it governs a channel or a document outside this repo: **B.1 Photography**
and **B.3 Social post templates** — shooting and campaign-asset rules.

Overruled by the owner, 2026-09-08: **the Yty-Element strong/soft colour pairs** (the A.2
table). SOG-UI holds one colour per element, the accepted one, typed in its token source;
Valor's orange is a declared departure.

Overruled by the owner, 2026-09-08: **Space Mono as the world's voice** (the A.3 paragraph
placing it in in-platform UI and anything meant to feel like it comes from inside the game
world). It was put to the strongest cases the product has and not taken: SOG-UI holds
Space Mono as the machine face and nothing else — a room code, a password, an id, a log, a
placeholder no customer should see — and the world voice has no placement, because the app
face carries every word a person reads. The heading above the two paragraphs that remain
still says "three", since what stays is never reworded; the third was this one.

Dropped because it is navigation or metadata for a document that no longer exists in one
piece: the **front matter**, the **table of contents**, the **colophon**, and the reading
order in **"How to use this guide"**.
