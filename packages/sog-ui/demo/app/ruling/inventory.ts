/**
 * Every colour Sogverse still defines, what it is worth, and what is proposed
 * for it.
 *
 * The neutrals, the signature pair, the four Yty families and the four status
 * colours have left this file: those rows are ruled and landed, so their values
 * are the library's. The four product-type colours have left it too, with
 * nothing to replace them — a product kind takes a Yty family now, decided in
 * the library's tone grammar, so it is no longer a colour Sogverse defines. The
 * sixteen voice-zone hues have left it as the library's picks: they are the
 * colours a person chooses for their own thing, numbered rather than named, and
 * a zone is one consumer of them rather than their definition.
 *
 * **The status surface has left it too, and so has the act and world one.**
 * `STATUS_SITES` classified 335 call sites by construct and `ACT_ALPHA_JOBS`
 * classified 58 by job, and both existed because the sweeps that would convert
 * them had not run. They have run: no status colour is tinted anywhere, act and
 * world carry no alpha outside two hover shades a filled button owns, and the
 * Yty and pick tiles are the lifted grey with their mark at full value. A
 * classification of a surface that no longer exists is a list nobody can check,
 * so it goes with the sweep rather than staying as a record of it.
 *
 * A temporary file behind a temporary page, deleted with it once the ruling is
 * made. Nothing here is a token and nothing here is imported by the library —
 * these are Sogverse's current values and this page's candidates, written out
 * so the two can be drawn side by side.
 *
 * **The page renders names, not reasons.** Every justification lives in this
 * file, in the doc comment above the values it explains. A row carries only
 * what may appear on screen: the token, its value, its live use count and a
 * one-phrase verdict.
 *
 * **Where the use counts come from.** Regenerate them rather than trusting the
 * numbers, which are a snapshot:
 *
 *     grep -rEoh "(bg|text|border|ring|from|to|via|fill|stroke|outline|shadow|decoration|divide|caret|placeholder|accent)-<token>(/[0-9]+)?([^a-zA-Z0-9/_-]|$)" src --include=*.tsx --include=*.ts | wc -l
 *     grep -rEoh "var\(--color-<token>\)" src --include=*.tsx --include=*.ts --include=*.css | wc -l
 */

/** A colour Sogverse spells inline, with no token behind it. */
export interface LooseColour {
  readonly label: string;
  readonly value: string;
  /** Where it appears, as a locator rather than a description. */
  readonly where: string;
  readonly uses: number;
  readonly verdict: string;
}

/**
 * The colours with no token behind them.
 *
 * **The media rows have left this table**, with the ruling that answered them:
 * ink on media is the app's own ink and never pure white, the picker's check is
 * drawn in ink, and the letterboxing behind a screen share takes the card
 * ground rather than a fourth neutral. True black left Sogverse's palette with
 * them.
 *
 * **The scrim's own row has left it too.** It was admitted, and it is the
 * library's `SCRIM` now — one black at one strength — so it is no longer a
 * colour with no token behind it.
 *
 * **The identicon's two rows have left it** the way the zone colours were
 * sorted into picks: a numbered palette of four in the library, exactly today's
 * values, meaning "the colours valid for an identicon" and nothing more. Two of
 * them read the signature pair, and the black and the white are the artwork's
 * own — so they are no longer colours with no token behind them, and the app
 * names none of them.
 *
 * **The Klingon easter egg** keeps `#D00` and `#0A0A0A` under the artwork
 * exemption — they are the Empire's flag colours, not the brand's, and the day
 * the brand's amber changes the console should not follow.
 *
 * **Its white has left this table.** The eight `text-white/*` were never
 * artwork: they were the words *inside* the picture, ordinary secondary text
 * drawn from a colour the palette does not name, and they took the app's two
 * inks — seven the quiet one, and the glossary table's English column, which is
 * what a reader scans, `foreground`. So the file's lint exemption is the hex ban
 * alone now, on the same terms as the flags and the trophy sprite.
 *
 * **The Lynx cyan is a partner's mark colour.** Our own mark is already drawn
 * in named tokens; the only file spelling this hex draws the Lynx Educate
 * wordmark, in the single colourway they supply. Recolouring or re-deriving a
 * partner mark is what the partner asset rules forbid, so it stays a literal
 * beside the mark it belongs to and never enters the palette. Worth noting
 * beside it: the palette has no cyan of its own, and the nearest thing the
 * product spends is a pick, which is somebody's choice rather than a colour of
 * ours.
 */
export const LOOSE_COLOURS: readonly LooseColour[] = [
  {
    label: "Klingon red",
    value: "#DD0000",
    where: "about/about-section.tsx, the tlh easter egg",
    uses: 6,
    verdict: "artwork",
  },
  {
    label: "Klingon ground",
    value: "#0A0A0A",
    where: "about/about-section.tsx, the tlh easter egg",
    uses: 1,
    verdict: "artwork",
  },
  {
    label: "Lynx cyan",
    value: "#009FE3",
    where: "og/marks.tsx, assets/partners/lynx-educate.svg",
    uses: 6,
    verdict: "never enters the palette",
  },
];

/** One row of the alpha-step surface: a class shape, where it is spent, how often. */
export interface AlphaSite {
  /** The utility as it is written, or the token when the row collects every step of one. */
  readonly step: string;
  /** Where it appears, as a locator rather than a description. */
  readonly where: string;
  readonly uses: number;
}

/**
 * Every utility still carrying a `/n` modifier, and where it is spent.
 *
 * Regenerate the surface rather than trusting the counts, which are a snapshot:
 *
 *     grep -rhoE "\b(bg|from|to|via|text|border|ring|shadow|divide|outline|fill|stroke)-[a-z0-9-]+/[0-9]+" src --include=*.tsx --include=*.ts | sed -E 's/^([a-z]+)-(.*)\/([0-9]+)$/\2/' | sort | uniq -c | sort -rn
 *
 * 4 sites in 2 files, down from 270. The character class takes digits as well
 * as letters because the sixteen zone hues were `pick-1` to `pick-16`: a
 * letters-only class silently dropped all sixteen and reported a total that
 * looked plausible, which is the failure mode a regeneration command exists to
 * prevent.
 *
 * **Every row but the hover shades has gone, and that is six rulings landing.**
 * Act and world are figures on the dark ground and never tints of it; the Yty
 * families and the picks exist at their authored values, so a tile behind one of
 * their marks is the lifted grey; no status colour is tinted anywhere. The neutral inks —
 * a quiet ink stepped quieter, a rail dot at a fraction of the ink, a
 * pseudo-element separator — took the plain token in the enforcement pass, and
 * the easter egg's eight white steps took the app's two inks. What is left is
 * one kind of row.
 *
 * **The four hover shades**, which are not layering at all: the fill darkening
 * under a pointer. That is the same construct as `opacity-50` on a disabled
 * control, which this grep does not even match, and it belongs to a component's
 * recipe rather than to colour. The act and world pair is the Button
 * adoption's; the two destructive ones are the same shape in a status colour.
 */
export const ALPHA_SITES: readonly AlphaSite[] = [
  {
    step: "destructive",
    where: "the destructive hover shade — ui/button.tsx, parent/PaymentProblemBadge.tsx",
    uses: 2,
  },
  {
    step: "act",
    where: "the filled button's hover shade — ui/button.tsx",
    uses: 1,
  },
  {
    step: "world",
    where: "the violet button's hover shade — ui/button.tsx",
    uses: 1,
  },
];
