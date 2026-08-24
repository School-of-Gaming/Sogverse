/**
 * The accessory registry — everything that can be worn, one entry per item.
 *
 * Two rules hold the whole thing together.
 *
 * **An accessory may not touch the identity core.** It draws on top of the
 * base model and it paints itself out of the *garment* colour slots
 * (`clothing`, `clothingAccent`) plus the shared accent. It never redraws a
 * body, a head, an eye or a species landmark, so no outfit can turn one
 * character into another one — which is the property that makes a
 * gamer-facing customiser safe to build on this later.
 *
 * **An accessory knows nothing about poses.** It draws at an anchor, and the
 * anchor is read inside whatever transform the pose has already applied. A hat
 * stays on the head through a jump because the head moved and the hat did not
 * have to be told.
 *
 * Each entry also declares the smallest detail level it survives at. Chunky
 * silhouette items (hats, scarves, a hoodie block, sunglasses) keep rendering
 * down to icon size because they *help* recognition there. Hairline items (a
 * lanyard, a flower crown, ground extras) drop out, because at 24 pixels they
 * are three grey dots that make the character harder to read, not easier.
 */

import type { ReactElement } from "react";

import type { ConceptId } from "./concept";
import { showsFiligree, type DetailLevel } from "./detail";
import type { Anchors, OutfitSlot } from "./outfit";
import {
  BRAND_GOLD,
  brandRadius,
  MASCOT_INK,
  MASCOT_SCENERY,
  mixHex,
  shadeHex,
  swatchHex,
  tintHex,
  type Colorway,
} from "./palette";
import type { Rig } from "./rig";

export type AccessoryContext = {
  anchors: Anchors;
  rig: Rig;
  colors: Colorway;
  detail: DetailLevel;
};

export type AccessoryDef = {
  id: string;
  label: string;
  slot: OutfitSlot;
  /** The smallest level of detail at which this still gets drawn. */
  minLevel: DetailLevel;
  /** Species this item does not work on, and why, in one clause. */
  notFor?: readonly ConceptId[];
  incapableBecause?: string;
  render: (ctx: AccessoryContext) => ReactElement;
  /**
   * The half of a scene that goes *behind* the character — a chair, a monitor
   * standing on the desk. Only the `scene` slot uses it, and only because
   * furniture is the one kind of accessory a character is inside rather than
   * on: a desk has to occlude the legs while a chair has to be occluded by the
   * back, and no single draw order does both.
   */
  renderBehind?: (ctx: AccessoryContext) => ReactElement;
};

const OUTLINE = {
  stroke: MASCOT_INK.line,
  strokeWidth: 2.2,
  strokeLinejoin: "round" as const,
};

const LEVEL_RANK: Record<DetailLevel, number> = { icon: 0, simple: 1, full: 2 };

/** Whether an item still gets drawn at the level being rendered. */
export function accessoryVisible(def: AccessoryDef, detail: DetailLevel): boolean {
  return LEVEL_RANK[detail] >= LEVEL_RANK[def.minLevel];
}

// --- hats -----------------------------------------------------------------

const HEADSET: AccessoryDef = {
  id: "headset",
  label: "Headset",
  slot: "hat",
  minLevel: "icon",
  render: ({ rig, colors, detail }) => {
    const { x: hx, y: hy, r } = rig.head;
    return (
      <g>
        <path
          d={`M ${hx - r} ${hy - r * 0.05} A ${r} ${r * 1.1} 0 0 1 ${hx + r} ${hy - r * 0.05}`}
          fill="none"
          stroke={colors.accent}
          strokeWidth={detail === "icon" ? 9 : 7}
          strokeLinecap="round"
        />
        <rect x={hx - r - 7} y={hy - 12} width={15} height={25} rx={7} fill={colors.accent} {...OUTLINE} />
        <rect x={hx + r - 8} y={hy - 12} width={15} height={25} rx={7} fill={colors.accent} {...OUTLINE} />
        {detail !== "icon" && (
          <>
            <circle cx={hx - r} cy={hy} r={3.6} fill={colors.spark} />
            <path
              d={`M ${hx - r} ${hy + 12} C ${hx - r + 2} ${hy + 26} ${hx - r * 0.55} ${hy + 30} ${hx - r * 0.42} ${hy + 24}`}
              fill="none"
              stroke={colors.accent}
              strokeWidth={4}
              strokeLinecap="round"
            />
            <circle cx={hx - r * 0.42} cy={hy + 24} r={4} fill={colors.spark} {...OUTLINE} />
          </>
        )}
      </g>
    );
  },
};

const BEANIE: AccessoryDef = {
  id: "beanie",
  label: "Beanie",
  slot: "hat",
  minLevel: "icon",
  render: ({ anchors, colors }) => {
    const { x, y, w } = anchors.hat;
    return (
      <g>
        <path
          d={`M ${x - w / 2} ${y + 8} Q ${x} ${y - 40} ${x + w / 2} ${y + 8} Z`}
          fill={colors.clothing}
          {...OUTLINE}
        />
        <rect
          x={x - w / 2 - 4}
          y={y + 2}
          width={w + 8}
          height={12}
          rx={6}
          fill={colors.clothingAccent}
          {...OUTLINE}
        />
        <circle cx={x} cy={y - 26} r={8} fill={colors.clothingAccent} {...OUTLINE} />
      </g>
    );
  },
};

const SANTA_HAT: AccessoryDef = {
  id: "santa-hat",
  label: "Santa hat",
  slot: "hat",
  minLevel: "icon",
  render: ({ anchors, colors }) => {
    const { x, y, w } = anchors.hat;
    return (
      <g>
        <path
          d={`M ${x - w / 2} ${y + 8} Q ${x - w * 0.2} ${y - 32} ${x + w * 0.62} ${y - 24} Q ${x + w * 0.22} ${y - 4} ${x + w / 2} ${y + 8} Z`}
          fill={colors.clothing}
          {...OUTLINE}
        />
        <rect
          x={x - w / 2 - 4}
          y={y + 2}
          width={w + 8}
          height={12}
          rx={6}
          fill={colors.clothingAccent}
          {...OUTLINE}
        />
        <circle cx={x + w * 0.66} cy={y - 24} r={8} fill={colors.clothingAccent} {...OUTLINE} />
      </g>
    );
  },
};

const PARTY_HAT: AccessoryDef = {
  id: "party-hat",
  label: "Party hat",
  slot: "hat",
  minLevel: "icon",
  render: ({ anchors, colors }) => {
    const { x, y, w } = anchors.hat;
    return (
      <g>
        <path
          d={`M ${x + 2} ${y - 36} L ${x + w * 0.34} ${y + 9} L ${x - w * 0.3} ${y + 9} Z`}
          fill={colors.clothing}
          {...OUTLINE}
        />
        <path
          d={`M ${x - 7} ${y - 8} L ${x + 13} ${y - 12}`}
          stroke={colors.clothingAccent}
          strokeWidth={4}
          strokeLinecap="round"
        />
        <path
          d={`M ${x - 12} ${y + 2} L ${x + 18} ${y - 3}`}
          stroke={colors.clothingAccent}
          strokeWidth={4}
          strokeLinecap="round"
        />
        <circle cx={x + 2} cy={y - 38} r={5.5} fill={colors.clothingAccent} {...OUTLINE} />
      </g>
    );
  },
};

const WITCH_HAT: AccessoryDef = {
  id: "witch-hat",
  label: "Witch hat",
  slot: "hat",
  minLevel: "icon",
  render: ({ anchors, colors }) => {
    const { x, y, w } = anchors.hat;
    return (
      <g>
        <ellipse cx={x} cy={y + 8} rx={w * 0.82} ry={7.5} fill={colors.clothing} {...OUTLINE} />
        <path
          d={`M ${x - w * 0.32} ${y + 8} Q ${x - w * 0.1} ${y - 30} ${x + w * 0.3} ${y - 42} Q ${x + w * 0.08} ${y - 12} ${x + w * 0.34} ${y + 8} Z`}
          fill={colors.clothing}
          {...OUTLINE}
        />
        <path
          d={`M ${x - w * 0.3} ${y + 3} L ${x + w * 0.32} ${y + 3}`}
          stroke={colors.clothingAccent}
          strokeWidth={6}
          strokeLinecap="round"
        />
      </g>
    );
  },
};

const FLOWER_CROWN: AccessoryDef = {
  id: "flower-crown",
  label: "Flower crown",
  slot: "hat",
  minLevel: "simple",
  render: ({ anchors, colors }) => {
    const { x, y, w } = anchors.hat;
    const spots = [-0.42, -0.21, 0, 0.21, 0.42];
    return (
      <g>
        <path
          d={`M ${x - w * 0.5} ${y + 8} Q ${x} ${y - 6} ${x + w * 0.5} ${y + 8}`}
          fill="none"
          stroke={colors.accent}
          strokeWidth={5}
          strokeLinecap="round"
        />
        {spots.map((t, i) => (
          <circle
            key={t}
            cx={x + w * t}
            cy={y + 4 - (1 - Math.abs(t) * 2.2) * 7}
            r={6}
            fill={i % 2 === 0 ? colors.clothingAccent : colors.clothing}
            {...OUTLINE}
          />
        ))}
      </g>
    );
  },
};

// --- face -----------------------------------------------------------------

const SPECS: AccessoryDef = {
  id: "specs",
  label: "Specs",
  slot: "face",
  minLevel: "simple",
  render: ({ anchors, colors, rig, detail }) => {
    const { x, y, dx, r } = anchors.face;
    // Specs are the one item in this registry made of nothing but line, so
    // they are the one item a near-black body swallows whole. A colourway
    // that declares an inverted ink gets it here too — everywhere else the
    // fallback is the shared ink these have always been drawn in.
    const stroke = {
      fill: "none" as const,
      stroke: colors.ink ?? MASCOT_INK.line,
      strokeWidth: detail === "icon" ? 4 : 2.8,
      strokeLinecap: "round" as const,
    };
    // A one-eyed head reports no eye separation, and a pair of specs drawn on
    // it would be two coincident lenses with a bridge straight across the
    // middle of them — a line through the eye rather than between two. One
    // eye gets one lens, sized up to sit around a big single eye, and keeps
    // both arms so it still reads as a pair of glasses rather than a monocle.
    if (dx < 0.5) {
      const lens = r * 1.36;
      return (
        <g {...stroke}>
          <circle cx={x} cy={y} r={lens} />
          <path d={`M ${x - lens} ${y} L ${x - rig.head.r} ${y - 3}`} />
          <path d={`M ${x + lens} ${y} L ${x + rig.head.r} ${y - 3}`} />
        </g>
      );
    }
    const lens = r * 1.75;
    return (
      <g {...stroke}>
        <circle cx={x - dx} cy={y} r={lens} />
        <circle cx={x + dx} cy={y} r={lens} />
        <path d={`M ${x - dx + lens} ${y} L ${x + dx - lens} ${y}`} />
        <path d={`M ${x - dx - lens} ${y} L ${x - rig.head.r} ${y - 3}`} />
        <path d={`M ${x + dx + lens} ${y} L ${x + rig.head.r} ${y - 3}`} />
      </g>
    );
  },
};

const SHADES: AccessoryDef = {
  id: "shades",
  label: "Sunglasses",
  slot: "face",
  minLevel: "icon",
  render: ({ anchors, rig, colors }) => {
    const { x, y, dx, r } = anchors.face;
    // Same story as the specs: with one eye there is one lens, and it is one
    // wide visor rather than two overlapping rectangles with a bridge drawn
    // across the middle of them.
    if (dx < 0.5) {
      const vw = r * 2.6;
      const vh = r * 1.9;
      return (
        <g>
          <rect
            x={x - vw / 2}
            y={y - vh / 2}
            width={vw}
            height={vh}
            rx={vh * 0.4}
            fill={MASCOT_INK.line}
            stroke={colors.clothingAccent}
            strokeWidth={2.4}
          />
          <path
            d={`M ${x - vw / 2} ${y} L ${x - rig.head.r} ${y - 4}`}
            stroke={MASCOT_INK.line}
            strokeWidth={4}
            strokeLinecap="round"
          />
          <path
            d={`M ${x + vw / 2} ${y} L ${x + rig.head.r} ${y - 4}`}
            stroke={MASCOT_INK.line}
            strokeWidth={4}
            strokeLinecap="round"
          />
          <path
            d={`M ${x - vw * 0.3} ${y + vh * 0.26} L ${x - vw * 0.06} ${y - vh * 0.3}`}
            stroke={colors.clothingAccent}
            strokeWidth={3}
            strokeLinecap="round"
            opacity={0.8}
          />
        </g>
      );
    }
    const w = r * 2.1;
    const h = r * 1.7;
    return (
      <g>
        <rect
          x={x - dx - w / 2}
          y={y - h / 2}
          width={w}
          height={h}
          rx={h * 0.35}
          fill={MASCOT_INK.line}
          stroke={colors.clothingAccent}
          strokeWidth={2.4}
        />
        <rect
          x={x + dx - w / 2}
          y={y - h / 2}
          width={w}
          height={h}
          rx={h * 0.35}
          fill={MASCOT_INK.line}
          stroke={colors.clothingAccent}
          strokeWidth={2.4}
        />
        <rect
          x={x - dx / 2}
          y={y - 2.6}
          width={dx}
          height={5.2}
          rx={2.6}
          fill={colors.clothingAccent}
        />
        <path
          d={`M ${x - dx - w / 2} ${y} L ${x - rig.head.r} ${y - 4}`}
          stroke={MASCOT_INK.line}
          strokeWidth={4}
          strokeLinecap="round"
        />
        <path
          d={`M ${x + dx + w / 2} ${y} L ${x + rig.head.r} ${y - 4}`}
          stroke={MASCOT_INK.line}
          strokeWidth={4}
          strokeLinecap="round"
        />
        <path
          d={`M ${x - dx - w * 0.34} ${y + h * 0.24} L ${x - dx + w * 0.1} ${y - h * 0.3}`}
          stroke={colors.clothingAccent}
          strokeWidth={3}
          strokeLinecap="round"
          opacity={0.8}
        />
      </g>
    );
  },
};

// --- torso ----------------------------------------------------------------

const NO_SHOULDERS = {
  notFor: ["ytymo"] as const,
  incapableBecause: "A droplet has no shoulders — a sleeved garment reads as a bib.",
};

const HOODIE: AccessoryDef = {
  id: "hoodie",
  label: "Hoodie",
  slot: "torso",
  minLevel: "icon",
  ...NO_SHOULDERS,
  render: ({ anchors, colors, detail }) => {
    const t = anchors.torso;
    const cx = t.x + t.w / 2;
    return (
      <g>
        <path
          d={`M ${t.x - 2} ${t.y + 10} Q ${cx} ${t.y - 8} ${t.x + t.w + 2} ${t.y + 10} L ${t.x + t.w + 2} ${t.y + t.h} L ${t.x - 2} ${t.y + t.h} Z`}
          fill={colors.clothing}
          {...OUTLINE}
        />
        <ellipse cx={cx} cy={t.y + 8} rx={t.w * 0.4} ry={9} fill={colors.clothingAccent} {...OUTLINE} />
        {detail !== "icon" && (
          <>
            <rect
              x={cx - t.w * 0.26}
              y={t.y + t.h * 0.62}
              width={t.w * 0.52}
              height={t.h * 0.28}
              rx={7}
              fill={colors.clothingAccent}
              opacity={0.4}
            />
            <path
              d={`M ${cx - 7} ${t.y + 14} L ${cx - 7} ${t.y + 26}`}
              stroke={colors.clothingAccent}
              strokeWidth={3}
              strokeLinecap="round"
            />
            <path
              d={`M ${cx + 7} ${t.y + 14} L ${cx + 7} ${t.y + 24}`}
              stroke={colors.clothingAccent}
              strokeWidth={3}
              strokeLinecap="round"
            />
          </>
        )}
      </g>
    );
  },
};

const TEE: AccessoryDef = {
  id: "tee",
  label: "T-shirt",
  slot: "torso",
  minLevel: "simple",
  ...NO_SHOULDERS,
  render: ({ anchors, colors }) => {
    const t = anchors.torso;
    const cx = t.x + t.w / 2;
    const bottom = t.y + t.h * 0.86;
    return (
      <g>
        <path
          d={`M ${t.x} ${t.y + 9} Q ${cx} ${t.y - 6} ${t.x + t.w} ${t.y + 9} L ${t.x + t.w} ${bottom} L ${t.x} ${bottom} Z`}
          fill={colors.clothing}
          {...OUTLINE}
        />
        <path
          d={`M ${cx - t.w * 0.16} ${t.y + 4} Q ${cx} ${t.y + 17} ${cx + t.w * 0.16} ${t.y + 4}`}
          fill="none"
          stroke={colors.clothingAccent}
          strokeWidth={4}
        />
        <path
          d={`M ${cx} ${t.y + 22} L ${cx + 5} ${t.y + 32} L ${cx + 16} ${t.y + 33} L ${cx + 8} ${t.y + 40} L ${cx + 10} ${t.y + 50} L ${cx} ${t.y + 45} L ${cx - 10} ${t.y + 50} L ${cx - 8} ${t.y + 40} L ${cx - 16} ${t.y + 33} L ${cx - 5} ${t.y + 32} Z`}
          fill={colors.clothingAccent}
        />
      </g>
    );
  },
};

