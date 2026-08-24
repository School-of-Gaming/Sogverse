/**
 * What `/logo` shows, and why each thing is there.
 *
 * Every SVG referenced here lives in `public/logo/` and is derived from the real
 * badge geometry with both master-asset defects repaired: the letters-cut-as-
 * holes seam, and a stray node in the S. Nothing was traced or redrawn by eye.
 *
 * This is a **temporary design-review surface on a short-lived branch.** Delete
 * the route, `public/logo/`, and this file together once the decision lands.
 */

export type Candidate = { readonly id: string; readonly file: string; readonly note: string };
export type Group = { readonly title: string; readonly blurb: string; readonly items: readonly Candidate[] };

const c = (id: string, file: string, note: string): Candidate => ({ id, file, note });

/** The mark itself. Decided: these two, and nothing else. */
export const MARKS = [
  {
    kind: "Full",
    file: "sog-logo-clean.svg",
    use: "Replaces the image on the Roblox page.",
    what:
      "A straight, cleaned-up improvement of the original: both master-asset defects repaired, " +
      "every other coordinate left exactly as drawn.",
  },
  {
    kind: "Simple",
    file: "sog-badge-mark-filled.svg",
    use: "Where the SOG is wanted without the full brand name.",
    what: "The same SOG, scaled up to take the room the tagline left behind, on the same badge.",
  },
] as const;

/** The heights the Roblox lockup actually renders at (h-14, sm:h-20), plus the small end. */
export const MARK_LADDER = [80, 56, 40, 28] as const;

/**
 * The same size rungs as the gem ladder, in the squarer container.
 *
 * The square holds the S about 7.5 units wider at any given clearance, so the
 * ladder runs one rung past where the gem stops: 84 is the gem's ceiling, 92 is
 * the square's. The 76 rung is SC2 itself rather than a copy of it, so the
 * container ladder and this one cannot drift apart.
 */
const SQUARE_SIZE: Group = {
  title: "Size in the squarer gem",
  blurb:
    "SC2's container held constant, S width the only thing moving. The first four rungs are the gem " +
    "ladder's exactly, so the two compare rung for rung; the fifth is room the gem does not have.",
  items: [
    c("SQ1", "SQ1-size-60.svg", "60."),
    c("SQ2", "SQ2-size-68.svg", "68."),
    c("SC2", "SC2-gem-square.svg", "76 — SC2 as it stands, the value the container ladder holds every shape at."),
    c("SQ4", "SQ4-size-84.svg", "84 — SZ4's value, which was the gem's ceiling. The square still has room."),
    c("SQ5", "SQ5-size-92.svg", "92 — the square's own ceiling; here the S's corners reach its taper."),
  ],
};

/** Route 1 — the true letterform, black on yellow per rule 3. */
export const ROUTE_1: readonly Group[] = [
  {
    title: "Container",
    blurb:
      "The S held constant, so the room each shape gives is visible. Same six shapes as the chevron " +
      "ladder, so the two routes compare like for like.",
    items: [
      c("SC1", "SC1-gem.svg", "The badge gem."),
      c("SC2", "SC2-gem-square.svg", "Squarer gem — more room, less of the badge's proportion."),
      c("SC3", "SC3-tile.svg", "Rounded tile. The loudest ground we have."),
      c("SC4", "SC4-chamfer.svg", "Chamfered tile."),
      c("SC5", "SC5-circle.svg", "Circle. Rare in a tab strip, which counts at 16px."),
      c("SC6", "SC6-full-bleed.svg", "Full-bleed square. Pure colour block."),
    ],
  },
  {
    title: "Size",
    blurb: "In the gem, everything else fixed.",
    items: [
      c("SZ1", "SZ1-size-60.svg", "S 60 wide."),
      c("SZ2", "SZ2-size-68.svg", "68."),
      c("SZ3", "SZ3-size-76.svg", "76 — the value the container ladder uses."),
      c("SZ4", "SZ4-size-84.svg", "84 — about the gem's limit; the S's corners reach the taper."),
    ],
  },
  SQUARE_SIZE,
];

/** Route 2 — no letter. Down to one direction. */
export const ROUTE_2: readonly Candidate[] = [
  c(
    "N8",
    "N8-gem-chevron.svg",
    "The badge holding a forward chevron: the S's apex, abstracted away from being a letter. " +
      "It points at the tab's own title, which is where the angle-bracket reading comes from.",
  ),
];

/** N8's two open questions. Angle, terminals and count are settled at N8's values. */
export const CHEVRON: readonly Group[] = [
  {
    title: "Weight",
    blurb: "Stroke only. Size held at N8's.",
    items: [
      c("W1", "W1-weight-11.svg", "Stroke 11."),
      c("W2", "W2-weight-13.svg", "13."),
      c("W3", "W3-weight-15.svg", "15 — N8 as it was picked."),
      c("W4", "W4-weight-17.svg", "17."),
      c("W5", "W5-weight-19.svg", "19."),
      c("W6", "W6-weight-21.svg", "21 — the counter is nearly shut at 16px."),
    ],
  },
  {
    title: "Size",
    blurb: "Chevron height only. Stroke held at N8's 15, so thickening is not doing the work.",
    items: [
      c("Z1", "Z1-size-32.svg", "32 tall."),
      c("Z2", "Z2-size-38.svg", "38."),
      c("Z3", "Z3-size-44.svg", "44 — N8."),
      c("Z4", "Z4-size-50.svg", "50."),
      c("Z5", "Z5-size-56.svg", "56."),
      c("Z6", "Z6-size-62.svg", "62 — the tails run into the gem's taper."),
    ],
  },
  {
    title: "Container",
    blurb:
      "Chevron held at N8's weight and size, so the only thing moving is the shape around it — " +
      "which also shows how much room each one actually gives.",
    items: [
      c("D1", "D1-gem.svg", "The badge gem — N8."),
      c("D2", "D2-gem-square.svg", "Squarer gem."),
      c("D3", "D3-tile.svg", "Rounded tile. Most mass, least identity."),
      c("D4", "D4-chamfer.svg", "Chamfered tile — the letterforms' 45° as a corner cut."),
      c("D5", "D5-circle.svg", "Circle."),
      c("D6", "D6-full-bleed.svg", "Full-bleed square."),
    ],
  },
];

