---
name: ux-walkthrough
description: Work a page that confuses people as a UX problem — reproduce the confusing state with real data, screenshot it, walk through it as the actual reader on a first visit, name what trapped them, and propose subtle fixes within the current UX before any redesign. Use when feedback says parents (or gamers, gedus) are confused by a page, users don't understand why they can't do something, support keeps getting the same question about a screen, or the owner asks to look at something as a UX problem or to walk through it as a user.
---

# UX walkthrough of a confusing page

When feedback says people are confused by a page, the problem is what the page tells the
reader, not the code behind it. Start from the feedback and the screen; open the code only
once a fix has been agreed. Each step below ends in something the owner sees, and the
owner approves the fixes before anything is built.

## 1. Get a real picture of the trap

Reproduce the exact state the confused people were in, with real data, and screenshot it.

- **Find an account and a record that produce the state** — read-only queries against
  staging (`remote-supabase` skill), e.g. a parent whose children are all outside a
  club's age band, and a club whose band excludes them. Prefer staging's real state over
  a preview scene when no scene shows the exact confusing case: a scene that is nearly
  the case hides the very detail that confuses.
- **Shoot it at desktop and phone width** with the `page-screenshots` skill, passing the
  one-off page list through `--pages <file>` rather than committing a preset. The phone
  shot matters: the order things appear in, and what is above the fold, often differ.
- **Crop the region that matters** before reading it, and share the images with the
  owner. The walkthrough is argued from these pictures, so the owner needs to see them.

## 2. Walk through as the reader, first visit

Write it in the first person, as the real audience (a parent, not a developer), arriving
the way they really arrive (from the shop, from an email link). Numbered steps; each says
what I do, what I see, and what I think — **including the wrong conclusions**. Follow the
trap to its end: the duplicate record I create, the support email I send, the moment I
give up.

**Ground every step in what is on screen in the screenshots.** Don't invent UI, and don't
credit the reader with knowledge the page never gave them (a badge they scrolled past, a
rule stated on another page). Small and easily missed elements are where walkthroughs
most often cheat: if the reader would plausibly not notice it, the walkthrough doesn't
either.

## 3. Name what trapped them

From the walkthrough, list the few elements that sent the reader wrong — usually three or
four — and say which did the most damage. That is usually **the element giving a
confident wrong instruction**: a button label or message that names the wrong problem, so
the reader acts on it in good faith. Other typical traps:

- a refused or unavailable item that looks like an ordinary unselected one, and does not
  carry the rule that refuses it;
- the rest of the form still working (checkboxes tick, fields fill), which tells the
  reader everything is fine;
- the page never plainly saying no.

## 4. Propose subtle fixes within the current UX

Before any redesign, change what the existing elements **say** or how they **behave** in
that one state: the label, the disabled state, an inline reason. Keep layout, placement
and affordances where the reader already knows them. Rank the fixes by how early in the
walkthrough each would have stopped the reader, and get the owner's pick before building.

Worked example (shop product page, every child under the club's age band): the disabled
button said "Add a gamer to continue", so parents added the same child again. Approved
fixes: the button names the real problem ("None of your gamers are 13–17"), the row label
reads as a refusal carrying the range ("Too young · 13–17") instead of a description
("Under 13"), and the consent checkboxes are disabled while nobody can be picked.

**Don't, even when a redesign looks cleaner** — both sank a rejected first attempt on
that page, which swapped the form for a message block:

- **Don't repurpose a primary button as navigation away.** A primary button where the
  reader expects "continue" must continue on this page; one that leaves for another page
  breaks the reader's model of the form.
- **Don't move a control the reader already knows.** Moving "Add gamer" into the new
  block meant returning readers could not find it.

A redesign is for when no subtle change can carry the message, and that is the owner's
call, made after seeing the subtle option.

## 5. Build, then show the result

Build the approved fixes, then rerun the same screenshots from step 1 — the same account,
record and widths — and share the before and after with the owner to verify before
review. Re-read the walkthrough against the new shots: every step that went wrong should
now go right at or before the point the ranked fix promised.