const SCARF: AccessoryDef = {
  id: "scarf",
  label: "Scarf",
  slot: "torso",
  minLevel: "icon",
  // A scarf is worn on a neck, and the two fused-body species have none: the
  // band sits at the top of the chest box, and on a gem the chest box starts
  // where the mouth ends, so the scarf lands across the smile and reads as a
  // tongue. The bean gets away with it only because its box is far enough down
  // its belly. Refusing the item is the honest answer — the parent role drops
  // to its prop, which is a parent holding a mug rather than one wearing a
  // mistake.
  notFor: ["jalo"],
  incapableBecause: "the gem has no neck, and its chest box starts at the mouth",
  render: ({ anchors, colors, detail }) => {
    const t = anchors.torso;
    const cx = t.x + t.w / 2;
    return (
      <g>
        {detail !== "icon" && (
          <rect
            x={cx + t.w * 0.12}
            y={t.y + 5}
            width={13}
            height={28}
            rx={5}
            fill={colors.clothing}
            {...OUTLINE}
          />
        )}
        <rect
          x={cx - t.w * 0.4}
          y={t.y - 5}
          width={t.w * 0.8}
          height={15}
          rx={7.5}
          fill={colors.clothing}
          {...OUTLINE}
        />
        {detail === "full" && (
          <>
            <path
              d={`M ${cx - t.w * 0.2} ${t.y - 4} L ${cx - t.w * 0.2} ${t.y + 9}`}
              stroke={colors.clothingAccent}
              strokeWidth={3}
              opacity={0.7}
            />
            <path
              d={`M ${cx + t.w * 0.05} ${t.y - 4} L ${cx + t.w * 0.05} ${t.y + 9}`}
              stroke={colors.clothingAccent}
              strokeWidth={3}
              opacity={0.7}
            />
          </>
        )}
      </g>
    );
  },
};

const LANYARD: AccessoryDef = {
  id: "lanyard",
  label: "Lanyard",
  slot: "torso",
  minLevel: "simple",
  render: ({ anchors, colors, detail }) => {
    const t = anchors.torso;
    const cx = t.x + t.w / 2;
    const badgeY = t.y + t.h * 0.42;
    return (
      <g>
        <path
          d={`M ${cx - t.w * 0.3} ${t.y} L ${cx} ${badgeY + 2}`}
          stroke={colors.accent}
          strokeWidth={4}
          strokeLinecap="round"
          fill="none"
        />
        <path
          d={`M ${cx + t.w * 0.3} ${t.y} L ${cx} ${badgeY + 2}`}
          stroke={colors.accent}
          strokeWidth={4}
          strokeLinecap="round"
          fill="none"
        />
        <rect x={cx - 13} y={badgeY} width={26} height={19} rx={3.5} fill={MASCOT_INK.paper} {...OUTLINE} />
        <rect x={cx - 9.5} y={badgeY + 4} width={9} height={11} rx={2} fill={colors.accent} />
        {detail === "full" && (
          <>
            <rect x={cx + 2} y={badgeY + 5} width={8} height={3} rx={1.5} fill={MASCOT_INK.lineSoft} opacity={0.55} />
            <rect x={cx + 2} y={badgeY + 11} width={8} height={3} rx={1.5} fill={MASCOT_INK.lineSoft} opacity={0.55} />
          </>
        )}
      </g>
    );
  },
};

// --- back -----------------------------------------------------------------

const CAPE: AccessoryDef = {
  id: "cape",
  label: "Cape",
  slot: "back",
  minLevel: "icon",
  render: ({ anchors, colors }) => {
    const b = anchors.back;
    const half = b.w * 0.56;
    const hem = b.y + b.drop;
    return (
      <g>
        <path
          d={`M ${b.x - half} ${b.y} L ${b.x + half} ${b.y} L ${b.x + half * 1.5} ${hem} Q ${b.x} ${hem + 14} ${b.x - half * 1.5} ${hem} Z`}
          fill={colors.clothing}
          {...OUTLINE}
        />
        <rect
          x={b.x - half - 3}
          y={b.y - 8}
          width={half * 2 + 6}
          height={13}
          rx={6.5}
          fill={colors.clothingAccent}
          {...OUTLINE}
        />
      </g>
    );
  },
};

const BACKPACK: AccessoryDef = {
  id: "backpack",
  label: "Backpack",
  slot: "back",
  minLevel: "simple",
  render: ({ anchors, colors }) => {
    const b = anchors.back;
    const w = b.w * 1.24;
    const h = b.drop * 0.68;
    return (
      <g>
        <rect x={b.x - w / 2} y={b.y + 4} width={w} height={h} rx={12} fill={colors.clothing} {...OUTLINE} />
        <rect
          x={b.x - w * 0.3}
          y={b.y + h * 0.52}
          width={w * 0.6}
          height={h * 0.34}
          rx={6}
          fill={colors.clothingAccent}
          opacity={0.75}
        />
        <path
          d={`M ${b.x - 9} ${b.y + 4} Q ${b.x} ${b.y - 9} ${b.x + 9} ${b.y + 4}`}
          fill="none"
          stroke={colors.clothingAccent}
          strokeWidth={4.5}
          strokeLinecap="round"
        />
      </g>
    );
  },
};

// --- extra ----------------------------------------------------------------

const PUMPKIN: AccessoryDef = {
  id: "pumpkin",
  label: "Pumpkin",
  slot: "extra",
  minLevel: "simple",
  render: ({ anchors, colors }) => {
    const { x, y } = anchors.extra;
    const cy = y - 11;
    return (
      <g>
        <ellipse cx={x} cy={cy} rx={17} ry={14} fill={colors.clothingAccent} {...OUTLINE} />
        <path
          d={`M ${x - 6} ${cy - 13} Q ${x - 9} ${cy} ${x - 6} ${cy + 13}`}
          fill="none"
          stroke={MASCOT_INK.line}
          strokeWidth={1.8}
          opacity={0.5}
        />
        <path
          d={`M ${x + 6} ${cy - 13} Q ${x + 9} ${cy} ${x + 6} ${cy + 13}`}
          fill="none"
          stroke={MASCOT_INK.line}
          strokeWidth={1.8}
          opacity={0.5}
        />
        <path d={`M ${x} ${cy - 14} L ${x - 2} ${cy - 22} L ${x + 4} ${cy - 20} Z`} fill={colors.clothing} {...OUTLINE} />
        <path d={`M ${x - 9} ${cy - 2} L ${x - 3} ${cy - 2} L ${x - 6} ${cy + 4} Z`} fill={MASCOT_INK.line} />
        <path d={`M ${x + 9} ${cy - 2} L ${x + 3} ${cy - 2} L ${x + 6} ${cy + 4} Z`} fill={MASCOT_INK.line} />
      </g>
    );
  },
};

const SNOWDRIFT: AccessoryDef = {
  id: "snowdrift",
  label: "Snow",
  slot: "extra",
  minLevel: "simple",
  render: ({ rig, colors }) => {
    const s = rig.shadow;
    return (
      <g>
        <path
          d={`M ${s.cx - s.rx - 10} ${s.cy + 5} Q ${s.cx - s.rx * 0.5} ${s.cy - 11} ${s.cx} ${s.cy - 3} Q ${s.cx + s.rx * 0.6} ${s.cy - 13} ${s.cx + s.rx + 10} ${s.cy + 5} Z`}
          fill={colors.clothingAccent}
          opacity={0.9}
        />
        <g fill={colors.clothingAccent} opacity={0.75}>
          <circle cx={38} cy={44} r={3} />
          <circle cx={166} cy={72} r={2.4} />
          <circle cx={30} cy={110} r={2.2} />
          <circle cx={172} cy={26} r={2.8} />
        </g>
      </g>
    );
  },
};


// --- scene: the desk ------------------------------------------------------

/**
 * The complaint that produced this: a keyboard and mouse held in mid-air read
 * as a character who had picked them up rather than one who was using them.
 * Nothing was wrong with the props — what was missing was the desk.
 *
 * Furniture is deliberately painted out of the *device* neutrals rather than
 * the character's own colourway, for the same reason a controller is: a desk
 * tinted to match a mint bear is a mint desk behind a mint bear, which is no
 * desk at all. Only the trim takes the garment colours, which is enough to
 * keep it part of the same illustration and enough for a seasonal repaint to
 * reach it.
 */
function DeskSurface({ anchors, colors }: AccessoryContext): ReactElement {
  const { x, y, w } = anchors.scene;
  const left = x - w / 2;
  return (
    <g>
      <rect x={left} y={y} width={w} height={9} rx={4} fill={MASCOT_INK.deviceLight} />
      <rect x={left} y={y + 7} width={w} height={5} rx={2} fill={MASCOT_INK.device} />
      <rect
        x={left + 2}
        y={y + 6.4}
        width={w - 4}
        height={1.8}
        rx={0.9}
        fill={colors.clothingAccent}
        opacity={0.55}
      />
      <rect x={left + 10} y={y + 11} width={9} height={22} rx={3} fill={MASCOT_INK.device} />
      <rect x={left + w - 19} y={y + 11} width={9} height={22} rx={3} fill={MASCOT_INK.device} />
    </g>
  );
}

function GamerChair({ anchors, colors }: AccessoryContext): ReactElement {
  const { x, y } = anchors.scene;
  return (
    <g>
      <rect x={x - 38} y={y - 70} width={76} height={76} rx={18} fill={MASCOT_INK.device} />
      <rect x={x - 44} y={y - 62} width={15} height={58} rx={7} fill={MASCOT_INK.deviceLight} />
      <rect x={x + 29} y={y - 62} width={15} height={58} rx={7} fill={MASCOT_INK.deviceLight} />
      <rect x={x - 22} y={y - 88} width={44} height={21} rx={10} fill={MASCOT_INK.deviceLight} />
      <rect x={x - 24} y={y - 46} width={48} height={5} rx={2.5} fill={colors.clothing} opacity={0.85} />
      <rect x={x - 24} y={y - 30} width={48} height={5} rx={2.5} fill={colors.clothing} opacity={0.6} />
    </g>
  );
}

const DESK: AccessoryDef = {
  id: 'desk',
  label: 'Desk',
  slot: 'scene',
  minLevel: 'simple',
  render: (ctx) => <DeskSurface {...ctx} />,
  renderBehind: (ctx) => <GamerChair {...ctx} />,
};

const DESK_SETUP: AccessoryDef = {
  id: 'desk-setup',
  label: 'Desk + monitor',
  slot: 'scene',
  minLevel: 'simple',
  render: (ctx) => {
    const { x, y } = ctx.anchors.scene;
    return (
      <g>
        <DeskSurface {...ctx} />
        <rect x={x + 44} y={y - 4} width={16} height={12} rx={3} fill={MASCOT_INK.paper} />
        <rect x={x + 46} y={y - 2} width={12} height={8} rx={2} fill={ctx.colors.clothing} />
        <path
          d={`M ${x + 60} ${y + 1} q 5 2 0 5`}
          fill="none"
          stroke={MASCOT_INK.paper}
          strokeWidth={2}
          strokeLinecap="round"
        />
      </g>
    );
  },
  renderBehind: (ctx) => {
    const top = ctx.anchors.scene.y;
    return (
      <g>
        <GamerChair {...ctx} />
        <rect x={30} y={top - 4} width={12} height={6} rx={2} fill={MASCOT_INK.device} />
        <rect x={34} y={top - 22} width={4} height={20} rx={2} fill={MASCOT_INK.device} />
        <rect x={12} y={top - 56} width={48} height={36} rx={4} fill={MASCOT_INK.device} />
        <rect x={15} y={top - 53} width={42} height={30} rx={2} fill={ctx.colors.panel} />
        <rect x={19} y={top - 48} width={22} height={3} rx={1.5} fill={ctx.colors.clothingAccent} opacity={0.85} />
        <rect x={19} y={top - 41} width={32} height={3} rx={1.5} fill={ctx.colors.clothingAccent} opacity={0.6} />
        <rect x={19} y={top - 34} width={16} height={3} rx={1.5} fill={ctx.colors.clothingAccent} opacity={0.45} />
      </g>
    );
  },
};

// --- seasonal hats --------------------------------------------------------

const EARFLAP_HAT: AccessoryDef = {
  id: 'earflap-hat',
  label: 'Earflap hat',
  slot: 'hat',
  minLevel: 'icon',
  render: ({ anchors, colors }) => {
    const { x, y, w } = anchors.hat;
    const half = w / 2;
    return (
      <g>
        <path
          d={`M ${x - half - 3} ${y + 10} Q ${x} ${y - 34} ${x + half + 3} ${y + 10} Z`}
          fill={colors.clothing}
          {...OUTLINE}
        />
        <rect
          x={x - half - 7}
          y={y + 4}
          width={w + 14}
          height={11}
          rx={5.5}
          fill={colors.clothingAccent}
          {...OUTLINE}
        />
        {/* The flaps are the hat, not its trim. `clothingAccent` is derived as
            a near-white tint of the garment wherever a row or a fleet member
            sets one, so painting them with it left four fifths of the hat pale
            and the dome stranded as the only coloured part of its own hat. */}
        <path
          d={`M ${x - half - 5} ${y + 14} q -3 14 3 20 q 6 3 8 -3`}
          fill={colors.clothing}
          {...OUTLINE}
        />
        <path
          d={`M ${x + half + 5} ${y + 14} q 3 14 -3 20 q -6 3 -8 -3`}
          fill={colors.clothing}
          {...OUTLINE}
        />
        <circle cx={x} cy={y - 26} r={6} fill={colors.clothingAccent} {...OUTLINE} />
      </g>
    );
  },
};

const SUNHAT: AccessoryDef = {
  id: 'sunhat',
  label: 'Sun hat',
  slot: 'hat',
  minLevel: 'icon',
  render: ({ anchors, colors }) => {
    const { x, y, w } = anchors.hat;
    return (
      <g>
        <path
          d={`M ${x - w * 0.42} ${y + 6} Q ${x} ${y - 24} ${x + w * 0.42} ${y + 6} Z`}
          fill={colors.clothing}
          {...OUTLINE}
        />
        <ellipse cx={x} cy={y + 7} rx={w * 0.82} ry={8} fill={colors.clothing} {...OUTLINE} />
        <ellipse cx={x} cy={y + 3} rx={w * 0.44} ry={5} fill={colors.clothingAccent} opacity={0.85} />
      </g>
    );
  },
};

const STUDENT_CAP: AccessoryDef = {
  id: 'student-cap',
  label: 'Ylioppilaslakki',
  slot: 'hat',
  minLevel: 'icon',
  render: ({ anchors, colors }) => {
    const { x, y, w } = anchors.hat;
    const half = w / 2;
    return (
      <g>
        <path
          d={`M ${x - half} ${y + 4} Q ${x} ${y - 22} ${x + half} ${y + 4} Z`}
          fill={MASCOT_INK.paper}
          {...OUTLINE}
        />
        <rect x={x - half - 4} y={y + 2} width={w + 8} height={7} rx={3.5} fill={MASCOT_INK.line} />
        <rect x={x - half - 8} y={y + 7} width={w + 16} height={4} rx={2} fill={MASCOT_INK.lineSoft} />
        <circle cx={x} cy={y - 16} r={3.4} fill={colors.accent} />
      </g>
    );
  },
};

const BUNNY_EARS: AccessoryDef = {
  id: 'bunny-ears',
  label: 'Bunny ears',
  slot: 'hat',
  minLevel: 'icon',
  render: ({ anchors, colors }) => {
    const { x, y } = anchors.hat;
    return (
      <g>
        <ellipse cx={x - 12} cy={y - 22} rx={7} ry={20} fill={colors.clothing} {...OUTLINE} />
        <ellipse cx={x + 12} cy={y - 22} rx={7} ry={20} fill={colors.clothing} {...OUTLINE} />
        <ellipse cx={x - 12} cy={y - 22} rx={3.2} ry={13} fill={colors.clothingAccent} />
        <ellipse cx={x + 12} cy={y - 22} rx={3.2} ry={13} fill={colors.clothingAccent} />
        <rect x={x - 16} y={y - 4} width={32} height={7} rx={3.5} fill={colors.clothingAccent} {...OUTLINE} />
      </g>
    );
  },
};

// --- seasonal extras ------------------------------------------------------

const LEAVES: AccessoryDef = {
  id: 'leaves',
  label: 'Falling leaves',
  slot: 'extra',
  minLevel: 'simple',
  render: ({ rig, colors }) => {
    const leaf = (cx: number, cy: number, rot: number, fill: string) => (
      <g key={`${cx}-${cy}`} transform={`rotate(${rot} ${cx} ${cy})`}>
        <path
          d={`M ${cx} ${cy - 7} Q ${cx + 7} ${cy} ${cx} ${cy + 7} Q ${cx - 7} ${cy} ${cx} ${cy - 7} Z`}
          fill={fill}
        />
        <path
          d={`M ${cx} ${cy - 6} L ${cx} ${cy + 6}`}
          stroke={MASCOT_INK.line}
          strokeWidth={1}
          opacity={0.4}
        />
      </g>
    );
    return (
      <g>
        {leaf(rig.shadow.cx - rig.shadow.rx - 12, rig.shadow.cy - 4, 20, colors.clothing)}
        {leaf(rig.shadow.cx + rig.shadow.rx + 10, rig.shadow.cy - 1, -35, colors.clothingAccent)}
        {leaf(36, 60, 40, colors.clothing)}
        {leaf(168, 96, -20, colors.clothingAccent)}
        {leaf(26, 126, 65, colors.clothingAccent)}
      </g>
    );
  },
};

