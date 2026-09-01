import { describe, it, expect } from "vitest";
import { BRAND, DARK_THEME, STATUS, STATUS_TINT } from "@/lib/constants/colors";

/**
 * Contrast, asserted on the palette itself rather than on any rendering.
 *
 * This is the cheapest check in the directory and it guards the failure with
 * the widest blast radius: a colour that fails contrast is unreadable when a
 * client renders it *perfectly*, so no amount of fidelity work touches it. Two
 * separate faults reached production before this existed — brand purple as body
 * text at 2.7:1, and a footer grey at 2.51:1 on every mail we send — and both
 * were argued about as client-rendering problems for far longer than measuring
 * them would have taken.
 *
 * **Rule: check contrast before fidelity, always.** This file is that rule made
 * mechanical, and it runs in milliseconds because it renders nothing.
 */

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

// One threshold, because every pair below is used at body size somewhere. A
// large-text exemption with no pair claiming it is an escape hatch sitting in
// reach of whoever next needs a failing pair to pass.
const AA_BODY = 4.5;

/**
 * Every foreground/background pair a mail is permitted to produce.
 *
 * The list is the point: a pair that is not here is a pair no template may
 * emit, and adding one means measuring it. `large` marks the pairs only ever
 * used at 18px bold or above, where AA's threshold is lower.
 */
const PAIRS: { name: string; fg: string; bg: string }[] = [
  { name: "body text on the message panel", fg: DARK_THEME.foreground, bg: DARK_THEME.card },
  { name: "muted text on the message panel", fg: DARK_THEME.mutedFg, bg: DARK_THEME.card },
  { name: "footer text on the ground", fg: DARK_THEME.mutedFg, bg: DARK_THEME.bg },
  { name: "body text on the ground", fg: DARK_THEME.foreground, bg: DARK_THEME.bg },
  { name: "primary button label", fg: BRAND.primaryForeground, bg: BRAND.primary },
  { name: "secondary button label", fg: BRAND.secondaryForeground, bg: BRAND.secondary },
  { name: "outline button label", fg: DARK_THEME.foreground, bg: DARK_THEME.card },
  // The header lockup and any brand-orange inline text, both ≥18px bold or
  // used as emphasis at body size — it clears AA_BODY anyway, comfortably.
  { name: "brand orange on the ground", fg: BRAND.primary, bg: DARK_THEME.bg },
  // The callout panel: both its uppercase label and its paragraphs, which carry
  // the same colour on the washed info surface. 13.24:1 — the reason the panel
  // can drop the accent-coloured title the app's Alert uses and lose nothing.
  { name: "callout text on the info tint", fg: DARK_THEME.foreground, bg: STATUS_TINT.infoSurface },
];

describe("every colour pair a mail may emit is legible", () => {
  it.each(PAIRS)("$name", ({ fg, bg }) => {
    const ratio = contrast(fg, bg);
    expect(
      ratio,
      `${fg} on ${bg} is ${ratio.toFixed(2)}:1, below the ${AA_BODY}:1 floor. ` +
        "A client rendering this perfectly still leaves it unreadable.",
    ).toBeGreaterThanOrEqual(AA_BODY);
  });
});

/**
 * The pairs that are *forbidden*, asserted to still be forbidden.
 *
 * Without this the palette could drift until one of them quietly became legal
 * and the rule that excludes it would read as arbitrary caution. Each of these
 * is a real mistake someone made or nearly made, kept measurable so the reason
 * survives the reasoning.
 */
describe("the pairs we rejected are still worth rejecting", () => {
  // `atLeast` pins a pair whose *distance* from the floor is load-bearing for
  // the prose around it: the number lives where the build fails when it stops
  // being true, instead of rotting in a comment.
  const FORBIDDEN: {
    name: string;
    fg: string;
    bg: string;
    why: string;
    atLeast?: number;
  }[] = [
    {
      name: "brand purple as body text",
      fg: BRAND.secondary,
      bg: DARK_THEME.card,
      why: "the original reason purple was pulled out of body copy",
    },
    {
      name: "the primary's dark label on the secondary's fill",
      fg: BRAND.primaryForeground,
      bg: BRAND.secondary,
      why: "copying a working button and changing only its fill",
    },
    {
      name: "white on the primary fill",
      fg: BRAND.secondaryForeground,
      bg: BRAND.primary,
      why: "the same mistake in the other direction",
    },
    {
      name: "the info colour as the callout's own label",
      fg: STATUS.info,
      bg: STATUS_TINT.infoSurface,
      // 3.45:1. The app's Alert colours its title with the accent and the mail
      // cannot copy that: at 12px bold there is no large-text exemption to reach
      // for, so the label is `foreground` and the accent stays in the border and
      // the wash. This used to sit at 4.46:1 — a hair under the floor, and the
      // prose here made much of how close the call was. Converging `--info` onto
      // wit-strong ended that: the fill got lighter, its 10% wash got lighter
      // with it, and the accent-on-its-own-wash pairing moved a full point
      // further from the floor rather than nearer. The pin is kept because the
      // distance is now the load-bearing fact, in place of the nearness.
      why: "the one thing the mail's callout does not inherit from the app's Alert",
      atLeast: 3.4,
    },
  ];

  it.each(FORBIDDEN)("$name stays below AA — $why", ({ fg, bg, atLeast }) => {
    const ratio = contrast(fg, bg);
    expect(ratio).toBeLessThan(AA_BODY);
    if (atLeast !== undefined) {
      expect(
        ratio,
        `the prose beside this pair assumes at least ${atLeast}:1`,
      ).toBeGreaterThan(atLeast);
    }
  });
});

/**
 * The pair that is rejected on *policy*, pinned at the number that no longer
 * rejects it.
 *
 * White on the info fill lived in `FORBIDDEN` above for as long as contrast did
 * the excluding: at 3.48:1 it simply failed, and nothing else had to be said.
 * The design pass converged `--info` onto wit-strong, and the same pair now
 * measures 4.57:1 — over the floor, by a hair. That removes the argument, not
 * the exclusion.
 *
 * The exclusion stands for the reason `colors.ts` states beside `STATUS`: the
 * palette carries the pairs mails actually emit, and no mail puts a label on an
 * info fill. `info` is an accent here — a border and a wash — and mirroring the
 * fill beside its foreground keeps the two one decision, not an invitation to
 * use them together. A pair admitted to `PAIRS` on the strength of clearing AA,
 * with no template asking for it, is exactly the unmeasured-value-in-reach this
 * file exists to prevent.
 *
 * So it is pinned rather than asserted against a floor. The number is the whole
 * assertion: if a future token tune moves this blue, the build stops here and
 * whoever moved it re-reads the paragraph above instead of inheriting a silent
 * rule. `toBeCloseTo`'s two digits is the tolerance — tight enough that any real
 * change to `--info` trips it, loose enough to survive nothing at all.
 */
describe("the pair we reject on policy is pinned where it stands", () => {
  it("white on the info fill clears AA and is still not a pair a mail may emit", () => {
    const ratio = contrast(STATUS.infoForeground, STATUS.info);
    expect(
      ratio,
      "white on --info measured 4.57:1 when this was written; a different " +
        "number means --info moved, and the policy note above needs re-reading " +
        "rather than this pin being nudged to match.",
    ).toBeCloseTo(4.57, 2);
    expect(
      ratio,
      "the point of this pin is that contrast is no longer what excludes the " +
        "pair — if it drops back below the floor, it belongs in FORBIDDEN again.",
    ).toBeGreaterThanOrEqual(AA_BODY);
  });
});
