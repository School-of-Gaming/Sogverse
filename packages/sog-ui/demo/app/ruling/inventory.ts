/**
 * Every colour Sogverse still defines, what it is worth, and what is proposed
 * for it.
 *
 * The neutrals, the signature pair and the four Yty families have left this
 * file: those rows are ruled and landed, so their values are the library's and
 * are imported from `src/tokens/brand.ts` wherever a section below still needs
 * one. The four product-type colours have left it too, with nothing to replace
 * them — a product kind takes a Yty family now, decided in the library's tone
 * grammar, so it is no longer a colour Sogverse defines. The sixteen voice-zone
 * hues have left it as the library's picks: they are the colours a person
 * chooses for their own thing, numbered rather than named, and a zone is one
 * consumer of them rather than their definition.
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
 * **Where the "today" hexes come from.** Sogverse authored its theme as HSL
 * triples in `src/app/globals.css`. Each hex below is that triple converted at
 * eight bits per channel, which is what the browser renders, rather than a
 * value read off a screenshot.
 *
 * **Where the use counts come from.** Regenerate them rather than trusting the
 * numbers, which are a snapshot:
 *
 *     grep -rEoh "(bg|text|border|ring|from|to|via|fill|stroke|outline|shadow|decoration|divide|caret|placeholder|accent)-<token>(/[0-9]+)?([^a-zA-Z0-9/_-]|$)" src --include=*.tsx --include=*.ts | wc -l
 *     grep -rEoh "var\(--color-<token>\)" src --include=*.tsx --include=*.ts --include=*.css | wc -l
 *
 * **The bug that changes what "today" means.** `src/app/globals.css` carried an
 * unlayered `* { border-color }` rule, which outranks every `border-*` utility
 * because utilities live in a cascade layer. So no coloured border in Sogverse
 * had ever rendered: `border-yty-harmony/30`, `border-destructive/50` and the
 * rest all drew the grey `--border`. That is fixed on this branch, so wherever
 * a coloured border is authored the page draws three columns: what has been on
 * screen, what the code always said, and what is proposed.
 */

import {
  NEUTRALS,
  YTY_FAMILIES,
  type YtyFamilyId,
} from "../../../src/tokens/brand";

/** What a hue is asked for, which is the only thing a consumer ever names. */
export interface Roles {
  /** Fills, edges, rings, unlabelled marks — everything that is a shape. */
  readonly area: string;
  /** Labels and glyphs on a neutral ground — everything that is read. */
  readonly ink: string;
}

/**
 * The role table: which authored value each family spends in each role.
 *
 * **Consumers never name strong or soft.** A surface asks for a family's area
 * or its ink; this table is the only place that knows which of the two authored
 * values answers. That is what makes the pair a library decision rather than a
 * habit repeated at 335 call sites — and it is why the two halves can differ
 * per family without any consumer having to know that they do.
 *
 * **The dark ground is what inverts the pair.** The brand authors strong and
 * soft against a white page, where strong is the value that separates from the
 * ground. On `#121212` the lighter value is the one that lifts, and a strong
 * mid-tone tuned to hold its own against white sinks into a near-black card and
 * reads as a duller version of the hue. Drawn side by side in every construct,
 * the lighter value won both roles for Harmony, Glow and Wit.
 *
 * **Valor is the exception, and it is a property of the hue rather than of the
 * rule.** Its strong `#FD700D` is already a bright orange that carries an area
 * on the dark ground, and its soft is pale enough to read as a wash rather than
 * a shape — so Valor is the one family whose two roles take different values.
 * That single asymmetry is the whole reason this is a table and not a sentence.
 *
 * **Every area value carries an ink label**, measured: 7.70, 8.83, 6.69 and
 * 8.10 against `#121212`, against 2.43, 2.12, 2.80 and 2.31 against white. No
 * family fill takes a white label, which is what removes the last white from
 * the status set.
 *
 * Success and info are not new colours: they take Glow's roles and Wit's roles
 * unchanged, which is what the owner ruled when the retuned near-duplicates
 * were refused.
 */
