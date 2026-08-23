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
import { MASCOT_INK, MASCOT_SCENERY, shadeHex, swatchHex, type Colorway } from "./palette";
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
        <path
          d={`M ${x - half - 5} ${y + 14} q -3 14 3 20 q 6 3 8 -3`}
          fill={colors.clothingAccent}
          {...OUTLINE}
        />
        <path
          d={`M ${x + half + 5} ${y + 14} q 3 14 -3 20 q -6 3 -8 -3`}
          fill={colors.clothingAccent}
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
 * A soft cap with a short peak and a blank front panel.
 *
 * The legacy headmaster wears one and so does half of School of Gaming, which
 * makes it the one piece of clothing in this registry that is *uniform*
 * rather than costume - so it deliberately carries no mark. A blank panel is
 * a cap a brand could put something on; a panel with letters drawn into it is
 * a logo baked into an illustration, which is the thing a design system
 * spends its life trying not to own.
 *
 * It is not the `swept-cap`, and the difference is the whole reason both
 * exist: that one's peak sweeps a full head's width and is the character's
 * signature, this one's is a stub. Two soft caps in one fleet have to be
 * distinguishable at portrait size, and peak length is the only cue that
 * survives there.
 */
const CAP: AccessoryDef = {
  id: 'cap',
  label: 'Cap',
  slot: 'hat',
  minLevel: 'icon',
  render: ({ anchors, colors }) => {
    const { x, y, w } = anchors.hat;
    const half = w / 2;
    const peak = Math.min(w * 0.32, 24);
    return (
      <g>
        {/* The peak first, so the band closes over where it is sewn on. */}
        <path
          d={[
            `M ${x - half * 0.9} ${y + 2}`,
            `C ${x - half - peak * 0.6} ${y + 1} ${x - half - peak} ${y + 6} ${x - half - peak} ${y + 10}`,
            `C ${x - half - peak * 0.5} ${y + 15} ${x - half * 0.6} ${y + 15} ${x - half * 0.35} ${y + 10}`,
            'Z',
          ].join(' ')}
          fill={colors.clothingAccent}
        />
        <path
          d={[
            `M ${x - half * 1.02} ${y + 8}`,
            `C ${x - half * 1.08} ${y - 30} ${x + half * 1.08} ${y - 30} ${x + half * 1.02} ${y + 8}`,
            'Z',
          ].join(' ')}
          fill={colors.clothing}
        />
        <rect
          x={x - half * 1.03}
          y={y + 3}
          width={half * 2.06}
          height={8}
          rx={4}
          fill={colors.clothingAccent}
        />
        <rect
          x={x - half * 0.46}
          y={y - 14}
          width={half * 0.92}
          height={14}
          rx={3.5}
          fill={MASCOT_INK.paper}
        />
        <rect
          x={x - half * 0.3}
          y={y - 10}
          width={half * 0.6}
          height={6}
          rx={3}
          fill={colors.accent}
        />
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
      <rect x={boardX} y={boardY} width={boardW} height={boardH} rx={3} fill={MASCOT_SCENERY.wood} />
      <rect
        x={boardX + 5}
        y={boardY + 5}
        width={boardW - 10}
        height={boardH - 10}
        rx={2}
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