const THAW: AccessoryDef = {
  id: 'thaw',
  label: 'Thaw + sprout',
  slot: 'extra',
  minLevel: 'simple',
  render: ({ rig, colors }) => {
    const s = rig.shadow;
    const sx = s.cx + s.rx + 12;
    return (
      <g>
        <ellipse cx={s.cx - s.rx - 6} cy={s.cy + 4} rx={20} ry={5} fill={colors.clothingAccent} opacity={0.55} />
        <ellipse cx={s.cx + s.rx + 8} cy={s.cy + 2} rx={12} ry={3.5} fill={colors.clothingAccent} opacity={0.4} />
        <path
          d={`M ${sx} ${s.cy + 2} q 0 -12 -1 -16`}
          fill="none"
          stroke={colors.clothing}
          strokeWidth={2.4}
          strokeLinecap="round"
        />
        <ellipse
          cx={sx - 5}
          cy={s.cy - 14}
          rx={5.5}
          ry={3.4}
          fill={colors.clothing}
          transform={`rotate(-28 ${sx - 5} ${s.cy - 14})`}
        />
        <ellipse
          cx={sx + 4}
          cy={s.cy - 17}
          rx={5}
          ry={3}
          fill={colors.clothing}
          transform={`rotate(22 ${sx + 4} ${s.cy - 17})`}
        />
      </g>
    );
  },
};

const MOSQUITO: AccessoryDef = {
  id: 'mosquito',
  label: 'Mosquito',
  slot: 'extra',
  minLevel: 'full',
  render: ({ rig, colors }) => {
    const x = Math.min(186, rig.head.x + rig.head.r + 22);
    const y = Math.max(14, rig.head.y - rig.head.r * 0.6);
    return (
      <g>
        <path
          d={`M ${x - 34} ${y + 28} q 14 -18 30 -8 q 12 8 2 -15`}
          fill="none"
          stroke={colors.accent}
          strokeWidth={1.6}
          strokeDasharray="3 4"
          strokeLinecap="round"
          opacity={0.7}
        />
        <ellipse cx={x} cy={y} rx={5} ry={2.6} fill={MASCOT_INK.line} transform={`rotate(-18 ${x} ${y})`} />
        <ellipse
          cx={x - 3}
          cy={y - 4}
          rx={4.5}
          ry={2}
          fill={MASCOT_INK.paper}
          opacity={0.75}
          transform={`rotate(-45 ${x - 3} ${y - 4})`}
        />
        <ellipse
          cx={x + 2}
          cy={y - 4}
          rx={4.5}
          ry={2}
          fill={MASCOT_INK.paper}
          opacity={0.75}
          transform={`rotate(-15 ${x + 2} ${y - 4})`}
        />
        <path d={`M ${x + 5} ${y + 1} l 5 3`} stroke={MASCOT_INK.line} strokeWidth={1.2} strokeLinecap="round" />
      </g>
    );
  },
};

const BONFIRE: AccessoryDef = {
  id: 'bonfire',
  label: 'Kokko',
  slot: 'extra',
  minLevel: 'simple',
  render: ({ anchors, colors }) => {
    const { x, y } = anchors.extra;
    return (
      <g>
        <path
          d={`M ${x - 16} ${y - 2} L ${x + 16} ${y - 10}`}
          stroke={MASCOT_INK.lineSoft}
          strokeWidth={5}
          strokeLinecap="round"
        />
        <path
          d={`M ${x - 16} ${y - 10} L ${x + 16} ${y - 2}`}
          stroke={MASCOT_INK.lineSoft}
          strokeWidth={5}
          strokeLinecap="round"
        />
        <path
          d={`M ${x} ${y - 42} q 11 13 8 21 q -2 8 -8 9 q -6 -1 -8 -9 q -3 -8 8 -21 Z`}
          fill={colors.clothing}
        />
        <path
          d={`M ${x} ${y - 29} q 5 7 3 12 q -1 4 -3 4 q -2 0 -3 -4 q -2 -5 3 -12 Z`}
          fill={colors.clothingAccent}
        />
      </g>
    );
  },
};

const GIFT: AccessoryDef = {
  id: 'gift',
  label: 'Present',
  slot: 'extra',
  minLevel: 'simple',
  render: ({ anchors, colors }) => {
    const { x, y } = anchors.extra;
    return (
      <g>
        <rect x={x - 15} y={y - 27} width={30} height={26} rx={3} fill={colors.clothing} {...OUTLINE} />
        <rect x={x - 3.5} y={y - 27} width={7} height={26} fill={colors.clothingAccent} />
        <rect x={x - 15} y={y - 17} width={30} height={6} fill={colors.clothingAccent} />
        <path
          d={`M ${x} ${y - 27} q -12 -12 -2 -12 q 6 1 2 12 q 4 -11 10 -12 q 10 0 -2 12 Z`}
          fill={colors.clothingAccent}
          {...OUTLINE}
        />
      </g>
    );
  },
};

const CANDLES: AccessoryDef = {
  id: 'candles',
  label: 'Two candles',
  slot: 'extra',
  minLevel: 'simple',
  render: ({ anchors, colors }) => {
    const { x, y } = anchors.extra;
    const candle = (cx: number) => (
      <g key={cx}>
        <rect x={cx - 4} y={y - 30} width={8} height={22} rx={2} fill={MASCOT_INK.paper} />
        <path d={`M ${cx} ${y - 40} q 5 6 0 10 q -5 -4 0 -10 Z`} fill={colors.clothingAccent} />
      </g>
    );
    return (
      <g>
        <rect x={x - 17} y={y - 9} width={34} height={8} rx={3} fill={colors.clothing} {...OUTLINE} />
        {candle(x - 8)}
        {candle(x + 8)}
      </g>
    );
  },
};

const EGG: AccessoryDef = {
  id: 'egg',
  label: 'Painted egg',
  slot: 'extra',
  minLevel: 'simple',
  render: ({ anchors, colors }) => {
    const { x, y } = anchors.extra;
    const cy = y - 14;
    return (
      <g>
        <path
          d={`M ${x} ${cy - 15} q 11 8 11 17 a 11 13 0 0 1 -22 0 q 0 -9 11 -17 Z`}
          fill={colors.clothing}
          {...OUTLINE}
        />
        <path d={`M ${x - 10} ${cy} q 10 6 20 0`} fill="none" stroke={colors.clothingAccent} strokeWidth={2.6} />
        <path
          d={`M ${x - 9} ${cy + 7} q 9 5 18 0`}
          fill="none"
          stroke={colors.clothingAccent}
          strokeWidth={2.2}
          opacity={0.8}
        />
      </g>
    );
  },
};

const BALLOONS: AccessoryDef = {
  id: 'balloons',
  label: 'Balloons',
  slot: 'back',
  minLevel: 'simple',
  render: ({ anchors, colors }) => {
    const { x, y } = anchors.back;
    const balloon = (bx: number, by: number, fill: string) => (
      <g key={bx}>
        <path
          d={`M ${bx} ${by + 32} Q ${bx + 6} ${by + 22} ${bx} ${by + 13}`}
          fill="none"
          stroke={MASCOT_INK.lineSoft}
          strokeWidth={1.2}
        />
        <ellipse cx={bx} cy={by} rx={10} ry={12.5} fill={fill} {...OUTLINE} />
        <ellipse cx={bx - 3} cy={by - 4} rx={2.6} ry={3.4} fill={MASCOT_INK.paper} opacity={0.5} />
      </g>
    );
    return (
      <g>
        {/* Off to one side rather than centred: the back slot draws behind the
            character, and a balloon directly above the head is a balloon
            entirely hidden by the head. */}
        {balloon(x + 40, y - 40, colors.clothing)}
        {balloon(x + 58, y - 56, colors.clothingAccent)}
        {balloon(x + 34, y - 64, colors.accent)}
      </g>
    );
  },
};


// --- the legacy SOG hats --------------------------------------------------

/**
 * The four hats the old School of Gaming mascot was told apart by.
 *
 * That mascot was one black blob wearing nine different things, and the hat
 * was not decoration on it — it *was* the character. Which is exactly the
 * argument for bringing them in as accessories rather than as part of a
 * species: a hat that carried a whole identity for five years will carry one
 * on a bear or on a folded plane too, and the moment it lives in this
 * registry every concept inherits all four.
 *
 * They are drawn from the `hat` anchor like everything else here, so they
 * scale with whatever head they land on and know nothing about the pose.
 */

/**
 * The signature: a soft cap whose peak sweeps a whole head's width to the
 * viewer's left and turns up at the tip.
 *
 * The peak is the entire point of this hat and it is the part that is easy to
 * get wrong. Two things make it read: the top edge is *concave* — it dips
 * where it leaves the dome and lifts again at the tip, which is what makes it
 * look blown back rather than merely long — and it tapers to an actual point
 * rather than to a rounded end. Its length is a fraction of the head's own
 * width so it stays in proportion on a narrow head, and then capped, because
 * on the widest head in the set an unbounded sweep runs off the canvas.
 */
const SWEPT_CAP: AccessoryDef = {
  id: 'swept-cap',
  label: 'Swept cap',
  slot: 'hat',
  minLevel: 'icon',
  render: ({ anchors, colors }) => {
    const { x, y, w } = anchors.hat;
    const half = w / 2;
    // How far past the head the peak reaches. A fraction of the head so it
    // stays in proportion, then capped, because the canvas has an edge and
    // the widest head in the set would otherwise sweep straight off it.
    const len = Math.min(w * 0.52, 44);
    const tip = x - half - len;
    return (
      <g fill={colors.clothing}>
        {/* The peak, drawn first so the dome's edge closes over its root. */}
        <path
          d={[
            `M ${x - half * 0.85} ${y - 3}`,
            `C ${x - half * 1.18} ${y + 1} ${tip + len * 0.28} ${y + 13} ${tip} ${y + 2}`,
            `C ${tip + len * 0.22} ${y + 15} ${x - half * 1.06} ${y + 22} ${x - half * 0.78} ${y + 15}`,
            'Z',
          ].join(' ')}
        />
        <path
          d={[
            `M ${x - half * 1.02} ${y + 10}`,
            `C ${x - half * 1.06} ${y - 18} ${x - half * 0.5} ${y - 36} ${x + half * 0.14} ${y - 31}`,
            `C ${x + half * 0.78} ${y - 26} ${x + half * 1.06} ${y - 6} ${x + half} ${y + 11}`,
            'Z',
          ].join(' ')}
        />
      </g>
    );
  },
};

/**
 * A single tapered blade rising off the crown, with one leaflet at its base.
 *
 * A sprout rather than a tuft of hair: it widens slightly on the way up and
 * rounds off, which is what a growing shoot does and what a hair tuft never
 * does. On the species named after a bud it is the identity landmark; on
 * anything else it is the cheapest possible "this one is the plant one".
 */
const SPROUT: AccessoryDef = {
  id: 'sprout',
  label: 'Sprout',
  slot: 'hat',
  minLevel: 'icon',
  render: ({ anchors, colors }) => {
    const { x, y } = anchors.hat;
    return (
      <g fill={colors.clothing}>
        {/* The leaflet, under the blade so their join disappears. */}
        <path
          d={`M ${x - 11} ${y + 2} C ${x - 23} ${y - 1} ${x - 30} ${y - 8} ${x - 31} ${y - 16} C ${x - 20} ${y - 15} ${x - 12} ${y - 9} ${x - 8} ${y - 1} Z`}
        />
        <path
          d={[
            `M ${x - 12} ${y + 6}`,
            `C ${x - 15} ${y - 9} ${x - 15} ${y - 24} ${x - 8} ${y - 32}`,
            `C ${x} ${y - 41} ${x + 14} ${y - 35} ${x + 11} ${y - 21}`,
            `C ${x + 9} ${y - 12} ${x + 9} ${y - 3} ${x + 11} ${y + 6}`,
            'Z',
          ].join(' ')}
        />
      </g>
    );
  },
};

/**
 * A beret: a soft disc pulled down on one side, with the little stalk on top.
 *
 * The stalk is what stops it reading as a pancake. It is drawn in the trim
 * colour so it survives being the same hue as the cap on a flat render.
 */
const BERET: AccessoryDef = {
  id: 'beret',
  label: 'Beret',
  slot: 'hat',
  minLevel: 'icon',
  render: ({ anchors, colors }) => {
    const { x, y, w } = anchors.hat;
    const half = w / 2;
    return (
      <g>
        {/* The stalk. Short, and rooted under the dome — a long one reads as
            an aerial, and one that starts outside the dome floats. */}
        <path
          d={`M ${x + half * 0.06} ${y - 24} L ${x + half * 0.24} ${y - 36} L ${x + half * 0.34} ${y - 20} Z`}
          fill={colors.clothing}
        />
        <path
          d={[
            `M ${x - half * 0.92} ${y + 6}`,
            `C ${x - half} ${y - 16} ${x - half * 0.3} ${y - 27} ${x + half * 0.28} ${y - 24}`,
            `C ${x + half * 0.88} ${y - 21} ${x + half * 1.08} ${y - 4} ${x + half * 0.88} ${y + 7}`,
            `C ${x + half * 0.4} ${y + 16} ${x - half * 0.4} ${y + 16} ${x - half * 0.92} ${y + 6}`,
            'Z',
          ].join(' ')}
          fill={colors.clothing}
        />
      </g>
    );
  },
};

/**
 * A painter's cap: a big soft dome that overhangs the head, gathered into a
 * scalloped lower edge, with a button where the panels meet.
 *
 * Deliberately larger and looser than the beret, because on a fleet where two
 * characters wear a soft round hat the only thing telling them apart at
 * portrait size is how far the hat overhangs.
 */
const PAINTER_CAP: AccessoryDef = {
  id: 'painter-cap',
  label: "Painter's cap",
  slot: 'hat',
  minLevel: 'icon',
  render: ({ anchors, colors }) => {
    const { x, y, w } = anchors.hat;
    const half = w / 2;
    return (
      <g>
        <path
          d={[
            `M ${x - half * 1.04} ${y + 2}`,
            `C ${x - half * 1.1} ${y - 26} ${x - half * 0.6} ${y - 42} ${x + half * 0.08} ${y - 40}`,
            `C ${x + half * 0.76} ${y - 38} ${x + half * 1.12} ${y - 18} ${x + half * 1.06} ${y + 3}`,
            `q ${-half * 0.26} 9 ${-half * 0.52} 1`,
            `q ${-half * 0.26} 9 ${-half * 0.52} 1`,
            `q ${-half * 0.26} 9 ${-half * 0.52} 1`,
            `q ${-half * 0.26} 9 ${-half * 0.52} -6`,
            'Z',
          ].join(' ')}
          fill={colors.clothing}
        />
        <circle cx={x - half * 0.24} cy={y - 25} r={7} fill={colors.clothingAccent} />
      </g>
    );
  },
};

// --- the school's own hats ------------------------------------------------

/**
 * The SOG beanie — the hat the legacy sog.gg site puts on its own mascot.
 *
 * Read off the reference at working size: one soft amber dome, wider than the
 * head and pulled down over it, with a small round nub off to one side at the
 * top and a near-black badge patch across the front carrying the stripe-S in
 * amber. No brim, no band, no seam — the whole hat is three shapes, and two of
 * them are the same colour, so what a viewer actually sees is a lopsided
 * silhouette with one dark mark on it.
 *
 * It keeps the id `cap` because that is what every wearer already asks for and
 * because it is still the same thing it always was: the piece of clothing that
 * is *uniform* rather than costume. What changed is the earlier note's
 * conclusion. That version left the front panel deliberately blank, on the
 * argument that a mark drawn into an illustration is a logo baked into a
 * design system. The company's own site had already answered: the mark on the
 * hat is the point of the hat, and the badge is a placed brand path rather
 * than letters drawn by hand — it comes from `sog-badge-mark-filled.svg` and
 * `SX3-bare.svg` through the same helper the chest crest uses, so a retune of
 * the mark reaches the hat instead of stranding a hand-traced copy.
 *
 * The patch's own colours are fixed rather than taken from the wearer: a badge
 * is the same badge on every head, and near-black under brand gold is the one
 * pair that reads on top of any garment colour a caller might dye the beanie.
 * The letter needs about a fifth of the head's width to survive, so it is
 * drawn from `simple` up and the patch goes blank below that; at icon size
 * there is no patch at all, only the dome.
 */
const CAP: AccessoryDef = {
  id: 'cap',
  label: 'SOG beanie',
  slot: 'hat',
  minLevel: 'icon',
  render: ({ anchors, colors, detail }) => {
    const { x, y, w } = anchors.hat;
    const half = w / 2;
    const patchW = Math.min(half * 1.15, 36);
    const patchY = y - 7;
    return (
      <g>
        {/* The nub, drawn first and in the dome's own colour: it is a bump in
            the silhouette rather than a pom, which is what makes this beanie
            lopsided the way the reference is. */}
        <circle cx={x - half * 0.46} cy={y - 28} r={half * 0.3} fill={colors.clothing} />
        <path
          d={[
            `M ${x - half * 1.06} ${y + 9}`,
            `C ${x - half * 1.14} ${y - 34} ${x + half * 1.14} ${y - 34} ${x + half * 1.06} ${y + 9}`,
            'Z',
          ].join(' ')}
          fill={colors.clothing}
        />
        {detail !== 'icon' && (
          <g
            transform={`translate(${x} ${patchY}) scale(${patchW / SOG_BADGE_BOX.w}) translate(${-SOG_BADGE_BOX.cx} ${-SOG_BADGE_BOX.cy})`}
            fill={MASCOT_INK.line}
          >
            <path d={SOG_BADGE} />
          </g>
        )}
        {detail === 'full' && (
          <g
            transform={`translate(${x} ${patchY}) scale(${(patchW * 0.52) / SOG_S_BOX.w}) translate(${-SOG_S_BOX.cx} ${-SOG_S_BOX.cy})`}
            fill={BRAND_GOLD}
          >
            {SOG_S.map((d) => (
              <path key={d.slice(0, 24)} d={d} />
            ))}
          </g>
        )}
      </g>
    );
  },
};