export const YTY_ROLES: Record<YtyFamilyId, Roles> = {
  harmony: {
    area: YTY_FAMILIES.harmony.soft,
    ink: YTY_FAMILIES.harmony.soft,
  },
  glow: { area: YTY_FAMILIES.glow.soft, ink: YTY_FAMILIES.glow.soft },
  /** The one family that fills at its strong value — see the table's comment. */
  valor: { area: YTY_FAMILIES.valor.strong, ink: YTY_FAMILIES.valor.soft },
  wit: { area: YTY_FAMILIES.wit.soft, ink: YTY_FAMILIES.wit.soft },
};

/**
 * The four states, which are the keys everything about status is held under.
 *
 * A union rather than a string so no drawing can key on a state that does not
 * exist, and so the record below is checked for completeness rather than
 * trusted: the whole point of a four-member set is that all four are present in
 * every construct that draws it.
 */
export type StatusId = "destructive" | "success" | "info" | "warning";

/** A status colour as Sogverse defines it today, and the one phrase the summary prints for it. */
export interface StatusRow {
  readonly id: StatusId;
  readonly label: string;
  /** Today's fill. */
  readonly today: string;
  /** Today's label colour on that fill. */
  readonly todayForeground: string;
  readonly uses: number;
  /** The verdict, in one phrase. */
  readonly verdict: string;
  /** The verdict for the matching `-foreground`, in one phrase. */
  readonly foregroundVerdict: string;
  /** How many sites the `-foreground` has. */
  readonly foregroundUses: number;
}

/**
 * The four status colours as Sogverse defines them today. Roughly 335 call
 * sites, classified by construct in `STATUS_SITES` below.
 *
 * **What today's set gets wrong, and what the owner has chosen instead.**
 *
 * **The labels are illegible.** Three of the four foregrounds are white on a
 * light fill and miss the 4.5:1 body floor: destructive 3.78:1, info 3.48:1,
 * success 2.52:1. Only warning's dark label passes. The library's brand pair
 * already states the rule these break — a light fill takes a dark label — so a
 * proposed fill takes ink wherever it can, and takes white only where the
 * arithmetic forces it.
 *
 * **Ink is the same hex as the page ground**, so one measurement settles two
 * uses: a colour clearing the body floor against the card is safe both as text
 * on the card and as a fill under an ink label.
 *
 * **The hues collide with the library's own.** One meaning per hue is the tone
 * grammar, and warning sits 5° from the brand amber, success 12° from Glow's
 * strong green, and info 6° from Wit's soft blue.
 *
 * **The owner's ruling on what replaces them, and why two of the four are not
 * new colours at all.** Retuning success and info away from their neighbours
 * was drawn and rejected: a retuned info sits beside Wit as two shades of blue
 * on one page, and a retuned success beside Glow as two greens, and a reader
 * meeting two near-identical hues learns that neither of them means anything.
 * A smaller palette carrying one hue with two related meanings is the better
 * trade — the glyph and the label carry the difference, which is the rule the
 * library already holds for every colour-coded thing. So:
 *
 * - **destructive → `#FF5C5C`, a new colour of its own.** Red is the one status
 *   hue with room: valor's orange is 25° away and harmony's pink 18°, and red
 *   reads as neither. What moves is the value, not the hue — today's red clears
 *   the card by 0.10, so its ink label lands at 4.95 with nothing spare; the
 *   candidate measures 5.75 on the card and 6.19 under ink.
 * - **warning → `#DFCB25`, a new colour of its own.** The worst collision in the
 *   set: a warning badge and a call to action are the same colour today. Moving
 *   to 54° and dropping the saturation gives a caution yellow visibly not the
 *   brand gold; going further lands in chartreuse and stops reading as caution.
 *   10.53 on the card, 11.34 under ink.
 * - **success → Glow, in both roles.** Not a near-green beside Glow, but Glow
 *   itself: `#6AC66B`, 8.21 as ink on the card and 8.83 under an ink label as an
 *   area. This is the one place the library's own doc comment on `glow` has to
 *   change when it lands, because it currently says green is never the colour of
 *   success.
 * - **info → Wit, in both roles, and the fork is closed.** It used to be drawn
 *   both ways: Wit strong `#3A71DE` under a white label (4.57, clearing the body
 *   floor by 0.07 and failing it under ink at 4.10, and failing outright as text
 *   on the card at 3.81), against Wit soft `#4DB3F5` under an ink one. The role
 *   table answers it without a second question — Wit's area *is* soft — so info
 *   is `#4DB3F5` wherever it lands: 8.10 under an ink label, 7.53 as ink on the
 *   card. Wit strong is spent in neither role, and the white label goes with it.
 *
 * The largest construct is what made that the right way round. `text-x` on a
 * neutral ground is 166 of the 335 sites, and Wit strong could never have been
 * text there, so a set whose fill and whose ink were two different values would
 * have been two colours wearing one name at the biggest construct in the
 * inventory.
 *
 * Every ratio above was computed with the library's `contrastRatio`. None is
 * rendered.
 *
 * **When this lands** the four become library tokens with their ink companion
 * and their measured pairings, and success and info become two more rows of the
 * tone grammar rather than two more colours — a status is a fact, and a fact
 * takes a family. The token *names* do not move, so no Sogverse call site
 * changes spelling.
 */
