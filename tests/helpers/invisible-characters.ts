/**
 * The invisible characters the game-username transport rule strips, written as
 * code points rather than pasted.
 *
 * Every one of these is Unicode general category **`Cf`** (format), which is
 * exactly what makes them worth a shared fixture: they are not whitespace, so
 * `.trim()` walks straight past them, and they render as nothing at all. A test
 * that pasted the literal character would be a line no reviewer could read, a
 * diff no one could check, and a fixture that any editor, linter or copy-paste
 * could silently normalize away. Naming them by code point is the only form
 * that survives all of that.
 *
 * `String.fromCodePoint` rather than a `\u` escape in a literal for the same
 * reason: the escape reads as invisible-in-a-string to the language and as
 * invisible-in-a-string to whoever opens the file, while the call names the
 * code point in the source text itself.
 */

/** U+200B ZERO WIDTH SPACE — the one that most looks like it is not there. */
export const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b);

/** U+200D ZERO WIDTH JOINER. */
export const ZERO_WIDTH_JOINER = String.fromCodePoint(0x200d);

/** U+FEFF BYTE ORDER MARK, in its zero-width-no-break-space role. */
export const BYTE_ORDER_MARK = String.fromCodePoint(0xfeff);

/**
 * U+202E RIGHT-TO-LEFT OVERRIDE — the sharp one.
 *
 * It is not merely invisible: it reverses the visual order of everything after
 * it, so a stored name can render as a different name than the one in the
 * column. That is why the strip is a rendering rule of ours rather than a
 * guess about what a platform allows.
 */
export const RIGHT_TO_LEFT_OVERRIDE = String.fromCodePoint(0x202e);

/**
 * A name made of nothing but format characters, with ordinary spaces around it
 * — the value that has to collapse to "no name here" rather than being stored.
 */
export const INVISIBLE_ONLY_NAME = ` ${ZERO_WIDTH_SPACE}${ZERO_WIDTH_JOINER}${BYTE_ORDER_MARK} `;