/**
 * A small gold crown, three points on a band.
 *
 * Reksi's landmark on the legacy site: the crowned T-rex wears one and nothing
 * else, and it is the whole reason a viewer knows which dinosaur they are
 * looking at. Gold here is the brand's own amber rather than the swatch
 * table's, because this is the company's mark on somebody's head rather than a
 * garment they picked.
 *
 * Three points rather than five. Five is what a crown has in a heraldry book
 * and what it cannot have at portrait size — at the width this sits on a
 * Kaveri elder (28 units) five points are three pixels apart at 64px and merge
 * into a comb. Three read as a crown down to icon size, which is the only test
 * that matters. The dots on the tips are jewels and are filigree: they appear
 * at `full` and nowhere else.
 */
const CROWN: AccessoryDef = {
  id: 'crown',
  label: 'Crown',
  slot: 'hat',
  minLevel: 'icon',
  render: ({ anchors, colors, detail }) => {
    const { x, y, w } = anchors.hat;
    const cw = Math.min(w * 0.66, 46);
    const half = cw / 2;
    const tips = [
      { cx: x - half, cy: y - 12 },
      { cx: x, cy: y - 20 },
      { cx: x + half, cy: y - 12 },
    ];
    return (
      <g>
        <path
          d={[
            `M ${x - half} ${y + 2}`,
            `L ${x - half} ${y - 12}`,
            `L ${x - half * 0.5} ${y - 3}`,
            `L ${x} ${y - 20}`,
            `L ${x + half * 0.5} ${y - 3}`,
            `L ${x + half} ${y - 12}`,
            `L ${x + half} ${y + 2}`,
            'Z',
          ].join(' ')}
          fill={BRAND_GOLD}
          stroke={BRAND_GOLD}
          strokeWidth={3.2}
          strokeLinejoin="round"
        />
        <rect x={x - half - 1} y={y - 1} width={cw + 2} height={8} rx={3.5} fill={BRAND_GOLD} />
        {showsFiligree(detail) &&
          tips.map((t) => (
            <circle key={t.cx} cx={t.cx} cy={t.cy} r={2.8} fill={colors.clothingAccent} />
          ))}
      </g>
    );
  },
};

/**
 * A straw hat: a brim wider than any other hat here, a low crown, a band.
 *
 * The brim is the entire identity and it has to be *implausibly* wide, because
 * at portrait size a brim only a little wider than the head reads as a bucket
 * hat. Nothing else in the registry is allowed to be this wide, which is what
 * makes it nameable at a glance.
 *
 * Straw is `clothing` rather than a fixed colour, like every other garment
 * here - the gardener's own straw hue is set where she is dressed, not
 * hard-coded into the hat, so the same shape can be a sun hat in whatever
 * colour a season asks for.
 *
 * The brim is drawn a step darker than the crown, which the first raster
 * showed is not optional. One flat colour across both makes the crown
 * disappear into the brim and the whole thing reads as a ring balanced on the
 * head - a hat needs a top, and on a flat drawing the only way to say a
 * surface is turned away from you is to paint it darker.
 */
const STRAW_HAT: AccessoryDef = {
  id: 'straw-hat',
  label: 'Straw hat',
  slot: 'hat',
  minLevel: 'icon',
  render: ({ anchors, colors, detail }) => {
    const { x, y, w } = anchors.hat;
    const brim = w * 0.95;
    return (
      <g>
        <ellipse cx={x} cy={y + 7} rx={brim} ry={11} fill={shadeHex(colors.clothing, 0.2)} {...OUTLINE} />
        {showsFiligree(detail) && (
          <g stroke={MASCOT_INK.line} strokeWidth={1.2} opacity={0.26} fill="none">
            <path d={`M ${x - brim * 0.92} ${y + 7} L ${x + brim * 0.92} ${y + 7}`} />
            <path d={`M ${x - brim * 0.66} ${y + 12} L ${x + brim * 0.66} ${y + 12}`} />
          </g>
        )}
        <path
          d={`M ${x - w * 0.44} ${y + 8} C ${x - w * 0.46} ${y - 34} ${x + w * 0.46} ${y - 34} ${x + w * 0.44} ${y + 8} Z`}
          fill={colors.clothing}
          {...OUTLINE}
        />
        <rect
          x={x - w * 0.43}
          y={y - 2}
          width={w * 0.86}
          height={9}
          rx={4.5}
          fill={colors.clothingAccent}
        />
      </g>
    );
  },
};

// --- the ground, when something is standing on it -------------------------

/**
 * The painter's bucket, off `maalari`.
 *
 * It is an `extra` and not part of the brush prop, which is the one decision
 * in it worth writing down. A held prop is drawn inside a group the pose may
 * rotate - `hold-up` sways whatever is in the hand by three degrees about its
 * own bounding box - and a bucket sharing that box would slide across the
 * floor twice a second. The ground does not move, so a bucket standing on it
 * behaves like a bucket.
 *
 * It is also the one ground item that stands on the *right*. Everything else
 * in this slot uses the ground anchor, which is off the character's left
 * foot; that is exactly where the `painting` pose puts the working arm and
 * where both painting scenes put the surface being painted, so the bucket
 * would be underneath the brush. It mirrors the anchor rather than inventing
 * a position, so it lands the same distance out on every species.
 *
 * The paint is `clothing`, the same slot the brush's bristles take, so the
 * two are dyed by one value and cannot come out as two different colours of
 * the same paint. That it is a garment slot is the point: a fleet member's
 * swatch and a strip row's garment both land there, so the paint is always
 * one of the product's own colours and never reaches the identity core.
 */
const PAINT_BUCKET: AccessoryDef = {
  id: 'paint-bucket',
  label: 'Paint bucket',
  slot: 'extra',
  minLevel: 'simple',
  render: ({ anchors, rig, colors }) => {
    const x = 2 * rig.shadow.cx - anchors.extra.x;
    const y = anchors.extra.y;
    const top = y - 25;
    return (
      <g>
        <path
          d={`M ${x - 15} ${top + 3} C ${x - 24} ${top - 5} ${x + 24} ${top - 5} ${x + 15} ${top + 3}`}
          fill="none"
          stroke={MASCOT_INK.lineSoft}
          strokeWidth={2.4}
          strokeLinecap="round"
        />
        <path
          d={`M ${x - 14} ${top} L ${x + 14} ${top} L ${x + 11} ${y + 1} L ${x - 11} ${y + 1} Z`}
          fill={MASCOT_SCENERY.stone}
          {...OUTLINE}
        />
        <ellipse cx={x} cy={top} rx={14} ry={4.4} fill={colors.clothing} {...OUTLINE} />
        <rect x={x - 12.6} y={top + 12} width={25} height={6} rx={3} fill={colors.clothing} />
        <path d={`M ${x + 9} ${top + 4} q 5 8 0 14 q -5 -6 0 -14 Z`} fill={colors.clothing} />
        <ellipse cx={x + 21} cy={y + 1} rx={8} ry={3} fill={colors.clothing} opacity={0.85} />
      </g>
    );
  },
};

/**
 * A book lying open on the ground with a shoot growing out of its pages.
 *
 * The gardener of a games club does not tend a flowerbed, she tends the
 * stories, and this is that sentence drawn rather than captioned. It sits at
 * her feet rather than in her hands on purpose: a thing you are holding is a
 * thing you are using, and a thing planted beside you is a thing you are
 * looking after.
 *
 * The leaves are the product's own green rather than a garment slot. A sprout
 * is green the way the bucket's tin is metal - it is scenery, not clothing,
 * and a gamer dyeing their hat should not be able to dye a plant.
 */
const STORY_SPROUT: AccessoryDef = {
  id: 'story-sprout',
  label: 'Book with a sprout',
  slot: 'extra',
  minLevel: 'simple',
  render: ({ anchors, colors, detail }) => {
    const { x, y } = anchors.extra;
    const stem = swatchHex('green');
    const leaf = swatchHex('emerald');
    return (
      <g>
        <path
          d={`M ${x - 21} ${y + 1} L ${x} ${y - 8} L ${x} ${y + 1} L ${x - 21} ${y + 9} Z`}
          fill={MASCOT_INK.paper}
          {...OUTLINE}
        />
        <path
          d={`M ${x + 21} ${y + 1} L ${x} ${y - 8} L ${x} ${y + 1} L ${x + 21} ${y + 9} Z`}
          fill={MASCOT_INK.paper}
          {...OUTLINE}
        />
        <path
          d={`M ${x - 21} ${y + 5} L ${x} ${y - 3} L ${x + 21} ${y + 5} L ${x + 21} ${y + 9} L ${x} ${y + 1} L ${x - 21} ${y + 9} Z`}
          fill={colors.accent}
        />
        {showsFiligree(detail) && (
          <g fill={MASCOT_INK.lineSoft} opacity={0.4}>
            <rect x={x - 17} y={y - 2} width={12} height={2.4} rx={1.2} />
            <rect x={x + 5} y={y - 2} width={12} height={2.4} rx={1.2} />
          </g>
        )}
        <path
          d={`M ${x} ${y - 5} C ${x + 2} ${y - 14} ${x - 2} ${y - 21} ${x} ${y - 28}`}
          fill="none"
          stroke={stem}
          strokeWidth={2.6}
          strokeLinecap="round"
        />
        <path
          d={`M ${x - 1} ${y - 20} C ${x - 13} ${y - 23} ${x - 14} ${y - 32} ${x - 3} ${y - 30} Z`}
          fill={leaf}
        />
        <path
          d={`M ${x + 1} ${y - 26} C ${x + 13} ${y - 29} ${x + 14} ${y - 38} ${x + 3} ${y - 36} Z`}
          fill={stem}
        />
      </g>
    );
  },
};

// --- scenes: the door, and the board it was painted on --------------------

/**
 * The school door, off `ovi` - a plank door with a poster on it and a step at
 * its foot.
 *
 * The composition is the whole problem and it is deliberately not the legacy
 * one. That drawing has a door filling the frame and a very small mascot at
 * the bottom left; ours are drawn at a fixed size in the middle of the canvas
 * and stand nearly as tall as it, so a door that filled the frame would come
 * out about as wide as it is tall - a hatch, not a door. A door reads at
 * roughly two and a half times its own width, which at this height leaves
 * seventy units. So it stands to the viewer's left with the character at its
 * foot, overlapping its right edge, and the proportion survives.
 *
 * That also settles where everything on the leaf goes. Only the strip left of
 * about x=48 is clear of every species in the set (the widest bodies here run
 * 48 to 152), so the poster and the handle live in it, and the hinges - the
 * parts nobody needs to see whole - take the edge the character stands over.
 * The handle is therefore on the far side from the hinges, mirroring the
 * original; the alternative put a brass knob permanently behind a shoulder.
 *
 * The poster carries no lettering. It is SOG purple and SOG orange in blocks
 * with grey bars where words would be, which is how the `sign` prop already
 * draws copy - an illustration that spells out a wordmark is a logo somebody
 * will one day have to re-render.
 */
const DOOR_LEFT = 4;
const DOOR_W = 70;
const DOOR_TOP = 10;
/** Where the doorstep's top surface is, and therefore where the door ends. */
const STEP_Y = 185;

function Doorway({ colors, detail }: AccessoryContext): ReactElement {
  const leafX = DOOR_LEFT + 6;
  const leafW = DOOR_W - 12;
  const leafY = DOOR_TOP + 6;
  const seams = [0.25, 0.5, 0.75].map((f) => leafX + leafW * f);
  const posterX = DOOR_LEFT + 9;
  const posterY = 38;
  const posterW = 46;
  const posterH = 48;
  return (
    <g>
      <rect x={0} y={STEP_Y} width={200} height={9} fill={MASCOT_SCENERY.stone} />
      <rect
        x={DOOR_LEFT}
        y={DOOR_TOP}
        width={DOOR_W}
        height={STEP_Y - DOOR_TOP}
        rx={4}
        fill={MASCOT_SCENERY.woodDark}
      />
      <rect x={leafX} y={leafY} width={leafW} height={STEP_Y - leafY} fill={MASCOT_SCENERY.wood} />
      <g stroke={MASCOT_SCENERY.woodLine} strokeWidth={1.8} opacity={0.75}>
        {seams.map((sx) => (
          <path key={sx} d={`M ${sx} ${leafY} L ${sx} ${STEP_Y}`} />
        ))}
      </g>
      {showsFiligree(detail) && (
        <g stroke={MASCOT_SCENERY.woodLine} strokeWidth={1.1} fill="none" opacity={0.4}>
          <path d={`M ${leafX + 5} ${leafY + 26} q 4 16 0 32`} />
          <path d={`M ${leafX + 22} ${leafY + 96} q 5 14 1 28`} />
          <path d={`M ${leafX + 40} ${leafY + 40} q -4 18 0 34`} />
        </g>
      )}
      {/* Hinges on the edge the character stands over - the half of the door
          that can afford to be hidden. */}
      <rect x={leafX + leafW - 17} y={leafY + 26} width={17} height={7} rx={2} fill={MASCOT_INK.line} />
      <rect x={leafX + leafW - 17} y={STEP_Y - 48} width={17} height={7} rx={2} fill={MASCOT_INK.line} />
      <circle cx={leafX + 10} cy={112} r={6} fill={swatchHex('amber')} {...OUTLINE} />
      <rect x={leafX + 6.5} y={120} width={7.5} height={12} rx={3.5} fill={swatchHex('amber')} />
      <circle cx={leafX + 10.2} cy={125} r={1.8} fill={MASCOT_INK.line} />
      <g transform={`rotate(-4 ${posterX + posterW / 2} ${posterY + posterH / 2})`}>
        <rect
          x={posterX}
          y={posterY}
          width={posterW}
          height={posterH}
          rx={1.5}
          fill={MASCOT_INK.paper}
          stroke={MASCOT_INK.lineSoft}
          strokeWidth={1.4}
        />
        <rect x={posterX + 5} y={posterY + 6} width={24} height={15} rx={3} fill={swatchHex('purple')} />
        <circle cx={posterX + 37} cy={posterY + 13} r={7} fill={swatchHex('orange')} />
        <g fill={MASCOT_INK.lineSoft} opacity={0.45}>
          <rect x={posterX + 5} y={posterY + 27} width={36} height={4} rx={2} />
          <rect x={posterX + 5} y={posterY + 35} width={28} height={4} rx={2} />
          <rect x={posterX + 5} y={posterY + 43} width={20} height={4} rx={2} />
        </g>
        <circle
          cx={posterX + posterW / 2}
          cy={posterY + 2.5}
          r={2.6}
          fill={colors.clothingAccent}
          stroke={MASCOT_INK.line}
          strokeWidth={1.2}
        />
      </g>
    </g>
  );
}

const DOOR: AccessoryDef = {
  id: 'door',
  label: 'At the door',
  slot: 'scene',
  minLevel: 'simple',
  // The front of the step, and nothing else. It sits entirely below the soles,
  // so it closes the slab into a solid block of stone without cutting a single
  // foot in half - the desk's trick, at a height where there is nothing to
  // occlude.
  render: () => (
    <g>
      <rect x={0} y={STEP_Y + 7} width={200} height={2} fill={MASCOT_INK.shadow} opacity={0.35} />
      <rect x={0} y={STEP_Y + 8} width={200} height={9} fill={MASCOT_SCENERY.stoneDark} />
    </g>
  ),
  renderBehind: (ctx) => <Doorway {...ctx} />,
};

/**
 * A board half-painted: the thing the painter is actually working on.
 *
 * The legacy `ovi` is not a door with a mascot standing near it. It is a
 * mascot who has *just painted the poster on it* - the brush is still
 * dripping and the bucket is still open at his feet - and that is the idea
 * worth keeping, because it says the characters make the things on this site
 * rather than decorate them.
 *
 * A door is a specific place, so it can only ever mean the school. A blank
 * board can mean anything a product surface needs it to: a page still being
 * built, an empty list, a club with nothing in it yet. So the mark on it is
 * unfinished on purpose - two strokes down and the third not started - and it
 * is painted from the same `clothing` slot the brush and the bucket take, so
 * the paint on the board is visibly the paint in the tin.
 *
 * It stands on the same side as the door and for the same reason: that is the
 * strip of canvas no species' body reaches into.
 */