export const STATUS_BY_ID: Record<StatusId, StatusRow> = {
  destructive: {
    id: "destructive",
    label: "Destructive",
    today: "#EF4343",
    todayForeground: "#FFFFFF",
    uses: 160,
    verdict: "retune → #FF5C5C",
    foregroundVerdict: "retune → ink",
    foregroundUses: 3,
  },
  success: {
    id: "success",
    label: "Success",
    today: "#2EB88A",
    todayForeground: "#FFFFFF",
    uses: 85,
    verdict: "→ yty-glow, area and ink",
    foregroundVerdict: "retune → ink",
    foregroundUses: 3,
  },
  info: {
    id: "info",
    label: "Info",
    today: "#308CE8",
    todayForeground: "#FFFFFF",
    uses: 57,
    verdict: "→ yty-wit, area and ink",
    foregroundVerdict: "retune → ink",
    foregroundUses: 1,
  },
  warning: {
    id: "warning",
    label: "Warning",
    today: "#E7B008",
    todayForeground: "#121212",
    uses: 75,
    verdict: "retune → #DFCB25",
    foregroundVerdict: "rename → ink",
    foregroundUses: 2,
  },
};

/**
 * The same four in the order the summary table and every comparison row print
 * them: worst first, then the two that report something going right, then the
 * caution. The record above is the source and this is only its order, so a row
 * cannot exist in one and not the other.
 */
export const STATUS_ROWS: readonly StatusRow[] = [
  STATUS_BY_ID.destructive,
  STATUS_BY_ID.success,
  STATUS_BY_ID.info,
  STATUS_BY_ID.warning,
];

/**
 * One construct that spends a status colour, and every site drawing it.
 *
 * Regenerate the surface rather than trusting the counts, which are a snapshot:
 *
 *     grep -rhoE "\b(bg|text|border|ring|from|to|via|fill|stroke|outline|shadow|divide|decoration|caret|placeholder|accent)-(destructive|success|info|warning)(-foreground)?(/[0-9]+)?\b" src --include=*.tsx --include=*.ts | sort | uniq -c | sort -rn
 *
 * 335 utility occurrences in 116 files. A **site** here is one occurrence, so a
 * line writing `bg-destructive/10 text-destructive` counts two; the constructs
 * below partition the 335 exactly.
 *
 * **No `border-*` row exists, and its absence is not an oversight.** The border
 * sweep deleted every coloured border utility the unlayered default had hidden,
 * so a status colour reaches an edge nowhere in the app today. An alert edge is
 * one of the constructs queued for the library in §13.
 *
 * **Why the classification is by construct.** A status colour is not one thing
 * spent 335 times: it is ink under a field, a wash behind a paragraph, a solid
 * disc on a card's corner, a 2px dot on a timeline rail. Those ask different
 * things of the same hex — ink needs the body floor against a neutral ground, a
 * fill needs a label that reads on it, a dot needs neither and only has to be
 * told apart from its neighbour — so a set that works as a badge can fail as a
 * sentence, and the only way to see that is to draw each construct with all
 * four statuses in it at once.
 *
 * Each line is assigned to the construct it draws, by the shape of its own
 * class string:
 *
 * - a `from-x/n` stop → the lit card;
 * - a `ring-x` → the ring;
 * - an `x-foreground` → a fill under a label;
 * - a `bg-x` at full value with no label → a solid mark;
 * - a `rounded-full` carrying the colour → a pill;
 * - a `bg-x/n` → a tinted ground;
 * - anything else → ink.
 */
