/**
 * **The picture on an openable card leans in when the card is pointed at.**
 *
 * One effect for every card whose picture sits above a link to somewhere — the
 * shop's product cards and the Library's article cards alike — so the two grids
 * answer a hover the same way. Applied to the image inside a frame that clips
 * (`overflow-hidden`), under a card that carries `group`; keyboard focus on the
 * card's link counts as pointing at it, as it does for the card's shadow.
 *
 * Only on a card that opens: a product card that leads nowhere must not look
 * as if it does, so its caller withholds this with the rest of the hover
 * feedback. It is not withheld from readers who ask for reduced motion (owner
 * ruling, 2026-09-28): a 2% lean the reader sets off by pointing at the card
 * is feedback on their own action, not motion the page imposes.
 *
 * The picture keeps a compositor layer of its own at all times. Without the
 * hint the browser gives it one only while the transition runs, placed at its
 * exact fractional position, and drops it when the transition ends; painting
 * then snaps a picture that sits between device pixels to whole ones, so it
 * jumps by a pixel on the last frame of the lean back out. The cost is one GPU
 * layer per card.
 */
export const COVER_HOVER_ZOOM =
  "transition-transform duration-300 will-change-transform group-hover:scale-[1.02] group-focus-within:scale-[1.02]";