function PaintBoard({ colors, detail }: AccessoryContext): ReactElement {
  const boardX = 6;
  const boardY = 30;
  const boardW = 68;
  const boardH = 116;
  const midX = boardX + boardW / 2;
  return (
    <g>
      <ellipse cx={100} cy={186} rx={46} ry={7} fill={MASCOT_INK.shadow} opacity={0.4} />
      <path
        d={`M ${boardX + 12} ${boardY + boardH} L ${boardX + 2} 186`}
        stroke={MASCOT_SCENERY.woodDark}
        strokeWidth={6}
        strokeLinecap="round"
      />
      <path
        d={`M ${boardX + boardW - 12} ${boardY + boardH} L ${boardX + boardW - 2} 186`}
        stroke={MASCOT_SCENERY.woodDark}
        strokeWidth={6}
        strokeLinecap="round"
      />
      {/* The brand's own corner rounding, off the wordmark — this board is a
          School of Gaming sign being painted, so it takes the radius a School
          of Gaming plate takes. The paper's radius is the board's less the
          five-unit inset, so the two curves stay concentric. See
          `BRAND_RADIUS`. */}
      <rect
        x={boardX}
        y={boardY}
        width={boardW}
        height={boardH}
        rx={brandRadius(boardW, boardH)}
        fill={MASCOT_SCENERY.wood}
      />
      <rect
        x={boardX + 5}
        y={boardY + 5}
        width={boardW - 10}
        height={boardH - 10}
        rx={brandRadius(boardW, boardH) - 5}
        fill={MASCOT_INK.paper}
      />
      {/* Two strokes down, the third not started. */}
      <path
        d={`M ${midX - 14} ${boardY + 30} L ${midX - 14} ${boardY + 82}`}
        stroke={colors.clothing}
        strokeWidth={11}
        strokeLinecap="round"
        fill="none"
      />
      <path
        d={`M ${midX - 6} ${boardY + 28} C ${midX + 22} ${boardY + 32} ${midX + 22} ${boardY + 80} ${midX - 6} ${boardY + 84}`}
        stroke={colors.clothing}
        strokeWidth={11}
        strokeLinecap="round"
        fill="none"
      />
      {showsFiligree(detail) && (
        <path
          d={`M ${midX - 14} ${boardY + 82} q -1 11 1 17`}
          stroke={colors.clothing}
          strokeWidth={3.4}
          strokeLinecap="round"
          fill="none"
          opacity={0.85}
        />
      )}
      <path
        d={`M ${midX - 20} ${boardY + 96} L ${midX + 10} ${boardY + 96}`}
        stroke={MASCOT_INK.lineSoft}
        strokeWidth={4}
        strokeLinecap="round"
        opacity={0.22}
        fill="none"
      />
    </g>
  );
}

const SIGN_PAINTING: AccessoryDef = {
  id: 'sign-painting',
  label: 'Half-painted board',
  slot: 'scene',
  minLevel: 'simple',
  // Spilt paint, in front of the feet. It is the only part of the scene that
  // belongs on the near side of the character, and it is what stops the board
  // reading as a poster hung on a wall behind someone.
  render: ({ colors }) => (
    <g fill={colors.clothing}>
      <ellipse cx={78} cy={190} rx={11} ry={3.4} opacity={0.9} />
      <ellipse cx={92} cy={195} rx={5} ry={2.2} opacity={0.75} />
      <circle cx={66} cy={194} r={2.4} opacity={0.7} />
    </g>
  ),
  renderBehind: (ctx) => <PaintBoard {...ctx} />,
};

// --- the engineer's kit ---------------------------------------------------

/**
 * A hardhat: a low dome, a short brim, and the ridge that runs over the crown.
 *
 * Kyle's ruling is that a hardhat is what a builder feels like, and the shape
 * has to earn that at portrait size, where a dome with a brim is also a
 * bowler, a bucket hat and a mushroom. Three flat blocks separate it from all
 * three:
 *
 * **The brim is short and it is wider than the dome on both sides.** A
 * hardhat's brim projects forward, which a front view cannot draw as
 * projection; it draws it as a lip that overhangs the head and dips in the
 * middle. Nine units of drop at the centre line. Longer and it eats the eyes
 * on the animal family, whose crown sits at y=44 with the top of the eye at
 * y=56.5 - the same measurement the captain's cap is cut against.
 *
 * **The dome is low.** About 0.55 of its own width, against the beanie's 0.8.
 * A tall dome on a small head is a chef's hat, and the two are neighbours in
 * this registry.
 *
 * **The ridge is the tell.** It is the one part no other hat here has, so it
 * is drawn as a colour block rather than as a line and at every detail level
 * including icon - a hairline crest would vanish at exactly the sizes the hat
 * has to survive. It is the same dome curve at a sixth of the width, so its
 * top meets the shell's top instead of floating below it.
 *
 * Shell in `clothing`, brim and ridge in `clothingAccent`, so the wearer's own
 * garment pair dresses it and one swatch is all a fleet entry has to name.
 * The brim is the paler of the pair rather than a shade darker, which is the
 * opposite of the straw hat and the sou'wester and is deliberate: those two
 * are soft hats whose brim is a surface turned away from you, and this one is
 * a moulded lip catching the light. It also keeps the brim off the shadow
 * under it on the dark ground, where a shaded brim disappeared into the head.
 *
 * Everything is a fraction of `crownW`, which runs 36 units on a narrow
 * animal head to 96 on Silmu, so this sits correctly on a flat voxel skull
 * and on a bean that is mostly forehead without a line of per-species code.
 */
const HARDHAT: AccessoryDef = {
  id: 'hardhat',
  label: 'Hardhat',
  slot: 'hat',
  minLevel: 'icon',
  render: ({ anchors, colors }) => {
    const { x, y, w } = anchors.hat;
    const half = w / 2;
    const brim = half * 1.24;
    const ridge = half * 0.17;
    const line = y + 5;
    // Height and brim drop are fractions of the crown, clamped, because
    // `crownW` runs 36 units on an owl to 96 on Silmu and neither a constant
    // nor a pure fraction survives that. A constant made the bean's hat a
    // pancake with a hairline lip; an unclamped fraction made the owl's a
    // traffic cone. A symmetric cubic reaches three quarters of the way to
    // its controls, so the control offset is the wanted height over 0.75.
    const dome = Math.min(Math.max(w * 0.56, 22), 34);
    const top = line - dome / 0.75;
    const drop = Math.min(Math.max(w * 0.2, 7), 14);
    return (
      <g>
        {/* The brim, drawn first so the shell sits on top of it. */}
        <path
          d={[
            `M ${x - brim} ${line - 2}`,
            `Q ${x} ${line + drop} ${x + brim} ${line - 2}`,
            `Q ${x} ${line + drop * 0.15} ${x - brim} ${line - 2}`,
            'Z',
          ].join(' ')}
          fill={colors.clothingAccent}
        />
        <path
          d={[
            `M ${x - half * 0.98} ${line}`,
            `C ${x - half * 1.02} ${top} ${x + half * 1.02} ${top} ${x + half * 0.98} ${line}`,
            'Z',
          ].join(' ')}
          fill={colors.clothing}
        />
        <path
          d={[
            `M ${x - ridge} ${line}`,
            `C ${x - ridge} ${top + 1.5} ${x + ridge} ${top + 1.5} ${x + ridge} ${line}`,
            'Z',
          ].join(' ')}
          fill={colors.clothingAccent}
        />
      </g>
    );
  },
};


/**
 * Goggles pushed up onto the forehead.
 *
 * Worn *up* rather than over the eyes, and that is the whole character note:
 * a person with goggles down is doing the dangerous bit right now, a person
 * with goggles up has just finished doing it and is talking to you. The face
 * stays the face, which also means this can be a `hat` rather than a `face`
 * item - it attaches at the crown, so every species in the set wears it
 * without a line of per-species code, including the one-eyed one where a pair
 * of lenses across the eye line would have been nonsense.
 *
 * The two hazards, both caught by rasterising:
 *
 * **Size.** `crownW` runs from 36 units on a narrow-headed animal to 96 on
 * Silmu, whose crown is most of its body. Lenses sized as a fraction of it
 * come out as swimming goggles on one and a monocle on the other, so the
 * radius is a fraction *clamped* to 8-15 units and the separation is derived
 * from the radius rather than from the head. The pair is therefore about the
 * same real size on everything, which is what an object worn on a face
 * actually is.
 *
 * **Not being eyes.** Two discs above two eyes is a four-eyed creature. The
 * defences are that the glass is a saturated cyan rather than white, that
 * there is no pupil in it, that a visible bridge joins the two, and that the
 * frames are the *same* colour as the strap they sit on - an eye in this
 * system is a white ellipse with a black pupil, so a pair of coloured discs
 * inside one continuous band does not collide with it. The first raster had
 * pale rims, which made two light rings with dark centres directly above two
 * light eyes with dark pupils, and the bear wearing them had four eyes. One
 * band, two lenses, is the shape that cannot be misread.
 *
 * The glass takes a fixed swatch instead of a garment slot, the way the
 * gardener's sprout takes the product's green: glass is a material, not
 * clothing, and a customiser dyeing a strap should not be able to dye the
 * lenses. The strap and the frames are garment colours, so the goggles still
 * belong to whoever is wearing them.
 */
const GOGGLE_GLASS = shadeHex(swatchHex('cyan'), 0.28);

const GOGGLES: AccessoryDef = {
  id: 'goggles',
  label: 'Goggles',
  slot: 'hat',
  minLevel: 'icon',
  // Never on a one-eyed species. Two lenses over one eye is the single most
  // identifying feature of a trademarked cartoon character, and this
  // directory's whole reason for renaming Silmu was to stop being mistaken
  // for it - so no amount of restyling makes goggles safe there. A hard rule
  // rather than a styling call: any future concept with `faceMode: "cyclops"`
  // joins this list when it is added. Everything two-eyed still wears them.
  notFor: ['silmu'] as const,
  incapableBecause:
    'Goggles on a one-eyed head recreate the trademarked Minion look, whatever the styling.',
  render: ({ anchors, colors, detail }) => {
    const { x, y, w } = anchors.hat;
    const half = w / 2;
    const r = Math.min(Math.max(w * 0.2, 8), 13);
    const gap = Math.max(r + 2.5, Math.min(half * 0.42, r + 6));
    const lensY = y + r * 0.75 + 2;
    // The strap is nearly flat rather than arched over the crown. An arched
    // one disappeared behind its own lenses and left two gold crumbs at the
    // temples; flat, it reads as one band crossing the head with the lenses
    // set into it, which is the read that survives a 28-pixel portrait.
    return (
      <g>
        <path
          d={`M ${x - half * 1.04} ${lensY + 3} Q ${x} ${lensY - r * 0.25} ${x + half * 1.04} ${lensY + 3}`}
          fill="none"
          stroke={shadeHex(colors.clothing, 0.22)}
          strokeWidth={r * 0.8}
          strokeLinecap="round"
        />
        <rect
          x={x - gap}
          y={lensY - r * 0.28}
          width={gap * 2}
          height={r * 0.56}
          fill={colors.clothing}
        />
        {[-gap, gap].map((dx) => (
          <g key={dx}>
            <circle
              cx={x + dx}
              cy={lensY}
              r={r}
              fill={colors.clothing}
              stroke={MASCOT_INK.line}
              strokeWidth={1.8}
            />
            <circle cx={x + dx} cy={lensY} r={r * 0.62} fill={GOGGLE_GLASS} />
          </g>
        ))}
        {showsFiligree(detail) && (
          <g fill={colors.clothingAccent}>
            <rect x={x - half * 0.94} y={lensY - 1.5} width={7} height={5} rx={2.5} />
            <rect x={x + half * 0.94 - 7} y={lensY - 1.5} width={7} height={5} rx={2.5} />
          </g>
        )}
      </g>
    );
  },
};

/**
 * A tool belt: a band at the hip, a buckle, a pouch and a hanging spanner.
 *
 * The cheapest item in this registry - the torso anchor already gives a box
 * and every other torso garment is drawn from the same four numbers - and it
 * earns its place by being the one costume cue that says *builder* below the
 * neck. It drops out at icon size, where it would be a two-pixel line across
 * a body, which is the same call the lanyard makes.
 *
 * The hanging tools are scenery metal rather than a garment colour, matching
 * the props they are copies of: the spanner in the character's hand and the
 * spanner on their hip have to be the same steel or the belt reads as
 * decoration.
 */
const TOOL_BELT: AccessoryDef = {
  id: 'tool-belt',
  label: 'Tool belt',
  slot: 'torso',
  minLevel: 'simple',
  render: ({ anchors, colors, detail }) => {
    const t = anchors.torso;
    const cx = t.x + t.w / 2;
    const beltY = t.y + t.h * 0.72;
    return (
      <g>
        <rect
          x={cx - t.w * 0.52}
          y={beltY}
          width={t.w * 1.04}
          height={10}
          rx={3}
          fill={colors.clothing}
          {...OUTLINE}
        />
        <rect
          x={cx - t.w * 0.42}
          y={beltY + 8}
          width={16}
          height={14}
          rx={3}
          fill={shadeHex(colors.clothing, 0.28)}
          {...OUTLINE}
        />
        <rect x={cx - 6} y={beltY - 2} width={12} height={14} rx={2.5} fill={colors.clothingAccent} {...OUTLINE} />
        {showsFiligree(detail) && (
          <>
            <rect
              x={cx + t.w * 0.26}
              y={beltY + 8}
              width={6}
              height={17}
              rx={3}
              fill={MASCOT_SCENERY.stone}
              {...OUTLINE}
            />
            <rect
              x={cx - t.w * 0.39}
              y={beltY + 12}
              width={10}
              height={3}
              rx={1.5}
              fill={colors.clothingAccent}
              opacity={0.7}
            />
          </>
        )}
      </g>
    );
  },
};

// --- scene: the engine room -----------------------------------------------

/**
 * The engine room: a reactor column, pipes, gauges and a console.
 *
 * The composition follows the desk's rule and the door's arithmetic. The
 * widest bodies in the set run from x=48 to x=152, so the two things that
 * have to be seen whole - the column and the instrument panel - live outside
 * that band, and everything that runs the full width of the canvas (the
 * ceiling pipe, the floor pipes, the floor itself) is either above the head
 * or behind the feet. The console is the one piece deliberately allowed to
 * touch the character: it is drawn in the near layer from x=118, so a wide
 * species overlaps it slightly and the room gains a depth cue that a
 * side-by-side arrangement cannot give.
 *
 * Its top is at y=156, below the y=148 the standing poses put the free hand
 * at. An earlier version had the surface at the hand line, which looked
 * correct in the coordinates and rasterised as a console eating the hand and
 * whatever it was holding.
 *
 * **The glow is three flat rectangles, not a filter.** Every accessory here
 * has to render inside an email, where a blur is either dropped or turns the
 * whole illustration into a raster; and a soft-edged bright column with
 * nothing else in it is a lava lamp. So the core is a hard-edged stack -
 * dark cyan, cyan, and a pale centre strip - inside a straight metal casing
 * with a cap, a base and three bands across it. The bands are what stop it
 * reading as liquid: light in a tube climbs, and a tube with steel rings
 * around it is a machine.
 *
 * Cyan comes from the swatch list rather than from the wearer, for the reason
 * furniture always does: a reactor tinted to match a mint bear is a mint
 * reactor. Only the console's own readouts take the character's colours,
 * which is exactly the split the desk already makes.
 */
const CORE_DEEP = shadeHex(swatchHex('cyan'), 0.55);
const CORE_MID = swatchHex('cyan');
const CORE_HOT = tintHex(swatchHex('cyan'), 0.68);
/** Where the column stands, and how wide. Clear of every body in the set. */
const COLUMN_X = 8;
const COLUMN_W = 50;
const RING_YS = [44, 92, 140];

function EngineRoom({ colors, detail }: AccessoryContext): ReactElement {
  return (
    <g>
      {/* floor, then the shadow on it: a scene suppresses the character's own */}
      <rect x={0} y={STEP_Y} width={200} height={9} fill={MASCOT_SCENERY.stone} />
      <rect x={0} y={162} width={200} height={11} rx={5.5} fill={MASCOT_SCENERY.stone} />
      <rect x={0} y={169} width={200} height={4} fill={MASCOT_SCENERY.stoneDark} />
      <rect x={64} y={159} width={9} height={17} rx={2} fill={MASCOT_SCENERY.stoneDark} />
      <rect x={146} y={159} width={9} height={17} rx={2} fill={MASCOT_SCENERY.stoneDark} />
      <rect x={0} y={176} width={200} height={7} rx={3.5} fill={MASCOT_SCENERY.stoneDark} />
      <ellipse cx={100} cy={186} rx={44} ry={7} fill={MASCOT_INK.shadow} opacity={0.4} />

      {/* the ceiling run, off the top of the column */}
      <rect x={COLUMN_X + 4} y={6} width={200 - COLUMN_X - 4} height={11} rx={5.5} fill={MASCOT_SCENERY.stone} />
      <rect x={170} y={14} width={9} height={30} rx={4} fill={MASCOT_SCENERY.stoneDark} />

      {/* the reactor column */}
      <rect x={COLUMN_X - 5} y={166} width={COLUMN_W + 10} height={19} rx={4} fill={MASCOT_SCENERY.stoneDark} />
      <rect x={COLUMN_X} y={14} width={COLUMN_W} height={157} rx={6} fill={MASCOT_INK.device} />
      <rect x={COLUMN_X + 9} y={22} width={COLUMN_W - 18} height={143} rx={4} fill={CORE_DEEP} />
      <rect x={COLUMN_X + 14} y={22} width={COLUMN_W - 28} height={143} rx={3} fill={CORE_MID} />
      <rect x={COLUMN_X + 20} y={22} width={COLUMN_W - 40} height={143} rx={3} fill={CORE_HOT} />
      {RING_YS.map((ry) => (
        <g key={ry}>
          <rect x={COLUMN_X - 6} y={ry} width={COLUMN_W + 12} height={13} rx={4} fill={MASCOT_INK.deviceLight} />
          <rect x={COLUMN_X - 6} y={ry + 9} width={COLUMN_W + 12} height={4} rx={2} fill={MASCOT_SCENERY.stoneDark} />
        </g>
      ))}
      <rect x={COLUMN_X - 5} y={4} width={COLUMN_W + 10} height={16} rx={4} fill={MASCOT_SCENERY.stone} />

      {/* the instrument panel, on the wall above the console */}
      <rect x={150} y={44} width={46} height={40} rx={4} fill={MASCOT_INK.device} />
      <circle cx={166} cy={62} r={11} fill={MASCOT_INK.paper} stroke={MASCOT_SCENERY.stone} strokeWidth={3.4} />
      <path
        d={`M 166 62 L ${166 - 6} ${62 - 7}`}
        stroke={colors.accent}
        strokeWidth={2.4}
        strokeLinecap="round"
      />
      <circle cx={186} cy={70} r={7} fill={MASCOT_INK.paper} stroke={MASCOT_SCENERY.stone} strokeWidth={3} />
      <path d="M 186 70 L 190 66" stroke={colors.accent} strokeWidth={2} strokeLinecap="round" />
      {showsFiligree(detail) && (
        <g fill={MASCOT_INK.lineSoft} opacity={0.5}>
          <rect x={165} y={52} width={2} height={4} rx={1} />
          <rect x={156} y={61} width={4} height={2} rx={1} />
          <rect x={172} y={61} width={4} height={2} rx={1} />
        </g>
      )}
    </g>
  );
}

