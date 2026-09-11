// The faces the two renderers that read no CSS have to be told about by name:
// the mail, and the satori-drawn Open Graph cards.
//
// The same shape colors.ts takes: nothing is spelled here, and every value is
// derived from `@sog/ui`, which is the one place a School of Gaming face is
// decided. A family typed into this file would be Sogverse defining a face for
// itself, which it may not do.

import { FACES, MAIL_FACE } from "@sog/ui";

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

/**
 * The same declaration for desktop Outlook, which reads no stack.
 *
 * Word's rendering engine takes the first family in a `font-family` and answers
 * one it cannot resolve with Times New Roman instead of the next entry, so the
 * stack above — which opens with two names that exist only on Apple platforms —
 * would turn every mail serif there. The library holds the Windows-resolvable
 * form of the same face; Sogverse's part is only to emit it where that engine
 * alone will read it, which is the conditional block in the shell's head.
 */
export const MAIL_WORD_ENGINE_FONT_STACK = MAIL_FACE.wordEngineStack;

/**
 * The family name every Open Graph card draws in.
 *
 * satori has no stylesheet and no CSS variables, so a card names its face as a
 * string: the buffers it is handed are registered under this name and every
 * element in the card asks for it by the same one. The name is the library's —
 * the app face, whatever family that is — and `src/components/og/fonts.ts`
 * holds the files, because loading a face is the consumer's half of the
 * contract and a hashed font URL is a fact about one cut of a file rather than
 * about the brand.
 */
export const OG_FONT_FAMILY = FACES.sans.name;