/** The head-to-head the strip carries: one container ladder from each route. */
export const STRIP_ITEMS: readonly Candidate[] = [...ROUTE_1[0].items, ...CHEVRON[2].items];

/** The size ladder gets its own strip: 16px is where a size decision is actually made. */
export const SQUARE_STRIP_ITEMS: readonly Candidate[] = SQUARE_SIZE.items;

/** Kept so nobody re-proposes them. */
export const RULED_OUT: readonly Candidate[] = [
  c("SX1", "SX1-yellow-on-dark.svg", "Rule 3: yellow S on dark."),
  c("SX2", "SX2-white-on-purple.svg", "Rule 3: white S on purple."),
  c("SX3", "SX3-bare.svg", "Rule 3: no yellow ground."),
  c("N1", "N1-gem-solid.svg", "Bare hexagon — generic without prior knowledge of SOG."),
  c("N2", "N2-gem-outline.svg", "Same, as an outline."),
  c("N3", "N3-gem-dpad.svg", "D-pad in the badge."),
  c("N4", "N4-gem-purple-ring.svg", "Purple ring."),
  c("N5", "N5-dpad.svg", "A bare cross reads as a plus sign."),
  c("N6", "N6-face-buttons.svg", "Face buttons."),
  c("N7", "N7-chevrons.svg", "Rank chevrons — crowded territory."),
  c("X1", "X1-angle-45.svg", "Angle — settled at N8's 38°."),
  c("X2", "X2-angle-53.svg", "Angle."),
  c("X3", "X3-angle-62.svg", "Angle."),
  c("X4", "X4-cut-round.svg", "Terminals — settled at N8's round cap and join."),
  c("X5", "X5-cut-sharp.svg", "Terminals."),
  c("X6", "X6-cut-bevel.svg", "Terminals."),
  c("X7", "X7-double.svg", "Count — settled at a single chevron."),
  c("X8", "X8-double-taper.svg", "Count."),
  c("X9", "X9-through.svg", "Cuts through the badge; loses the silhouette."),
];

/**
 * Monochrome lockups, for the legacy footer treatment.
 *
 * The mark in sog.gg's footer is a single black compound path with the letters
 * cut out as holes — there is no white anywhere in that file. On a white page
 * the holes read as white text, which is where "black mark, white text" comes
 * from; on our #121212 ground the same file paints a near-black badge and fills
 * its letters with the page behind it. So it is not a file that can be reused
 * here, and inverting it is not a colour swap: it is making both colours
 * explicit, which our own two marks already do.
 *
 * These are therefore generated from `sog-logo-clean.svg` and
 * `sog-badge-mark-filled.svg` by swapping those two explicit fills, and
 * nothing else. Named for the ground they sit on, because that is the thing a
 * caller has to pick.
 */
export const MONO = [
  {
    id: "M1",
    file: "M1-full-on-light.svg",
    from: "sog-logo-clean.svg",
    ground: "light" as const,
    note: "The legacy footer treatment, reproduced with real colour: dark badge, white letters.",
  },
  {
    id: "M2",
    file: "M2-full-on-dark.svg",
    from: "sog-logo-clean.svg",
    ground: "dark" as const,
    note: "The inversion — white badge, dark letters. The one that would go in our own footer.",
  },
  {
    id: "M3",
    file: "M3-simple-on-light.svg",
    from: "sog-badge-mark-filled.svg",
    ground: "light" as const,
    note: "Same treatment on the tagline-less mark.",
  },
  {
    id: "M4",
    file: "M4-simple-on-dark.svg",
    from: "sog-badge-mark-filled.svg",
    ground: "dark" as const,
    note: "Same again, inverted.",
  },
] as const;

export const RULES = [
  {
    n: "Rule 1",
    text:
      "The S is only ever the S. The letterform is already on merch, so a redraw is not available " +
      "however much better it would fit a square. Correcting defects is fine; redrawing is not.",
  },
  {
    n: "Rule 2",
    text:
      "Yellow and purple never share an edge. Each may sit on dark or on white, and both may appear " +
      "in one composition — separated.",
  },
  {
    n: "Rule 3",
    text:
      "An S is always a black letter on a yellow ground. A brand rule rather than a contrast one, " +
      "though it happens to pick the 9.58:1 pairing every time.",
  },
] as const;

export const CONTRAST = [
  { pair: "yellow on dark", ratio: "9.58", verdict: "strongest pairing we have", ok: true },
  { pair: "white on purple", ratio: "6.43", verdict: "the codified secondary pair", ok: true },
  { pair: "yellow on purple", ratio: "3.29", verdict: "clears 3:1 only just, and looks it", ok: false },
  { pair: "purple on yellow", ratio: "3.29", verdict: "same, inverted", ok: false },
  { pair: "purple on dark", ratio: "2.91", verdict: "fails the 3:1 graphic threshold", ok: false },
  { pair: "dark on purple", ratio: "2.91", verdict: "fails", ok: false },
] as const;