const ENGINE_ROOM: AccessoryDef = {
  id: 'engine-room',
  label: 'Engine room',
  slot: 'scene',
  minLevel: 'simple',
  render: ({ colors, detail }) => (
    <g>
      <rect x={118} y={156} width={80} height={10} rx={3} fill={MASCOT_INK.deviceLight} />
      <rect x={122} y={163} width={74} height={22} rx={3} fill={MASCOT_INK.device} />
      <rect x={128} y={167} width={30} height={14} rx={2} fill={colors.panel} />
      <rect x={131} y={170} width={18} height={2.6} rx={1.3} fill={MASCOT_INK.line} opacity={0.45} />
      <rect x={131} y={175} width={12} height={2.6} rx={1.3} fill={MASCOT_INK.line} opacity={0.3} />
      <circle cx={168} cy={171} r={4} fill={colors.accent} />
      <circle cx={180} cy={171} r={4} fill={colors.spark} />
      <circle cx={168} cy={180} r={3.4} fill={colors.clothingAccent} opacity={0.75} />
      <circle cx={180} cy={180} r={3.4} fill={colors.accent} opacity={0.6} />
      {showsFiligree(detail) && (
        <g>
          <rect x={190} y={148} width={4} height={9} rx={2} fill={MASCOT_SCENERY.stoneDark} />
          <rect x={185} y={144} width={14} height={5} rx={2.5} fill={colors.accent} />
        </g>
      )}
      <rect x={0} y={STEP_Y + 7} width={200} height={2} fill={MASCOT_INK.shadow} opacity={0.35} />
      <rect x={0} y={STEP_Y + 8} width={200} height={9} fill={MASCOT_SCENERY.stoneDark} />
    </g>
  ),
  renderBehind: (ctx) => <EngineRoom {...ctx} />,
};

/**
 * The village: a red board house, a fence, and the ground between them.
 *
 * Every scene before this one is a piece of furniture a character stands at -
 * a desk, a door, a board, a console. This one is a *place*, and it is built
 * to hold more than one character at a time: the house sits in the left
 * quarter of the canvas and the fence in the right quarter, so the middle
 * third is empty and a second and third villager can be overlapped into it
 * without standing on anything. That is the whole point of the composition
 * this concept is drawn from - those pages are crowded with people doing
 * their own jobs in one frame, and a scene that only fits one figure cannot
 * ever be that.
 *
 * Flat colour blocks, no texture: no plank seams, no shingles, no grain, no
 * grass blades. Two things carry it instead - the red board wall against the
 * paper-white trim, which is what every farmhouse in this country does at its
 * corners and window frames, and one lit window, which is the only warm light
 * in the picture and the reason the house reads as somebody's rather than as
 * a shape.
 *
 * The ground follows the doorstep's trick exactly: the band the soles rest on
 * is drawn *behind* the character and the strip in front of it is drawn
 * *after*, low enough to be entirely below every species' sole, so the scene
 * closes into solid ground without cutting a single foot in half.
 */
const VILLAGE_GROUND_Y = 185;

function VillageBehind({ detail }: AccessoryContext): ReactElement {
  const wall = shadeHex(swatchHex('red'), 0.46);
  const trim = MASCOT_INK.paper;
  const pane = tintHex(swatchHex('amber'), 0.34);
  // The house runs off the left edge of the canvas on purpose. Drawn whole,
  // a cottage that fits inside 200 units next to a 166-unit villager reads as
  // a doll's house; cut by the frame it reads as a building the figure is
  // standing in front of. Same trick the reference pages use on every
  // interior - the room is always bigger than the picture.
  const houseL = -18;
  const houseR = 64;
  const eaves = 50;
  const winX = 12;
  const winY = 74;
  const winW = 30;
  const winH = 30;
  return (
    <g>
      {/* Ground. One band, no horizon line - a second tone up there would be
          a landscape, and this is a yard. */}
      <rect x={0} y={VILLAGE_GROUND_Y} width={200} height={12} fill={shadeHex(swatchHex('lime'), 0.66)} />
      {/* The house. Wall, then trim, then the roof over the top of both. */}
      <rect x={houseL + 4} y={eaves} width={houseR - houseL - 8} height={VILLAGE_GROUND_Y - eaves + 2} fill={wall} />
      <rect x={houseL + 4} y={eaves} width={7} height={VILLAGE_GROUND_Y - eaves + 2} fill={trim} />
      <rect x={houseR - 11} y={eaves} width={7} height={VILLAGE_GROUND_Y - eaves + 2} fill={trim} />
      <rect x={winX - 4} y={winY - 4} width={winW + 8} height={winH + 8} fill={trim} />
      <rect x={winX} y={winY} width={winW} height={winH} fill={pane} />
      <rect x={winX + winW / 2 - 1.6} y={winY} width={3.2} height={winH} fill={trim} />
      <rect x={winX} y={winY + winH / 2 - 1.6} width={winW} height={3.2} fill={trim} />
      {/* The door, in the same wood the fence is cut from. */}
      <rect x={houseR - 34} y={126} width={22} height={VILLAGE_GROUND_Y - 126 + 2} rx={2} fill={MASCOT_SCENERY.wood} />
      {/* Roof: one gable, overhanging both walls, plus the chimney that says
          somebody is in. */}
      <rect x={houseL + 20} y={16} width={12} height={22} fill={MASCOT_SCENERY.stoneDark} />
      <path
        d={`M ${houseL - 8} ${eaves + 4} L ${(houseL + houseR) / 2} ${12} L ${houseR + 8} ${eaves + 4} Z`}
        fill={MASCOT_SCENERY.stone}
      />
      <rect x={houseL - 8} y={eaves + 1} width={houseR - houseL + 16} height={5} fill={MASCOT_SCENERY.stoneDark} />
      {/* The fence, on the far side of the yard. Four pickets and one rail. */}
      <g fill={MASCOT_SCENERY.wood}>
        {[142, 158, 174, 190].map((px) => (
          <rect key={px} x={px} y={140} width={8} height={VILLAGE_GROUND_Y - 140 + 2} rx={3} />
        ))}
      </g>
      <rect x={138} y={152} width={62} height={6} fill={MASCOT_SCENERY.woodDark} />
      {showsFiligree(detail) && (
        // The one small thing happening at the edge of the frame, which is
        // what those pages are made of. A pot on the ground by the fence.
        <g>
          <path d="M 126 176 L 138 176 L 136 185 L 128 185 Z" fill={MASCOT_SCENERY.leather} />
          <rect x={124.5} y={172.5} width={15} height={4.5} rx={2} fill={MASCOT_SCENERY.leatherDark} />
        </g>
      )}
    </g>
  );
}

const VILLAGE: AccessoryDef = {
  id: 'village',
  label: 'In the village',
  slot: 'scene',
  minLevel: 'simple',
  render: () => (
    <g>
      <rect x={0} y={VILLAGE_GROUND_Y + 10} width={200} height={2} fill={MASCOT_INK.shadow} opacity={0.3} />
      <rect x={0} y={VILLAGE_GROUND_Y + 11} width={200} height={12} fill={shadeHex(swatchHex('lime'), 0.78)} />
    </g>
  ),
  renderBehind: (ctx) => <VillageBehind {...ctx} />,
};

/**
 * One spruce, as a flat zigzag. Three tiers, no texture, no trunk detail.
 *
 * The landscape reference (`jansson/j1.jpg`) carries its whole mood on three
 * or four flat values and leaves the moon as untouched paper — the only true
 * blacks in it are the far bank and the near leaves. So this scene is exactly
 * that: cut-paper shapes at two depths, a paper disc, and nothing drawn on any
 * of them.
 */
function spruce(x: number, baseY: number, h: number, w: number): string {
  return [
    `M ${x} ${baseY - h}`,
    `L ${x + w * 0.26} ${baseY - h * 0.62} L ${x + w * 0.15} ${baseY - h * 0.62}`,
    `L ${x + w * 0.38} ${baseY - h * 0.3} L ${x + w * 0.24} ${baseY - h * 0.3}`,
    `L ${x + w * 0.5} ${baseY} L ${x - w * 0.5} ${baseY}`,
    `L ${x - w * 0.24} ${baseY - h * 0.3} L ${x - w * 0.38} ${baseY - h * 0.3}`,
    `L ${x - w * 0.15} ${baseY - h * 0.62} L ${x - w * 0.26} ${baseY - h * 0.62}`,
    "Z",
  ].join(" ");
}

/**
 * Night on the shore — a moon, three spruces, a shoreline and the water in
 * front of it.
 *
 * Built for the pen-line species and usable by anything: it is a backdrop
 * rather than furniture, so unlike the desk it never has to occlude a leg. The
 * water is the one piece drawn in *front*, and it starts at y=186 — below
 * every species' soles — so it reads as a strip of lake between the viewer and
 * the character without ever cutting a foot off.
 *
 * The character stands in the gap the trees leave: two spruces to the far left
 * and one to the far right, none between x=70 and x=150.
 */
const FOREST_NIGHT: AccessoryDef = {
  id: "forest-night",
  label: "Forest night",
  slot: "scene",
  minLevel: "simple",
  // The very near, and the only true solids in the picture: two leaf shapes in
  // the bottom corners, in front of everything. The landscape reference spends
  // its blacks on exactly this — the nearest leaves and the furthest bank —
  // and never on the middle, which is where the character is.
  render: () => (
    <g fill={shadeHex(swatchHex("emerald"), 0.94)}>
      <path d="M 0 200 C 6 182 22 172 40 170 C 34 186 20 198 4 200 Z" />
      <path d="M 200 200 C 194 184 180 175 164 173 C 169 187 182 197 196 200 Z" />
    </g>
  ),
  renderBehind: () => (
    <g>
      {/* Paper, left alone — the one shape in the picture with nothing on it. */}
      <circle cx={168} cy={40} r={18} fill={MASCOT_INK.paper} opacity={0.92} />
      {/* Moonlit water, beyond the shore. */}
      <path
        d="M 0 152 C 40 148 70 157 110 153 C 148 150 176 157 200 153 L 200 178 L 0 178 Z"
        fill={shadeHex(swatchHex("blue"), 0.62)}
      />
      <path d={spruce(20, 178, 92, 36)} fill={shadeHex(swatchHex("emerald"), 0.86)} />
      <path d={spruce(52, 178, 58, 26)} fill={shadeHex(swatchHex("emerald"), 0.92)} />
      <path d={spruce(184, 178, 104, 42)} fill={shadeHex(swatchHex("emerald"), 0.86)} />
      {/* The bank the character is standing on. Drawn behind, so every sole
          lands on top of it whatever the species' foot line is. */}
      <path
        d="M 0 176 C 46 172 78 180 118 176 C 152 173 178 179 200 176 L 200 200 L 0 200 Z"
        fill={shadeHex(swatchHex("emerald"), 0.9)}
      />
    </g>
  ),
};

/**
 * The SOG crest — the stripe-S worn on the chest, superhero-style.
 *
 * Two things are lifted verbatim out of the brand files and neither is
 * redrawn: `SOG_S` is the pair of paths from `logo/SX3-bare.svg` (the S of the
 * SOG lockup, on its own, with the O and the G removed), and `SOG_BADGE` is
 * the amber field from `logo/sog-badge-mark-filled.svg`. Both are in the
 * logos' own coordinate systems, so each is placed by a `translate / scale /
 * translate` about its measured centre rather than by re-typing its numbers at
 * mascot scale — which is what keeps a retune of the mark reaching the
 * costume.
 *
 * Measured off those two files:
 *
 * | shape                | bounding box  | centre           |
 * | -------------------- | ------------- | ---------------- |
 * | the S, both paths    | 74.9 x 59.7   | (107.89, 85.7)   |
 * | the badge field      | 372.6 x 200.3 | (189.5, 103.5)   |
 *
 * **Two versions were drawn and rasterised on six species: the bare S in
 * `clothingAccent` straight onto the body, and the S on the badge field in
 * `clothing` — the superhero shield. The shield won and the bare one is not in
 * this file.** The bare S is the better-looking of the two on a person in a
 * contrasting top, and it fails outright everywhere else: an amber S on a
 * honey bear or on an olive voxel dinosaur is a mark you have to hunt for,
 * because a garment accent is chosen to sit against a *garment* and half this
 * fleet is wearing its own skin. The badge gives the letter a field of its own
 * and the two-colour pair then reads on any body in the set, which is the
 * whole job.
 *
 * The crest is fitted to `rig.torso` rather than to any species' own drawing,
 * so it lands on a chest, a belly, a chassis or a gem without any of them
 * knowing about it. Both dimensions are checked — a wide shallow box (the
 * bean's belly) is height-limited and a narrow deep one (a bug's thorax) is
 * width-limited — which is why the scale is a `Math.min` of the two rather
 * than a fraction of the width.
 */
const SOG_S = [
  "M137.8,64.5l-3.2,3.2c-1,1-2.2,1.5-3.6,1.5H87.6l-10.4,0.1c-1.1,0-2.2-0.3-3-1c-2.2-1.7-2.7-4.8-1-7.1l2.4-3.3c1-1.3,2.5-2,4.1-2h54.5c1.3,0,2.6,0.5,3.6,1.5C139.7,59.3,139.7,62.5,137.8,64.5z",
  "M144.1,100.2l-9.8,13.3c-1,1.3-2.5,2-4.1,2H75.7c-1.3,0-2.6-0.5-3.5-1.4c-2-2-2-5.2-0.1-7.2l3.2-3.3c1-1,2.2-1.5,3.6-1.5h41c1.5,0,2.9-0.7,3.8-1.8c1.6-1.9,1.7-4.6,0.1-6.5l-0.2-0.2c-1-1.2-2.4-1.9-4-1.9H79.3c-1.6,0-3.1-0.7-4.1-2l-1.7-2.3c-0.7-0.9-1-1.9-1-3c0-2.8,2.3-5.1,5.1-5.1l53.1,0.3c1.6,0,3.1,0.7,4.1,2l9.4,12.5C145.4,96,145.4,98.4,144.1,100.2z",
];
const SOG_S_BOX = { cx: 107.89, cy: 85.7, w: 74.9, h: 59.7 };

const SOG_BADGE =
  "M352.5,50.1L197.9,4.2c-4.4-1-9-1.1-13.4-0.2L27,47.6c-13.9,3-23.8,15.3-23.8,29.5v54.4c0,14.3,10,26.6,23.9,29.6l156.2,42.3c4.3,0.9,8.7,0.9,13,0l155.9-44.8c13.8-3.1,23.6-15.4,23.6-29.6V79.5C375.9,65.5,366.2,53.3,352.5,50.1z";
const SOG_BADGE_BOX = { cx: 189.5, cy: 103.5, w: 372.6, h: 200.3 };

/** Places one brand path by its own centre, at a given size on the chest. */
function brandMark(
  d: string | string[],
  box: { cx: number; cy: number; w: number; h: number },
  at: { x: number; y: number; scale: number },
  fill: string,
): ReactElement {
  const paths = Array.isArray(d) ? d : [d];
  return (
    <g
      transform={`translate(${at.x} ${at.y}) scale(${at.scale}) translate(${-box.cx} ${-box.cy})`}
      fill={fill}
    >
      {paths.map((path) => (
        <path key={path.slice(0, 24)} d={path} />
      ))}
    </g>
  );
}

const SOG_CREST: AccessoryDef = {
  id: "sog-crest",
  label: "SOG crest",
  slot: "torso",
  minLevel: "simple",
  render: ({ anchors, colors }) => {
    const t = anchors.torso;
    const cx = t.x + t.w / 2;
    const cy = t.y + t.h * 0.46;
    const shield = Math.min((t.w * 0.94) / SOG_BADGE_BOX.w, (t.h * 0.86) / SOG_BADGE_BOX.h);
    const letter = (shield * SOG_BADGE_BOX.w * 0.52) / SOG_S_BOX.w;
    return (
      <g>
        {brandMark(SOG_BADGE, SOG_BADGE_BOX, { x: cx, y: cy, scale: shield }, colors.clothing)}
        {brandMark(SOG_S, SOG_S_BOX, { x: cx, y: cy, scale: letter }, colors.clothingAccent)}
      </g>
    );
  },
};

