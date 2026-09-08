// The face a mail is set in, for the one renderer that reads no CSS.
//
// The same shape colors.ts takes: nothing is spelled here, and the value is
// derived from `@sog/ui`, which is the one place a School of Gaming face is
// decided. A family typed into this file would be Sogverse defining a face for
// itself, which it may not do.

import { MAIL_FACE } from "@sog/ui";

/**
 * The `font-family` declaration every mail sets on `<body>`, and the only place
 * in this app a family reaches an email client.
 *
 * The mail face is the reader's own system sans and no webfont is loaded ahead
 * of it; the library's `MAIL_FACE` doc comment holds that decision and its
 * reasons. What is Sogverse's part of it is only this: the stack is emitted
 * once, on the shell, and every element under it inherits — a mail that names a
 * family a second time is a mail that can disagree with itself.
 *
 * The string is written to survive an inline `style="…"` attribute, so the one
 * quoted family in it is quoted with apostrophes.
 */
export const MAIL_FONT_STACK = MAIL_FACE.stack;
