/**
 * Every colour Sogverse still defines, what it is worth, and what is proposed
 * for it.
 *
 * The neutrals, the signature pair, the four Yty families and the four status
 * colours have left this file: those rows are ruled and landed, so their values
 * are the library's and are imported from `src/tokens/brand.ts` wherever a
 * section below still needs one. The four product-type colours have left it too,
 * with nothing to replace them — a product kind takes a Yty family now, decided
 * in the library's tone grammar, so it is no longer a colour Sogverse defines.
 * The sixteen voice-zone hues have left it as the library's picks: they are the
 * colours a person chooses for their own thing, numbered rather than named, and
 * a zone is one consumer of them rather than their definition.
 *
 * What the status half leaves behind is the **surface**, not the values:
 * `STATUS_SITES` still classifies every call site by construct and carries the
 * command that regenerates it, because the constructs those sites are swept into
 * are a later pass and that pass needs the list.
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

/**
 * The four states, which are the keys the status surface is classified under.
 *
 * The colours themselves have left this file. All four are the library's now —
 * `destructive` and `warning` as hues of their own, `success` and `info`
 * resolving through Glow and Wit, because a status is a fact and a fact takes a
 * family — so a drawing that needs one reads `statusHex` rather than a candidate
 * spelled here. What is left is the id, which is what the construct table below
 * is keyed on.
 */
export type StatusId = "destructive" | "success" | "info" | "warning";

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
 * **Media ground and on-media ink** are real constructs the library has no word
 * for, so the proposal is that it name them rather than that the pages stop
 * using them. On-media ink is a separate token from the app's Ink because over
 * the brightest thing a scrim can cover, one step down from white is the step
 * that stops it clearing the body floor. The media ground is true black, which
 * is right behind video and wrong as a page ground — which is why the library's
 * Ground is not black.
 *
 * **The scrim's own row has left this table.** It was admitted, and it is the
 * library's `SCRIM` now — one black at one strength — so it is no longer a
 * colour with no token behind it. What its ruling did not settle is what reads
 * on it, which is the on-media ink row above.
 *
 * **The identicon's two rows have left this table.** They were sorted the way
 * the zone colours were sorted into picks: a numbered palette of four in the
 * library, exactly today's values, meaning "the colours valid for an
 * identicon" and nothing more. Two of them read the signature pair, and the
 * black and the white are the artwork's own — so they are no longer colours
 * with no token behind them, and the app names none of them. What the ruling
 * did not settle went with them into the library's doc comment, for the avatar
 * project to inherit: the black square reads as a hole on a card, and the dark
 * colour of the pair is the weak one on a dark ground either way.
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
 * 200 sites in 94 files. The character class takes digits as well as letters
 * because the sixteen zone hues are `pick-1` to `pick-16` now: a letters-only
 * class silently drops all sixteen and reports a total that looks plausible,
 * which is the failure mode a regeneration command exists to prevent.
 *
 * **The table used to have a `ground` column, and losing it is the ruling.**
 * The question this list opened with was what is *underneath* each step, and
 * the answer split it in two: fifteen sites blended over a ground the system
 * had not chosen — a photograph, a video frame, a page scrolling beneath a
 * pinned bar — and the rest blend over a token, landing on one fixed colour
 * every time that nobody has named. The first kind was the only kind that
 * needed alpha at all, and it is now two library constructs (`bg-scrim` and
 * the `glass` utility) rather than six strengths in five files. So those rows
 * have left this table, the five `bg-card/50` sites over a known ground have
 * gone to the plain token, and every row that is left sits over a ground the
 * system chose — which is why the column is gone: it would say the same thing
 * on every line.
 *
 * What remains is open under another question rather than this one: the eight
 * `text-white/*` are the Klingon easter egg, the sixteen Yty strong steps are
 * the element recipe, the sixteen pick steps are the zone tile, and the status
 * tints ride the status set.
 *
 * **The grey rows have left this table with the greys.** `bg-muted/*` and
 * `bg-accent/*` were 49 of these sites, and none of them was layering over a
 * ground the system had not chosen: they were the quiet ground drawn faint, or
 * a hover drawn fainter, on a card whose colour was known all along. With one
 * lifted grey there is nothing to draw a fraction of, so every one of them is
 * the plain token now.
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
    step: "act",
    where: "eleven jobs — see the act and world table",
    uses: 51,
  },
  {
    step: "destructive",
    where: "the inline error, the danger row, the destructive hover",
    uses: 37,
  },
  {
    step: "muted-foreground",
    where: "faded ink, pseudo-element separators, a quiet glyph",
    uses: 18,
  },
  {
    step: "warning",
    where: "the caution note and its chip",
    uses: 16,
  },
  {
    step: "info",
    where: "the informational note, a ring, a gradient, the now divider",
    uses: 16,
  },
  {
    step: "success",
    where: "the confirmed note and its chip",
    uses: 12,
  },
  {
    step: "white",
    where: "about/about-section.tsx, the tlh easter egg",
    uses: 8,
  },
  {
    step: "yty-*-strong",
    where: "the element card and the zone tile",
    uses: 16,
  },
  {
    step: "pick-*",
    where: "voice/ZoneList.tsx, the zone tile fill",
    uses: 16,
  },
  {
    step: "world",
    where: "four gradients, and the violet button hover",
    uses: 5,
  },
  {
    step: "foreground",
    where: "the absent mark, the zone glow, one faded chip label",
    uses: 3,
  },
  {
    step: "act-foreground",
    where: "faded ink on an amber fill — see the act and world table",
    uses: 2,
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