export interface StatusSite {
  /** The construct, which is the unit the set is judged in. */
  readonly construct: string;
  /** The class shapes it is written as. */
  readonly step: string;
  /** Where it appears, as locators rather than a description. */
  readonly where: string;
  readonly uses: number;
  readonly files: number;
}

export const STATUS_SITES: readonly StatusSite[] = [
  {
    construct: "Ink on a neutral ground",
    step: "text-destructive, text-success, text-info, text-warning",
    where:
      "the inline field error (family/gamer-sign-in-card.tsx, family/gamer-credential-fields.tsx, every auth form), the tinted glyph beside a label (admin/dashboard/product-attention-grid.tsx, voice/ParticipantRow.tsx), the card's meta line (gedu/session-feed/SessionFeedItem.tsx, session-feed/attendance-tone.ts), public/products/status-chip.tsx",
    uses: 166,
    files: 78,
  },
  {
    construct: "A tinted ground under its own ink",
    step: "bg-destructive/10 text-destructive, bg-info/10 text-info, bg-warning/10, bg-success/10",
    where:
      "ui/alert.tsx (all four variants), the auth forms' error block, public/products/topic-info-card.tsx, voice/MediaErrorNotice.tsx, app/(public)/docs/minecraft-api/page.tsx, admin/products/product-status-chip.tsx",
    uses: 121,
    files: 45,
  },
  {
    construct: "A solid fill under a label",
    step: "bg-destructive text-destructive-foreground, bg-success text-success-foreground, bg-warning text-warning-foreground, bg-info text-info-foreground",
    where:
      "ui/badge.tsx, ui/button.tsx, parent/PaymentProblemBadge.tsx, gedu/session-feed/SessionFeedAlertBadge.tsx, admin/users/[id] the participation pill, admin/gedu-certification-card.tsx",
    uses: 19,
    files: 8,
  },
  {
    construct: "A solid mark with no label",
    step: "bg-success, bg-info, bg-warning, bg-destructive",
    where:
      "gedu/session-feed/SessionFeed.tsx and family/product-page/FamilySessionFeed.tsx (the rail dot), public/products/seat-availability-bar.tsx, voice/MicLevelIndicator.tsx, member-flair/NewcomerBadge.tsx, pin/pin-pad.tsx",
    uses: 15,
    files: 7,
  },
  {
    construct: "A tinted pill",
    step: "rounded-full bg-info/10 text-info, rounded-full bg-warning/15 text-warning",
    where:
      "session-feed/NowDivider.tsx, admin/dashboard/needs-attention-panel.tsx, member-flair/NewcomerBadge.tsx",
    uses: 9,
    files: 3,
  },
  {
    construct: "A ring",
    step: "ring-1 ring-info/40, focus:ring-destructive",
    where: "chat/ChatMessageRow.tsx, parent/PaymentProblemBadge.tsx",
    uses: 4,
    files: 2,
  },
  {
    construct: "A card lit from its leading edge",
    step: "bg-gradient-to-r from-info/5 to-transparent",
    where: "family/EnrollmentCard.tsx, the awaiting card",
    uses: 1,
    files: 1,
  },
];

/**
 * The proposed status set, each entry as the **two roles** a hue is spent in
 * rather than as a single fill.
 *
 * Four entries for four statuses. It used to hold five, because info was drawn
 * as a strong fill under white and as a soft fill under ink and the choice was
 * live; the role table closes that fork. Success takes Glow's roles and info
 * takes Wit's, unchanged, which is what the owner ruled when the retuned
 * near-duplicates were refused — a status is a fact and a fact takes a family.
 *
 * `destructive` and `warning` belong to no family and have one value each,
 * which serves both roles. That is not a placeholder: a colour with one value
 * spends it everywhere, and writing it twice is what lets a construct read the
 * roles without asking which kind of colour it is holding.
 *
 * Two of the four are the library's own hues rather than values of this set's:
 * they are read through `YTY_ROLES` rather than spelled here, so a retune of a
 * family — or a change to which variant a role takes — moves the status with it
 * and the two cannot drift into being near neighbours by accident, which is the
 * exact failure the owner ruled against.
 *
 * **The measured floors behind `onArea`.** Against dark ink the area fills
 * measure 6.19 (destructive), 8.83 (Glow), 11.34 (warning) and 8.10 (Wit);
 * against white 3.03, 2.12, 1.65 and 2.31. Every one of them clears the 4.5
 * body floor under ink and none clears it under white, so the whole set carries
 * an ink label and **no white survives anywhere in it**. That is a consequence
 * of the role table rather than a separate decision: the value that failed
 * under ink was Wit strong (4.10), and Wit strong is no longer spent.
 */
