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
import type { DetailLevel } from "./detail";
import type { Anchors, OutfitSlot } from "./outfit";
import { MASCOT_INK, type Colorway } from "./palette";
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
  render: ({ anchors, rig, detail }) => {
    const { x, y, dx, r } = anchors.face;
    const lens = r * 1.75;
    return (
      <g
        fill="none"
        stroke={MASCOT_INK.line}
        strokeWidth={detail === "icon" ? 4 : 2.8}
        strokeLinecap="round"
      >
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
        <ellipse cx={x - 12} cy={y - 22} rx={3.2} ry={13} fill={colors.blush} />
        <ellipse cx={x + 12} cy={y - 22} rx={3.2} ry={13} fill={colors.blush} />
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
