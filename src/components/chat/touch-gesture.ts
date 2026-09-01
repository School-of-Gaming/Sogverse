/**
 * Was this click made with a finger?
 *
 * **The one seam the touch path needs, and it is per gesture rather than per
 * device.** The message action bar is revealed by hovering, which a phone
 * cannot do — so a tap has to reveal it instead. That extra meaning must not
 * reach a mouse: a click that both pins the bar open *and* is the click that
 * opens a picture would cost a desktop reader a second click for something they
 * can already do in one, and hover has already shown them the bar anyway.
 *
 * A media query (`(hover: hover)`) answers the wrong question — it describes the
 * *device's primary input*, so a touchscreen laptop is a hover device and the
 * finger touching its screen would be told it is a mouse. `pointerType` is
 * carried by the gesture itself and is right on every device without asking what
 * kind it is.
 *
 * **A browser that tells us nothing is treated as a mouse**, which is exactly
 * today's behaviour: pictures open on the first tap and the bar stays a hover
 * affordance. That is the honest failure — the touch path is an addition, and
 * losing it degrades to what shipped rather than to a surface where a picture
 * needs two taps to open for reasons nobody can see.
 */
export function isTouchGesture(event: { nativeEvent: Event }): boolean {
  const native = event.nativeEvent;
  if (!("pointerType" in native)) return false;
  // Pen is deliberately grouped with touch: a stylus on a tablet has no hover
  // state to reveal the bar with either.
  return native.pointerType === "touch" || native.pointerType === "pen";
}