export interface ProposedStatus {
  readonly status: StatusId;
  /** The name on screen: the token, or the hex where there is no token yet. */
  readonly label: string;
  /** A fill, an edge, a ring, an unlabelled mark. */
  readonly area: string;
  /** A label or a glyph on a neutral ground. */
  readonly ink: string;
  /** The label that reads on a solid fill of `area`. */
  readonly onArea: string;
}

export const PROPOSED_STATUSES: readonly ProposedStatus[] = [
  {
    status: "destructive",
    label: "destructive #FF5C5C",
    area: "#FF5C5C",
    ink: "#FF5C5C",
    onArea: NEUTRALS.background.hex,
  },
  {
    status: "success",
    label: "success = yty-glow",
    area: YTY_ROLES.glow.area,
    ink: YTY_ROLES.glow.ink,
    onArea: NEUTRALS.background.hex,
  },
  {
    status: "info",
    label: "info = yty-wit",
    area: YTY_ROLES.wit.area,
    ink: YTY_ROLES.wit.ink,
    onArea: NEUTRALS.background.hex,
  },
  {
    status: "warning",
    label: "warning #DFCB25",
    area: "#DFCB25",
    ink: "#DFCB25",
    onArea: NEUTRALS.background.hex,
  },
];

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
 * **Scrim, media ground and on-media ink** are real constructs the library has
 * no word for, so the proposal is that it name them rather than that the pages
 * stop using them. The scrim is drawn at two opacities today for one construct;
 * one is proposed. On-media ink is a separate token from the app's Ink because
 * over the brightest thing a scrim can cover, one step down from white is the
 * step that stops it clearing the body floor. The media ground is true black,
 * which is right behind video and wrong as a page ground — which is why the
 * library's Ground is not black.
 *
 * **The identicon's white and black** become Ink and Ground. Its black square
 * reads as a hole on a card, being darker than anything else on the page. Its
 * violet is the weak pairing either way: a dark colour on a dark ground, below
 * the 3:1 glyph floor on both #121212 and #1A1A1A, which is a separate ruling
 * worth taking while the avatars are on screen.
 *
 * **The Klingon easter egg** keeps `#D00` and `#0A0A0A` under the artwork
 * exemption — they are the Empire's flag colours, not the brand's. Its eight
 * `text-white/*` are not artwork: they are ordinary secondary text drawn from a
 * colour the palette does not name, and they become muted ink.
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
    label: "Scrim",
    value: "#000000",
    where: "ui/dialog.tsx, ui/sheet.tsx, family/ProfileTiles.tsx",
    uses: 3,
    verdict: "admit",
  },
  {
    label: "Media ground",
    value: "#000000",
    where: "voice/ScreenShareDisplay.tsx",
    uses: 1,
    verdict: "admit",
  },
  {
    label: "On-media ink",
    value: "#FFFFFF",
    where: "family/ProfileTiles.tsx, voice/ZoneColorPicker.tsx",
    uses: 2,
    verdict: "admit",
  },
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
    label: "Easter-egg ink",
    value: "#FFFFFF",
    where: "about/about-section.tsx, text-white/30 to /70",
    uses: 8,
    verdict: "rename → muted-foreground",
  },
  {
    label: "Identicon white",
    value: "#FFFFFF",
    where: "lib/identicon.ts",
    uses: 1,
    verdict: "rename → foreground",
  },
  {
    label: "Identicon ground",
    value: "#000000",
    where: "ui/identicon.tsx",
    uses: 1,
    verdict: "rename → background",
  },
  {
    label: "Lynx cyan",
    value: "#009FE3",
    where: "og/marks.tsx, assets/partners/lynx-educate.svg",
    uses: 6,
    verdict: "never enters the palette",
  },
];