// --- Saaristo: the archipelago pack ---------------------------------------

/**
 * Kyle: "It wouldn't be a character set in Finland without some sailor
 * characters or props who love exploring the islands in the Archipelago."
 *
 * This is deliberately a **theme pack and not a species**. There is no
 * archipelago animal, because the thing worth celebrating is what a Finnish
 * July does to whoever is already in the fleet: everybody goes to the water,
 * so everybody gets the hat. A bear, a bean, a folded plane and a person share
 * one hull, which is also the hardest test the outfit layer has had — four
 * different bodies, four different crown lines, one cap that knows nothing
 * about any of them.
 *
 * The garment/furniture split is the same one the desk and the village make.
 * The cap, the sou'wester, the shirt and the vest are dyed from `clothing` and
 * `clothingAccent`, so a season repaints the whole crew in one line; the boat
 * and the lighthouse are scenery-coloured, because a hull tinted to match
 * whoever climbed into it stops being a boat and becomes a costume.
 */

/**
 * A captain's cap: a flat-topped pale crown, a dark band, and a short stiff
 * peak.
 *
 * Every other peaked thing in this registry has a *domed* crown — the SOG
 * beanie, the swept cap, the sun hat — so the flat top does the whole job of
 * telling this one apart at 40px, and it is drawn flatter than a real one to
 * make sure it survives. The peak is short on purpose: measured against the
 * animal family's own numbers, its crown line is at y=44 and the top of its
 * eye at y=56.5, so anything hanging more than about ten units below the band
 * eats the face it is supposed to sit above.
 */
const CAPTAIN_CAP: AccessoryDef = {
  id: "captain-cap",
  label: "Captain's cap",
  slot: "hat",
  minLevel: "icon",
  render: ({ anchors, colors }) => {
    const { x, y, w } = anchors.hat;
    const half = w / 2;
    const band = y + 1;
    return (
      <g>
        <path
          d={[
            `M ${x - half * 0.98} ${band}`,
            `L ${x - half * 0.88} ${y - 21}`,
            `Q ${x} ${y - 27} ${x + half * 0.88} ${y - 21}`,
            `L ${x + half * 0.98} ${band}`,
            "Z",
          ].join(" ")}
          fill={colors.clothingAccent}
        />
        <rect x={x - half * 1.02} y={band} width={half * 2.04} height={10} rx={3} fill={colors.clothing} />
        {/* The peak. A lens rather than a crescent: the two curves differ by
            about eight units, which is what makes it read as a stiff board
            seen edge-on instead of as a shadow under the band. */}
        <path
          d={[
            `M ${x - half * 1.18} ${band + 2}`,
            `Q ${x} ${band + 20} ${x + half * 1.18} ${band + 2}`,
            `Q ${x} ${band + 10} ${x - half * 1.18} ${band + 2}`,
            "Z",
          ].join(" ")}
          fill={shadeHex(colors.clothing, 0.46)}
        />
      </g>
    );
  },
};

/**
 * A sou'wester — the oilskin rain hat, and the only hat here whose back is
 * visible from the front.
 *
 * Its identity is the long back brim, which a front view cannot show as a
 * brim. It shows as *corners*: the brim is wider than every hat here but the
 * straw one, and its two outer ends drop past the head, so the silhouette is a
 * dome with two ears of stiff cloth hanging beside it. That is the shape
 * anybody who has stood on a wet deck recognises, and it costs two lines.
 *
 * One colour plus a step darker for the brim, for the reason the straw hat
 * already wrote down: on a flat drawing, a surface turned away from you is
 * said with a darker paint or it is not said at all.
 */
const SOU_WESTER: AccessoryDef = {
  id: "sou-wester",
  label: "Sou'wester",
  slot: "hat",
  minLevel: "icon",
  render: ({ anchors, colors }) => {
    const { x, y, w } = anchors.hat;
    const half = w / 2;
    const brim = half * 1.45;
    return (
      <g>
        {/* The brim, and the two corners of it that hang past the head. */}
        <path
          d={[
            `M ${x - brim} ${y - 4}`,
            `Q ${x} ${y + 8} ${x + brim} ${y - 4}`,
            `L ${x + brim * 0.95} ${y + 15}`,
            `Q ${x} ${y + 6} ${x - brim * 0.95} ${y + 15}`,
            "Z",
          ].join(" ")}
          fill={shadeHex(colors.clothing, 0.28)}
        />
        <path
          d={[
            `M ${x - half * 0.96} ${y + 3}`,
            `C ${x - half * 1.02} ${y - 30} ${x + half * 1.02} ${y - 30} ${x + half * 0.96} ${y + 3}`,
            "Z",
          ].join(" ")}
          fill={colors.clothing}
        />
      </g>
    );
  },
};

/**
 * Neither of the two garments below has shoulders to hang from, and both land
 * at the foot of a legless body where they read as a striped skirt. The
 * shared exclusion only names the droplet; the bean's own wardrobe note
 * already says the same thing about sleeved garments, so it is named here too.
 */
const NO_SHOULDERS_SAARISTO = {
  notFor: ["ytymo", "silmu"] as const,
  incapableBecause:
    "Neither has shoulders — a shirt or a vest slides to the bottom of the body and reads as a skirt.",
};

/**
 * The Breton shirt: three bars, not ten.
 *
 * A real matelot has twenty-one stripes and every one of them disappears below
 * about 90px, where the shirt turns into a flat mid-tone. Three bars at a
 * tenth of the torso's height each survive to icon size and still read as
 * stripes, because what says "striped" is the rhythm of light and dark, not
 * the count.
 *
 * The paints are the other way round from every other garment here — the shirt
 * takes `clothingAccent` and the bars take `clothing` — because a Breton is a
 * pale shirt with loud bars on it, and painting the field from `clothing`
 * would give a navy shirt with cream stripes, which is a rugby jersey.
 */
const SAILOR_SHIRT: AccessoryDef = {
  id: "sailor-shirt",
  label: "Sailor shirt",
  slot: "torso",
  minLevel: "icon",
  ...NO_SHOULDERS_SAARISTO,
  render: ({ anchors, colors }) => {
    const t = anchors.torso;
    const cx = t.x + t.w / 2;
    const top = t.y + 9;
    const bottom = t.y + t.h * 0.86;
    const barH = t.h * 0.1;
    return (
      <g>
        <path
          d={`M ${t.x} ${top} Q ${cx} ${t.y - 6} ${t.x + t.w} ${top} L ${t.x + t.w} ${bottom} L ${t.x} ${bottom} Z`}
          fill={colors.clothingAccent}
        />
        <g fill={colors.clothing}>
          {[0.24, 0.47, 0.7].map((f) => (
            <rect key={f} x={t.x} y={top + (bottom - top - barH) * f} width={t.w} height={barH} />
          ))}
        </g>
      </g>
    );
  },
};

/**
 * A buoyancy aid: two front panels, a collar over the shoulders, one strap.
 *
 * Drawn as a vest with a *gap* down the middle rather than as a solid block,
 * which is the whole of what separates it from the hoodie at portrait size — a
 * life vest is two floats with the wearer visible between them, and the body
 * showing through the gap is what says so.
 */
const LIFE_VEST: AccessoryDef = {
  id: "life-vest",
  label: "Life vest",
  slot: "torso",
  minLevel: "icon",
  ...NO_SHOULDERS_SAARISTO,
  render: ({ anchors, colors }) => {
    const t = anchors.torso;
    const cx = t.x + t.w / 2;
    const panelW = t.w * 0.3;
    const panelH = t.h * 0.7;
    return (
      <g>
        <g fill={colors.clothing}>
          <rect x={cx - t.w * 0.46} y={t.y + 4} width={panelW} height={panelH} rx={6} />
          <rect x={cx + t.w * 0.46 - panelW} y={t.y + 4} width={panelW} height={panelH} rx={6} />
          <rect x={cx - t.w * 0.46} y={t.y - 3} width={t.w * 0.92} height={12} rx={6} />
        </g>
        <rect
          x={cx - t.w * 0.46}
          y={t.y + panelH * 0.5}
          width={t.w * 0.92}
          height={7}
          rx={3.5}
          fill={colors.clothingAccent}
        />
      </g>
    );
  },
};

/**
 * Out in the boat.
 *
 * The hull runs off both ends of the canvas, and that is the composition
 * rather than a crop: a rowing boat drawn whole inside 200 units, next to a
 * 166-unit bear, is a bath toy. Cut by the frame it is a boat the character is
 * *in*, and the sheer rising to both frame edges puts a bow and a stern just
 * outside the picture.
 *
 * **These do not butt together.** The scene was built expecting they would —
 * the forest shore does, and four species sharing one long hull is a better
 * idea than four portraits of one boat. The raster said otherwise: with no gap
 * the repeated sheer reads as a scalloped embankment and the boat disappears,
 * because nothing in the picture says where one hull ends. So a row of these
 * wants a gap, and then it is a flotilla.
 *
 * The numbers, since every one of them is load-bearing:
 *
 * - **The near rail sags from y=144 at the frame edges to about y=166 at the
 *   centre.** Every species in the set puts its soles between y=172 and y=182,
 *   so the hull covers the feet and the lower shin of all of them — you are
 *   standing *in* the boat — and none of them is cut at the knee.
 * - **Three wood tones, not one.** The far gunwale, the shadowed interior
 *   between the two sides, and the near hull. With one fill the far side and
 *   the near side touch and the whole thing is a brown wall; the dark band
 *   between them is the only thing saying the boat has an inside.
 * - **The water in front starts at y=190**, above the hull's own bottom edge
 *   at 198, so the hull ends in water rather than at a straight line.
 */
const BOAT_SEA_Y = 118;
const BOAT_NEAR_RAIL = "M -6 144 C 46 174 154 174 206 144";

const ROWING_BOAT: AccessoryDef = {
  id: "rowing-boat",
  label: "Rowing boat",
  slot: "scene",
  minLevel: "simple",
  render: ({ detail }) => (
    <g>
      <path d={`${BOAT_NEAR_RAIL} L 206 198 L -6 198 Z`} fill={MASCOT_SCENERY.wood} />
      <path d={BOAT_NEAR_RAIL} fill="none" stroke={MASCOT_SCENERY.woodDark} strokeWidth={9} />
      {showsFiligree(detail) && (
        <g fill={MASCOT_SCENERY.woodDark}>
          <rect x={30} y={158} width={7} height={11} rx={3} />
          <rect x={163} y={158} width={7} height={11} rx={3} />
        </g>
      )}
      <rect x={0} y={190} width={200} height={10} fill={shadeHex(swatchHex("blue"), 0.64)} />
    </g>
  ),
  renderBehind: () => (
    <g>
      <rect
        x={0}
        y={BOAT_SEA_Y}
        width={200}
        height={200 - BOAT_SEA_Y}
        fill={shadeHex(swatchHex("blue"), 0.46)}
      />
      {/* The archipelago: one low island on the horizon, off to the side no
          character stands on. Two trees, because one is a lamppost and three
          is a forest. */}
      <path
        d={`M 128 ${BOAT_SEA_Y + 1} C 146 ${BOAT_SEA_Y - 11} 176 ${BOAT_SEA_Y - 9} 198 ${BOAT_SEA_Y + 1} Z`}
        fill={shadeHex(swatchHex("emerald"), 0.72)}
      />
      <path d={spruce(150, BOAT_SEA_Y, 21, 11)} fill={shadeHex(swatchHex("emerald"), 0.8)} />
      <path d={spruce(172, BOAT_SEA_Y, 15, 8)} fill={shadeHex(swatchHex("emerald"), 0.8)} />
      <rect x={0} y={152} width={200} height={48} fill={shadeHex(swatchHex("blue"), 0.56)} />
      {/* The inside of the hull, then the far gunwale on top of it. Two wood
          tones rather than one: with a single fill the far side and the near
          side touch and the boat reads as a fence with a wavy top, which is
          exactly what the first raster of four butted panels showed. */}
      <path d="M -6 132 Q 100 148 206 132 L 206 180 L -6 180 Z" fill={shadeHex(MASCOT_SCENERY.wood, 0.52)} />
      <path
        d="M -6 126 Q 100 144 206 126 L 206 136 Q 100 154 -6 136 Z"
        fill={MASCOT_SCENERY.wood}
      />
    </g>
  ),
};

/**
 * The lighthouse, and the rock it stands on.
 *
 * Same composition rule the village uses: the tower lives in the left quarter
 * and runs off the top of the frame, so the middle third is free for one
 * character or three. A tower drawn whole would end up shorter than the person
 * standing next to it, which is the one thing a lighthouse may not be.
 *
 * Two red bands and nothing else. The tower is a tapering paper-white column
 * and the bands are cut across it *at its own width for that height* —
 * computed rather than typed, because a rectangle laid on a tapering tower
 * leaves a step at all four corners and reads as a mistake at 320px.
 */
const TOWER_X = 36;
const TOWER_TOP = 48;
const TOWER_BASE = 182;

/** Half the tower's width at a given height. 13 units at the top, 21 at the base. */
function towerHalf(y: number): number {
  return 13 + (8 * (y - TOWER_TOP)) / (TOWER_BASE - TOWER_TOP);
}

/** One band across the tapering tower, from `top` down to `bottom`. */
function towerBand(top: number, bottom: number): string {
  const a = towerHalf(top);
  const b = towerHalf(bottom);
  return `M ${TOWER_X - a} ${top} L ${TOWER_X + a} ${top} L ${TOWER_X + b} ${bottom} L ${TOWER_X - b} ${bottom} Z`;
}

const LIGHTHOUSE: AccessoryDef = {
  id: "lighthouse",
  label: "At the lighthouse",
  slot: "scene",
  minLevel: "simple",
  render: () => (
    <path
      d="M 0 190 C 40 186 74 194 116 191 C 152 188 178 194 200 191 L 200 200 L 0 200 Z"
      fill={MASCOT_SCENERY.stoneDark}
    />
  ),
  renderBehind: ({ detail }) => (
    <g>
      <rect x={0} y={138} width={200} height={62} fill={shadeHex(swatchHex("blue"), 0.5)} />
      {showsFiligree(detail) && (
        <path d="M 150 138 C 162 129 180 129 192 138 Z" fill={shadeHex(swatchHex("emerald"), 0.74)} />
      )}
      {/* The tower: column, two bands, gallery, lantern room, cap. */}
      <path d={towerBand(TOWER_TOP, TOWER_BASE)} fill={MASCOT_INK.paper} />
      <g fill={shadeHex(swatchHex("red"), 0.14)}>
        <path d={towerBand(62, 98)} />
        <path d={towerBand(122, 158)} />
      </g>
      <rect x={TOWER_X - 17} y={26} width={34} height={22} fill={MASCOT_INK.device} />
      <rect x={TOWER_X - 12} y={30} width={24} height={14} fill={tintHex(swatchHex("amber"), 0.3)} />
      <rect x={TOWER_X - 21} y={44} width={42} height={8} rx={2} fill={MASCOT_SCENERY.stone} />
      <path
        d={`M ${TOWER_X - 18} 26 L ${TOWER_X} 12 L ${TOWER_X + 18} 26 Z`}
        fill={MASCOT_SCENERY.stoneDark}
      />
      {/* The rock, drawn over the tower's foot so the tower is set into it
          rather than balanced on it. Flat across the middle third at about
          y=182, which is where every species in the set puts its soles. */}
      <path
        d="M 0 172 C 24 164 58 168 84 178 C 118 189 158 179 200 182 L 200 200 L 0 200 Z"
        fill={MASCOT_SCENERY.stone}
      />
      <ellipse cx={100} cy={186} rx={40} ry={6} fill={MASCOT_INK.shadow} opacity={0.32} />
    </g>
  ),
};

/**
 * The space helmet — a clear dome with a rim.
 *
 * It belongs to the alien crew and is deliberately not theirs alone: the point
 * of a helmet in this registry is that *anybody* can put one on, so a bear, a
 * villager, a voxel dinosaur and a one-eyed bean can all crew the same saucer.
 * That makes it the one hat here fitted to a head it has never met, and the
 * geometry is written to survive that:
 *
 * - **The dome is derived from `head.r` and clamped to the canvas.** Sixty per
 *   cent bigger than the nominal head is what leaves air inside it — a bubble
 *   sitting *on* a skull is a fishbowl, and one sitting *around* it is a
 *   helmet — but on a species whose head is already most of the drawing that
 *   would run off the top of the frame, so it is capped at whatever fits with
 *   three units to spare. The cap only binds on the fused-head species.
 * - **The rim is placed off the dome, not off the neck,** because half the
 *   concepts here have no neck. Seventy-eight per cent of the way down the
 *   dome is where the glass would meet a collar on a body that had one, and on
 *   a body that does not it lands under the face rather than across it.
 * - **There is no highlight on the glass.** A sheen is a material cue and this
 *   module forbids them; what makes it read as glass instead is that the fill
 *   is nearly transparent and the *edge* is a hard flat ring. The rim's own
 *   lighter top edge is the second ring, and between them they say "curved
 *   surface" without a single gradient.
 *
 * The one real collision is the face slot: the dome draws over the whole head,
 * so a character wearing both a helmet and glasses has its glasses inside the
 * bubble and half-veiled by it. Wearing one or the other is the answer; fixing
 * it would mean re-ordering the head slots, which is not this file's to do.
 */
