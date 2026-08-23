# Mascot module — working rules

The state of the exploration, the decisions already made and the open items live in
`docs/mascot-explorations.md`; read that first. This file holds the rules for *how* to
work in this directory, which outlive any one round.

## Working from visual references

**Rule: when a design source exists as an image — a legacy asset, a mockup, a
screenshot — derive the spec by looking at the image at working size, never from a
summary of it.** A contact sheet at a few hundred pixels per item is for triage: it
tells you what is in a set, not how anything is built. Before writing a brief, a
component or a description from a reference, render it large (trimmed, roughly 500px
tall, a few side by side) and look at it; state what is there as measurements and
shapes — a proportion, a count, what is *absent* — rather than impressions, and write
the numbers in a comment next to the code that depends on them so the next reader can
check them against the same file. A subagent working from a reference gets the same
instruction and the file path, not a paraphrase. A description relayed through two
briefs is a game of telephone with the source sitting right there, and it is how a
rebuild ends up with the parts the brief happened to mention and none of the ones it
did not.

**Rule: rasterise your own output and look at it, on the dark ground.** Coordinates
that look right in the editor have been wrong every round. The site is dark-only, so
the check is the drawing composited on the page background, beside the reference at
the same pixel height, and again at the avatar sizes (64/40/28) where most uses live.

## Motion

**Rule: feet are the anchor. An idle animation breathes, blinks and shifts its weight;
it does not float.** A character standing on the ground stays on the ground: the body
may expand and settle, the eyes may blink, the head may tilt, the weight may move from
one foot to the other, but the soles keep their y. Lifting the whole figure and setting
it back down reads as hovering, and a hovering character is not standing in the scene
— it is pasted onto it. The only characters that leave the ground at rest are the ones
that can fly and mean to: a winged or elemental creature may hover when its concept
says so, as a deliberate property of that species, never as the default of the rig.
Poses whose whole point is leaving the ground — jumping, walking, anything mid-stride
— move the feet because the action does; that is the action, not a float.

## Colour

All mascot hex lives in the palette module — the sanctioned exception to the
no-hardcoded-colours rule, because the art has to render inside an email where no CSS
custom property exists. Where a mascot colour is a product colour (a brand colour, a
Yty element, a voice-zone hue, a product-type colour) it is read from the shared hex
constants rather than copied, so a retune of the product palette reaches the art. Page
chrome around the art stays on semantic tokens.

## Verifying

Kyle's dev server is always running on the main checkout; never start another one.
Verify the exploration page through Next (a 200, and no error marker in the HTML)
before reporting — concept definitions carry React components and cannot cross the
server→client boundary, so a page that passes `tsc` can still fail to render.