/** One row of the alpha-step surface: a class shape, where it is spent, and what is under it. */
export interface AlphaSite {
  /** The utility as it is written, or the token when the row collects every step of one. */
  readonly step: string;
  /** Where it appears, as a locator rather than a description. */
  readonly where: string;
  readonly uses: number;
  /** What the blend lands on, in one phrase. */
  readonly ground: string;
}

/**
 * Every utility carrying a `/n` modifier, classified by what is underneath it.
 *
 * Regenerate the surface rather than trusting the counts, which are a snapshot:
 *
 *     grep -rhoE "\b(bg|from|to|via|text|border|ring|shadow|divide|outline|fill|stroke)-[a-z0-9-]+/[0-9]+" src --include=*.tsx --include=*.ts | sed -E 's/^([a-z]+)-(.*)\/([0-9]+)$/\2/' | sort | uniq -c | sort -rn
 *
 * 269 sites in 119 files. The character class takes digits as well as letters
 * because the sixteen zone hues are `pick-1` to `pick-16` now: a letters-only
 * class silently drops all sixteen and reports a total that looks plausible,
 * which is the failure mode a regeneration command exists to prevent.
 *
 * Drop the `sed` to see the steps rather than the tokens; the fifteen media and
 * scrolling rows below are the whole of what that unsedded output holds for
 * `black` and `background`, and they are listed at that granularity because they
 * are the rows the section draws one by one. Everything else is collected per
 * token, which is the granularity the regeneration command itself reports.
 *
 * **Why the classification is the answer.** Over a ground the system did not
 * choose there is no pairing to measure and no token to name, so blending at
 * render time is the only mechanism there is. Over a ground the system did
 * choose the blend lands on one fixed colour every time, and that colour is a
 * token nobody named. Fifteen sites are the first kind. The other 254 are the
 * second, and most of them are already in front of the owner under another
 * question: the eight `text-white/*` are the Klingon easter egg, the sixteen
 * Yty strong steps are the element recipe, the sixteen pick steps are the zone
 * tile, and the status tints ride with the status set.
 *
 * **The one shape that is neither.** Four sites — the amber, violet and red
 * button hovers in `ui/button.tsx`, and the same red on the payment-problem
 * badge — spend an alpha step as a *state shade*: the fill darkening under the
 * pointer, not a tint over a ground. That is the same construct as `opacity-50`
 * on a disabled control, which this grep does not even match, and it belongs to
 * a component's recipe rather than to colour. They are counted in the `act`,
 * `world` and `destructive` rows below and are not what those rows are about.
 *
 * **The act and world rows have a table of their own below.** They are ruled —
 * neither carries alpha anywhere — so the open question for their 58 sites is
 * not what is under them but what stands in each place, which is a question per
 * *job* rather than per token. `ACT_ALPHA_JOBS` is that breakdown.
 */