const SPACE_HELMET: AccessoryDef = {
  id: "space-helmet",
  label: "Space helmet",
  slot: "hat",
  minLevel: "icon",
  render: ({ rig, colors }) => {
    const { x, r } = rig.head;
    const cy = rig.head.y - r * 0.02;
    const dome = Math.min(r * 1.6, cy - 3);
    const rimY = cy + dome * 0.78;
    const rimW = dome * 1.3;
    return (
      <g>
        <circle cx={x} cy={cy} r={dome} fill={colors.clothingAccent} opacity={0.16} />
        <circle
          cx={x}
          cy={cy}
          r={dome}
          fill="none"
          stroke={colors.clothingAccent}
          strokeWidth={3.2}
          opacity={0.85}
        />
        <rect x={x - rimW / 2} y={rimY} width={rimW} height={10} rx={5} fill={colors.clothing} />
        <rect
          x={x - rimW / 2}
          y={rimY}
          width={rimW}
          height={3.4}
          rx={1.7}
          fill={colors.clothingAccent}
        />
      </g>
    );
  },
};

/**
 * The landing pad, with the saucer parked behind it.
 *
 * Built to the same two rules the other scenes in this file follow. **Nothing
 * in it repaints with the character** — the pad and the hull are the shared
 * scenery neutrals and the lights are swatches, because a saucer that changed
 * colour to match whoever was standing in front of it would stop being a place
 * and start being an accessory. And **the ground goes behind**, so every
 * species' soles land on top of the pad whatever its own foot line is: the pad
 * is a flat ellipse twenty-eight units deep, which covers every ground line in
 * the directory from the tallest build to the shortest.
 *
 * The saucer is small and high on the right, at about a fifth of the
 * character's height. That is the whole trick of the composition: a saucer
 * drawn big enough to be impressive is a saucer the character is a toy in
 * front of, and one drawn small and far away is a saucer the character
 * *arrived in*.
 */
const SAUCER_STARS: readonly { x: number; y: number; r: number }[] = [
  { x: 24, y: 26, r: 2.2 },
  { x: 52, y: 12, r: 1.5 },
  { x: 14, y: 62, r: 1.7 },
  { x: 74, y: 34, r: 1.3 },
  { x: 186, y: 96, r: 1.8 },
  { x: 168, y: 14, r: 1.4 },
];

const SAUCER: AccessoryDef = {
  id: "saucer",
  label: "Saucer landing pad",
  slot: "scene",
  minLevel: "simple",
  // The near ground: two dark rocks in the bottom corners, in front of
  // everything. The same device the forest scene uses — the picture's only
  // true darks are the nearest thing and nothing else — and it is what stops a
  // flat ellipse from reading as a rug.
  render: () => (
    <g fill={shadeHex(swatchHex("indigo"), 0.8)}>
      <path d="M 0 200 L 0 191 C 9 182 24 182 33 191 L 37 200 Z" />
      <path d="M 200 200 L 200 189 C 189 180 174 181 167 190 L 163 200 Z" />
    </g>
  ),
  renderBehind: ({ detail }) => (
    <g>
      {detail === "full" &&
        SAUCER_STARS.map((s) => (
          <circle key={`${s.x}-${s.y}`} cx={s.x} cy={s.y} r={s.r} fill={MASCOT_INK.paper} opacity={0.6} />
        ))}
      {/* The saucer: a hull, a shallower belly under it, a dome on top and
          three lights. Four shapes and a row of dots. */}
      <path
        d="M 140 38 A 19 19 0 0 1 178 38 Z"
        fill={tintHex(swatchHex("cyan"), 0.4)}
        opacity={0.75}
      />
      <ellipse cx={159} cy={39} rx={38} ry={9} fill={MASCOT_SCENERY.stone} />
      <ellipse cx={159} cy={43} rx={27} ry={6} fill={MASCOT_SCENERY.stoneDark} />
      <circle cx={142} cy={42} r={3} fill={swatchHex("amber")} />
      <circle cx={159} cy={44} r={3} fill={swatchHex("amber")} />
      <circle cx={176} cy={42} r={3} fill={swatchHex("amber")} />
      {/* The pad. Drawn behind so every sole stands on it. */}
      <path
        d="M 22 178 A 78 14 0 0 0 178 178 L 178 186 A 78 14 0 0 1 22 186 Z"
        fill={MASCOT_SCENERY.stoneDark}
      />
      <ellipse cx={100} cy={178} rx={78} ry={14} fill={MASCOT_SCENERY.stone} />
      <ellipse cx={100} cy={178} rx={58} ry={10} fill={MASCOT_SCENERY.stoneDark} opacity={0.55} />
    </g>
  ),
};

// --- Reksi's kit: the beard, the kigurumi hood, the costume tail ----------

/**
 * White beard hair, which is not white.
 *
 * The same value the human elder's is mixed at and for the same reason: an
 * off-white shape on a pastel or a pale-slate head is two light values with
 * nothing between them, and the beard stops being a silhouette. A sixth of the
 * way towards the soft line colour holds an edge against a lilac face, a grey-
 * blue muzzle and the dark page all at once.
 */
const BEARD_WHITE = mixHex(MASCOT_INK.paper, MASCOT_INK.lineSoft, 0.1);

/**
 * A beard: one soft shape hanging off the chin, and nothing else on it.
 *
 * **Why it is in the `face` slot rather than in `extra`.** Only two slots are
 * drawn inside the head group — `hat` and `face` — and everything else is
 * outside it. The idle head tilt turns the head eight degrees about a point
 * just under it, which moves a point at the chin about five units; a beard
 * anchored anywhere but inside that group would visibly unstick from the face
 * every eleven seconds. So a beard is a face item in the same sense a pair of
 * glasses is: it is drawn on the head and it goes where the head goes.
 *
 * **Why it hangs off the mouth line and not off the chin.** A chin is not a
 * shape this registry can see — a bear's muzzle is a wide ellipse, a rex's jaw
 * hangs below its skull, a person has neither — but every species puts its
 * mouth glyph at `mouthY`, and on every one of them that is the lowest thing
 * on the face.
 *
 * The drop below it is `0.32` of the head radius with a floor of 8, and both
 * halves were measured. A flat fourteen units was tried first and it is wrong
 * on a small head: a Kaveri adult's mouth sits fourteen units above the bottom
 * of its own head, so the beard came out below the chin entirely and read as a
 * white collar. Scaling it puts the top edge within a unit of the chin on
 * every build from a 21-unit adult head to a 46-unit rex skull. The floor is
 * what keeps it clear of the mouth glyph, which is drawn in *absolute* units
 * rather than scaled ones — Excited's curve reaches sixteen below the line, so
 * on the smallest heads the deepest mouth in the grammar touches the beard's
 * top edge. That is the accepted cost: the species this item exists for are
 * the muzzled ones, whose heads are twice that size.
 *
 * One shape and no second colour: no moustache block, no parting, no shadow
 * under the lip. At 40px a beard is a pale wedge under a face and that is the
 * whole of what has to survive.
 */
const BEARD: AccessoryDef = {
  id: 'beard',
  label: 'White beard',
  slot: 'face',
  minLevel: 'icon',
  render: ({ rig }) => {
    const { x, r } = rig.head;
    const top = rig.mouthY + Math.max(r * 0.32, 8);
    const half = r * 0.86;
    const h = r * 0.62;
    return (
      <path
        d={[
          `M ${x - half} ${top}`,
          `L ${x + half} ${top}`,
          `C ${x + half} ${top + h * 0.72} ${x + half * 0.56} ${top + h} ${x} ${top + h}`,
          `C ${x - half * 0.56} ${top + h} ${x - half} ${top + h * 0.72} ${x - half} ${top}`,
          'Z',
        ].join(' ')}
        fill={BEARD_WHITE}
      />
    );
  },
};

/**
 * The beard and the sunglasses as one wearable.
 *
 * Reksi wants three things on his head — a beard, shades, and (disputed) a
 * crown — and the rig offers two head slots. Rather than widen the slot list
 * for one character, this is the pair he actually wears, registered once and
 * composed from the two items themselves so there is no second copy of either
 * shape. If the shades are ever retuned this follows them.
 */
const BEARD_SHADES: AccessoryDef = {
  id: 'beard-shades',
  label: 'Beard and shades',
  slot: 'face',
  minLevel: 'icon',
  render: (ctx) => (
    <g>
      {BEARD.render(ctx)}
      {SHADES.render(ctx)}
    </g>
  ),
};

/**
 * A dinosaur-costume hood — the kigurumi.
 *
 * The joke only works if the wearer is still visibly themselves inside it, so
 * the two measurements that decide that are the ones everything is built from:
 * the head, which says how big the hood has to be, and the face line, which
 * says where the eyes are. The hood's front edge stops three units above the
 * top of the eye, so no build can end up with a costume pulled down over its
 * face.
 *
 * The first version was drawn off the *hat* anchor, the way every ordinary hat
 * here is, and the raster showed why that is wrong for this one: a hat's width
 * is the width of the head where the hat sits, and a hood is not sitting on
 * the head — it is over it. At that width the whole thing read as a swimming
 * cap. Off the head radius it is forty per cent wider than the skull and rises
 * half a head above it, which is what a costume head does.
 *
 * Four blocks, in the order they are drawn:
 *
 * - **The crest**, first and therefore behind, so the shell covers each disc's
 *   lower half and what is left is a row of soft bumps along the top. Five of
 *   them, the same scallops the T-rex form wears down its own back — that is
 *   the one mark shared between the animal and the costume, and it is what
 *   stops this reading as a bear hood. They are centred *on* the shell's top
 *   edge rather than under it; the first version put them inside and they were
 *   invisible.
 * - **The shell**: one flat-topped dome coming down to the brow line.
 * - **The rim**: the hood's pale lining along the shell's bottom edge.
 * - **Two side flaps**, hanging past the brow line either side of the face and
 *   outside the skull's own edge, down to the jaw. They are what make it a
 *   hood rather than a helmet, and they are the "jaws framing the face". They
 *   are rounded and blunt: the face grammar bans teeth on every species, and a
 *   costume's teeth are teeth.
 */
const REX_HOOD: AccessoryDef = {
  id: 'rex-hood',
  label: 'T-rex hood',
  slot: 'hat',
  minLevel: 'icon',
  render: ({ rig, anchors, colors }) => {
    const { x, y, r } = rig.head;
    const face = anchors.face;
    // The lowest the costume may come down the face.
    const brow = face.y - face.r - 3;
    const half = r * 1.42;
    const top = y - r * 1.34;
    const hole = half * 0.64;
    return (
      <g>
        <g fill={shadeHex(colors.clothing, 0.3)}>
          {[-0.66, -0.24, 0.24, 0.66].map((t) => (
            <circle
              key={t}
              cx={x + half * 0.82 * t}
              cy={top + Math.abs(t) * r * 0.34}
              r={r * 0.38}
            />
          ))}
        </g>
        {/* One path: the dome, then a jaw lobe down each side of the face and
            back up to the face hole's top edge. Drawn as a single shape rather
            than as a dome plus two flaps because the first version drew them
            separately and the pair read as the earflaps on a winter hat — a
            flap that is visibly part of the same rounded mass is a jaw, and a
            flap butted onto the bottom of a cap is an earflap. */}
        <path
          d={[
            `M ${x - half} ${brow}`,
            `C ${x - half} ${top + r * 0.3} ${x - half * 0.56} ${top} ${x} ${top}`,
            `C ${x + half * 0.56} ${top} ${x + half} ${top + r * 0.3} ${x + half} ${brow}`,
            `C ${x + half} ${brow + r * 1.15} ${x + hole * 1.04} ${brow + r * 1.2} ${x + hole} ${brow}`,
            `L ${x - hole} ${brow}`,
            `C ${x - hole * 1.04} ${brow + r * 1.2} ${x - half} ${brow + r * 1.15} ${x - half} ${brow}`,
            'Z',
          ].join(' ')}
          fill={colors.clothing}
        />
        {/* THE SNOUT, and the one shape that decides whether any of this reads.
            A hood drawn as a dome around a face is a hat, whatever is bumped
            along its top — three rasters said so in three different ways
            (swimming cap, aviator hat, earmuffs). What a kigurumi actually
            looks like from the front is *two faces stacked*: the costume's
            head sitting above the wearer's, with its own muzzle hanging over
            their forehead. So the muzzle is drawn, in the garment's second
            colour and with a nose on it, filling the band between the crest
            and the face hole. It is the costume's face; the person's is
            underneath, which is the joke. */}
        <rect
          x={x - half * 0.72}
          y={top + (brow - top) * 0.34}
          width={half * 1.44}
          height={(brow - top) * 0.66}
          rx={r * 0.24}
          fill={colors.clothingAccent}
        />
        <ellipse
          cx={x}
          cy={top + (brow - top) * 0.58}
          rx={r * 0.26}
          ry={r * 0.15}
          fill={MASCOT_INK.line}
        />
      </g>
    );
  },
};

/**
 * The costume's tail, for whoever is wearing the hood.
 *
 * It is a `back` item, which is the only slot drawn *behind* the body, and a
 * tail drawn in front of the legs is a tail somebody is holding. Everything is
 * a fraction of the hip-to-sole distance, so it comes out the same length on a
 * child, an adult and a bean.
 *
 * Thick where it leaves the hip and tapering to a point, with the same
 * scallops the hood wears — the two are one costume and have to be readable as
 * such from across a lineup. The scallops are placed by evaluating the tail's
 * own upper curve rather than by hand, so they follow it if it is ever
 * retuned. It sweeps to the viewer's right for the same reason every tail in
 * the animal family does: the pose table's raised hand is on the left, and two
 * things reaching the same way is a character leaning.
 */
const REX_TAIL: AccessoryDef = {
  id: 'rex-tail',
  label: 'T-rex tail',
  slot: 'back',
  minLevel: 'simple',
  render: ({ rig, colors, detail }) => {
    const drop = rig.footY - rig.hip.y;
    const bx = rig.hip.x + rig.hipSpread * 0.5;
    const by = rig.hip.y;
    const tipX = bx + drop * 1.18;
    const tipY = rig.footY - drop * 0.26;
    // The upper edge, as one quadratic, and the point on it at `t`.
    const ctl = { x: bx + drop * 0.85, y: by - drop * 0.14 };
    const start = { x: bx, y: by - drop * 0.16 };
    const at = (t: number): { x: number; y: number } => {
      const u = 1 - t;
      return {
        x: u * u * start.x + 2 * u * t * ctl.x + t * t * tipX,
        y: u * u * start.y + 2 * u * t * ctl.y + t * t * tipY,
      };
    };
    return (
      <g>
        {showsFiligree(detail) && (
          <g fill={shadeHex(colors.clothing, 0.3)}>
            {[0.28, 0.52, 0.74].map((t, i) => {
              const p = at(t);
              return <circle key={t} cx={p.x} cy={p.y} r={drop * (0.12 - i * 0.03)} />;
            })}
          </g>
        )}
        <path
          d={[
            `M ${start.x} ${start.y}`,
            `Q ${ctl.x} ${ctl.y} ${tipX} ${tipY}`,
            `Q ${bx + drop * 0.98} ${by + drop * 0.72} ${bx} ${by + drop * 0.6}`,
            'Z',
          ].join(' ')}
          fill={colors.clothing}
        />
      </g>
    );
  },
};

export const ACCESSORIES: readonly AccessoryDef[] = [
  HEADSET,
  BEANIE,
  SANTA_HAT,
  PARTY_HAT,
  WITCH_HAT,
  FLOWER_CROWN,
  SPECS,
  SHADES,
  HOODIE,
  TEE,
  SCARF,
  LANYARD,
  CAPE,
  BACKPACK,
  PUMPKIN,
  SNOWDRIFT,
  DESK,
  DESK_SETUP,
  EARFLAP_HAT,
  SUNHAT,
  STUDENT_CAP,
  BUNNY_EARS,
  LEAVES,
  THAW,
  MOSQUITO,
  BONFIRE,
  GIFT,
  CANDLES,
  EGG,
  BALLOONS,
  SWEPT_CAP,
  SPROUT,
  BERET,
  PAINTER_CAP,
  CAP,
  STRAW_HAT,
  PAINT_BUCKET,
  STORY_SPROUT,
  DOOR,
  SIGN_PAINTING,
  HARDHAT,
  GOGGLES,
  TOOL_BELT,
  ENGINE_ROOM,
  VILLAGE,
  FOREST_NIGHT,
  SOG_CREST,
  CROWN,
  CAPTAIN_CAP,
  SOU_WESTER,
  SAILOR_SHIRT,
  LIFE_VEST,
  ROWING_BOAT,
  LIGHTHOUSE,
  SPACE_HELMET,
  SAUCER,
  BEARD,
  BEARD_SHADES,
  REX_HOOD,
  REX_TAIL,
];

const BY_ID = new Map(ACCESSORIES.map((a) => [a.id, a]));

export function accessory(id: string): AccessoryDef | undefined {
  return BY_ID.get(id);
}

export function accessoriesForSlot(slot: OutfitSlot): AccessoryDef[] {
  return ACCESSORIES.filter((a) => a.slot === slot);
}

/** Whether a species can wear an item at all. */
export function accessoryFits(def: AccessoryDef, concept: ConceptId): boolean {
  return def.notFor === undefined || !def.notFor.includes(concept);
}