export const ALPHA_SITES: readonly AlphaSite[] = [
  {
    step: "bg-black/50",
    where: "ui/dialog.tsx, ui/sheet.tsx",
    uses: 2,
    ground: "media",
  },
  {
    step: "bg-black/60",
    where: "family/ProfileTiles.tsx",
    uses: 1,
    ground: "media",
  },
  {
    step: "bg-background/80",
    where: "ui/fullscreen-image-viewer.tsx, voice/ScreenShareDisplay.tsx",
    uses: 4,
    ground: "media",
  },
  {
    step: "bg-background/85",
    where: "voice/VoiceAvatar.tsx, chat/ChatComposer.tsx",
    uses: 2,
    ground: "media",
  },
  {
    step: "bg-background/90",
    where: "gedu/session-feed/SessionPhotoStrip.tsx",
    uses: 1,
    ground: "media",
  },
  {
    step: "bg-background/70",
    where: "voice/instant/InstantVoiceLobby.tsx",
    uses: 1,
    ground: "media",
  },
  {
    step: "bg-background/90, bg-background/70",
    where: "layout/dashboard-section-pill.tsx",
    uses: 2,
    ground: "scrolling content",
  },
  {
    step: "bg-background/80",
    where: "voice/ZoneList.tsx, the member strip's scroll arrows",
    uses: 2,
    ground: "scrolling content",
  },
  {
    step: "act",
    where: "eleven jobs — see the act and world table",
    uses: 51,
    ground: "a token",
  },
  {
    step: "muted",
    where: "quiet blocks, code samples, reply strips, every skeleton",
    uses: 44,
    ground: "a token",
  },
  {
    step: "destructive",
    where: "the inline error, the danger row, the destructive hover",
    uses: 37,
    ground: "a token",
  },
  {
    step: "muted-foreground",
    where: "faded ink, pseudo-element separators, a quiet glyph",
    uses: 18,
    ground: "a token",
  },
  {
    step: "warning",
    where: "the caution note and its chip",
    uses: 16,
    ground: "a token",
  },
  {
    step: "info",
    where: "the informational note, a ring, a gradient, the now divider",
    uses: 16,
    ground: "a token",
  },
  {
    step: "success",
    where: "the confirmed note and its chip",
    uses: 12,
    ground: "a token",
  },
  {
    step: "white",
    where: "about/about-section.tsx, the tlh easter egg",
    uses: 8,
    ground: "a token",
  },
  {
    step: "yty-*-strong",
    where: "the element card and the zone tile",
    uses: 16,
    ground: "a token",
  },
  {
    step: "pick-*",
    where: "voice/ZoneList.tsx, the zone tile fill",
    uses: 16,
    ground: "a token",
  },
  {
    step: "card",
    where: "the home features, the Roblox reasons and events cards, the browse filters, the FAQ list",
    uses: 5,
    ground: "a token",
  },
  {
    step: "world",
    where: "four gradients, and the violet button hover",
    uses: 5,
    ground: "a token",
  },
  {
    step: "accent",
    where: "the checkbox row, the filter dropdown, two voice rows",
    uses: 5,
    ground: "a token",
  },
  {
    step: "foreground",
    where: "the absent mark, the zone glow, one faded chip label",
    uses: 3,
    ground: "a token",
  },
  {
    step: "act-foreground",
    where: "faded ink on an amber fill — see the act and world table",
    uses: 2,
    ground: "a token",
  },
];

/** One job the act/world alpha steps are doing, and every site doing it. */
export interface ActAlphaJob {
  /** What the alpha was for, which is the unit the owner rules on. */
  readonly job: string;
  /** The class shapes it is written as. */
  readonly step: string;
  /** Where it appears, as locators rather than a description. */
  readonly where: string;
  readonly uses: number;
}

/**
 * The 58 act and world alpha steps, grouped by the job the alpha was doing.
 *
 * Regenerate the surface rather than trusting the counts:
 *
 *     grep -rnoE "\b(bg|from|to|via|text|border|ring|shadow|divide|outline)-(act|world)(-foreground)?/[0-9]+" src --include=*.tsx --include=*.ts
 *
 * **Grouped by job, not by file, because the ruling is per job.** Act and world
 * carry no alpha anywhere — that is decided — so every one of these 58 sites
 * changes. What they change *to* is not one answer: `bg-act/5` is a persistent
 * selection in a form, a transient "it will land here" under a drag, and a fact
 * about today's date in an admin week, and a sweep that replaced all three with
 * one thing would be deciding, silently, that they are the same statement.
 *
 * **The ten gradient sites are listed and not drawn here.** They are question
 * 9's, they are the only place the pair appears at *full* value as well
 * (`lib/constants/roles.ts`, which this grep does not even match), and drawing
 * them twice would put the same decision on the page in two places.
 *
 * **The hover shade has two more sites this grep cannot see.**
 * `hover:bg-destructive/90` in `ui/button.tsx` and in
 * `parent/PaymentProblemBadge.tsx` is the same construct in a status colour, so
 * it rides question 2 and is listed rather than drawn beside the act one.
 *
 * **Two of these jobs sit against a rule the library already ships.**
 * `brand.ts` exempts chip-scale icon-accent tiles from the no-alpha rule, which
 * is the icon-tile job below at seven sites; and the four hover shades were
 * ruled to fall here rather than to wait for the Button adoption. Both are
 * drawn rather than argued.
 */
export const ACT_ALPHA_JOBS: readonly ActAlphaJob[] = [
  {
    job: "A selected option in a form",
    step: "bg-act/5",
    where:
      "ui/checkbox-row.tsx, admin/products/sections/{audience ×2, billing ×2, region-lock, registration, spoken-language, when ×2}, admin/products/gedu-picker-sheet.tsx, admin/products/image-catalogue-view.tsx, family/gamer-sign-in-radios.tsx, voice/ZoneDialog.tsx",
    uses: 14,
  },
  {
    job: "A selected item, with act as its ink",
    step: "bg-act/5, bg-act/10, bg-act/15",
    where:
      "admin/products/gedu-picker-sheet.tsx ×2, admin/products/sections/identity-section.tsx, locations/location-picker-panel.tsx, chat/ChatReactionRow.tsx, public/products/signup-panel-view.tsx",
    uses: 6,
  },
  {
    job: "An icon tile behind a glyph",
    step: "bg-act/10, bg-act/20",
    where:
      "app/(public)/page.tsx, app/(public)/roblox/page.tsx, about/about-section.tsx, public/products/purchase-confirmation-view.tsx ×2, app/(dashboard)/admin/whatsapp/page.tsx ×2",
    uses: 7,
  },
  {
    job: "A drop target",
    step: "bg-act/5, bg-act/10 ring-2 ring-act",
    where:
      "admin/products/groups/{group-column, unassigned-card, waitlist-card}.tsx, admin/products/image-picker.tsx, chat/ChatComposer.tsx, gedu/session-feed/SessionPhotoStrip.tsx",
    uses: 6,
  },
  {
    job: "A ring",
    step: "ring-act/30, ring-act/50",
    where:
      "voice/VoiceAvatar.tsx, voice/instant/InstantVoiceLobby.tsx, family/ProfileTiles.tsx, public/products/signup-panel-view.tsx",
    uses: 4,
  },
  {
    job: "A highlighted row",
    step: "bg-act/5, bg-act/20 ring-1 ring-act",
    where:
      "admin/dashboard/week-rows.tsx, chat/ChatMessageRow.tsx, chat/ChatMessageList.tsx",
    uses: 3,
  },
  {
    job: "A status chip",
    step: "bg-act/10 text-act, bg-act/20 text-act",
    where:
      "admin/products/product-status-chip.tsx, public/schools/schools-browse.tsx",
    uses: 2,
  },
  {
    job: "A hover shade on a filled control",
    step: "hover:bg-act/90, hover:bg-world/80",
    where: "ui/button.tsx (destructive twice more, with parent/PaymentProblemBadge.tsx)",
    uses: 2,
  },
  {
    job: "Faded ink on an amber fill",
    step: "text-act-foreground/70",
    where:
      "app/(dashboard)/admin/whatsapp/page.tsx, preview/scenes/chat-scene.tsx",
    uses: 2,
  },
  {
    job: "A hover tint on an empty tile",
    step: "group-hover:bg-act/5",
    where: "family/ProfileTiles.tsx, the add-gamer tile",
    uses: 1,
  },
  {
    job: "A callout ground",
    step: "bg-act/5 text-foreground",
    where: "admin/products/form-primitives.tsx, the warn hint",
    uses: 1,
  },
  {
    job: "A gradient",
    step: "from-act/5, from-act/10, to-world/5, to-world/10",
    where: "see gradients",
    uses: 10,
  },
];

/**
 * Identicon fixtures.
 *
 * Real generated UUIDs, hardcoded as literals: the identicon derives its grid
 * and its per-cell colours from the id's hex bytes, so a readable stand-in
 * renders a degenerate pattern rather than a different-looking one, and a
 * generator called at render time gives the same person a different face on
 * every reload.
 */
export const IDENTICON_IDS: readonly string[] = [
  "f6c7f52f-f644-4d2b-aee6-ffa5cbbe3a09",
  "45f1d090-c4e6-432c-852d-d5c3a159d994",
  "9a328d11-3fe2-41f4-8698-183caee9c0ac",
  "fdab6467-8c20-4be8-87ee-a148824c119e",
];
