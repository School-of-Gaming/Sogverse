import { cn } from "@/lib/utils";
import { VISION_LOOP } from "./vision-content";
import { VISION_TONES, type VisionTone } from "./vision-tones";

/**
 * The artwork on the platform vision page, drawn inline so it scales, themes
 * from the library's tokens and needs no request of its own.
 *
 * Every colour here is a token class at its authored value (`fill-yty-glow`,
 * `stroke-world`), so the pictures move with the brand; nothing spells a hex.
 * A picture that carries meaning the text beside it does not is `role="img"`
 * with a `<title>` naming what it shows; a picture that only decorates what the
 * text already says is `aria-hidden`. The words in a title arrive as a prop
 * from the content module, like every other word on the page.
 *
 * The avatars are pixel art on purpose: the gamer profile's avatar is pixel
 * art today, and the page draws the one gamers know rather than a new look.
 */

interface ArtProps {
  readonly className?: string;
}

interface TitledArtProps extends ArtProps {
  /** What the picture shows, for a reader who cannot see it. */
  readonly title: string;
}

// ------------------------------------------------------------ primitives

/** A sprite as rows of characters; each character names a palette entry, and `.` is empty. */
type SpriteRows = readonly string[];
type SpritePalette = Partial<Record<string, string>>;

/**
 * A pixel sprite, drawn as one rect per horizontal run of a colour rather than
 * one per pixel, so a 12 × 14 avatar is a few dozen nodes instead of a few
 * hundred.
 */
function PixelSprite({
  rows,
  palette,
  x,
  y,
  size,
}: {
  rows: SpriteRows;
  palette: SpritePalette;
  x: number;
  y: number;
  size: number;
}) {
  const runs: { key: string; col: number; row: number; length: number; className: string }[] = [];
  rows.forEach((line, row) => {
    let col = 0;
    while (col < line.length) {
      const char = line.charAt(col);
      let length = 1;
      while (line.charAt(col + length) === char) length += 1;
      const className = palette[char];
      if (className) runs.push({ key: `${row}-${col}`, col, row, length, className });
      col += length;
    }
  });

  return (
    <g transform={`translate(${x} ${y})`} shapeRendering="crispEdges">
      {runs.map((run) => (
        <rect
          key={run.key}
          x={run.col * size}
          y={run.row * size}
          width={run.length * size}
          height={size}
          className={run.className}
        />
      ))}
    </g>
  );
}

/** Lays `top` over `base`: any character in `top` other than `.` wins. */
function overlay(base: SpriteRows, top: SpriteRows): SpriteRows {
  return base.map((line, row) => {
    const over = top.at(row) ?? "";
    return Array.from(line, (char, col) => {
      const next = over.charAt(col);
      return next && next !== "." ? next : char;
    }).join("");
  });
}

/** A four-pointed sparkle, the page's recurring spark of energy. */
function sparklePath(x: number, y: number, r: number): string {
  return `M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r}Z`;
}

function Sparkle({ x, y, r, tone }: { x: number; y: number; r: number; tone: VisionTone }) {
  return <path d={sparklePath(x, y, r)} className={VISION_TONES[tone].fill} />;
}

/** A small standing person: a rounded body and a head, standing on `baseY`. */
function Figure({ x, baseY, bodyClassName }: { x: number; baseY: number; bodyClassName: string }) {
  return (
    <g>
      <rect x={x - 9} y={baseY - 24} width="18" height="24" rx="7" className={bodyClassName} />
      <circle cx={x} cy={baseY - 34} r="8" className="fill-foreground" />
    </g>
  );
}

/** A campfire's flame, its base at the origin: the outer tongue and the hot core. */
function Flame({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path
        d="M0 0 C-18 0 -20 -20 -10 -36 C-8 -24 -2 -24 -2 -34 C-2 -44 4 -52 12 -58 C10 -44 20 -36 18 -20 C17 -8 10 0 0 0Z"
        className="fill-yty-valor"
      />
      <path
        d="M0 0 C-8 0 -10 -10 -5 -18 C-3 -12 1 -12 2 -18 C4 -12 10 -8 6 -2 C4 0 2 0 0 0Z"
        className="fill-act"
      />
    </g>
  );
}

/** Two crossed logs under a flame, centred on `x`, resting on `y`. */
function Logs({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x="-24" y="-4" width="48" height="8" rx="4" transform={`translate(${x} ${y}) rotate(-16)`} className="fill-muted-foreground" />
      <rect x="-24" y="-4" width="48" height="8" rx="4" transform={`translate(${x} ${y}) rotate(16)`} className="fill-muted-foreground" />
    </g>
  );
}

// ------------------------------------------------------------ glyphs

/** The four element marks, each centred on the origin and about 24 units across. */
const ELEMENT_GLYPH_PATHS = {
  harmony: "M0 11 C-14 2 -12 -11 -5 -11 C-2 -11 0 -8 0 -6 C0 -8 2 -11 5 -11 C12 -11 14 2 0 11Z",
  glow: "M-9 10 C-11 -2 -2 -11 11 -11 C11 2 3 10 -9 10Z",
  valor: "M0 -12 L10 -8 L10 0 C10 6 5 10 0 12 C-5 10 -10 6 -10 0 L-10 -8Z",
  wit: "M-6 -11 L-6 9 L-1 4 L3 12 L7 10 L3 2 L9 2Z",
} as const;

// ------------------------------------------------------------ sprites

/** The pixel avatar every gamer starts as: hair, face, eyes, smile, body, legs. */
const AVATAR_BASE: SpriteRows = [
  "............",
  "............",
  "...hhhhhh...",
  "..hhhhhhhh..",
  "..hffffffh..",
  "..ffeffeff..",
  "..ffffffff..",
  "...ffmmff...",
  "...bbbbbb...",
  "..bbbbbbbb..",
  "..bbbbbbbb..",
  "..bbbbbbbb..",
  "...bb..bb...",
  "...bb..bb...",
];

/** What each element grows on the base avatar, drawn in `a` (the element) and `w` (ink). */
const AVATAR_GROWTH = {
  // A headband and a heart patch on the chest.
  harmony: [
    "............",
    "............",
    "............",
    "..aaaaaaaa..",
    "............",
    "............",
    "............",
    "............",
    "............",
    "....aa.aa...",
    "....aaaaa...",
    ".....aaa....",
    "............",
    "............",
  ],
  // A sprout of two leaves from the top of the head.
  glow: [
    "....aa.aa...",
    "......a.....",
    "............",
    "............",
    "............",
    "............",
    "............",
    "............",
    "............",
    "............",
    "............",
    "............",
    "............",
    "............",
  ],
  // A cape behind, and a shield held to the chest.
  valor: [
    "............",
    "............",
    "............",
    "............",
    "............",
    "............",
    "............",
    "............",
    "..a......a..",
    ".a...ww...a.",
    ".a...ww...a.",
    ".a....w...a.",
    "aa........aa",
    "............",
  ],
  // A visor across the eyes and an antenna.
  wit: [
    ".....aa.....",
    "......a.....",
    "............",
    "............",
    "............",
    "..aaaaaaaa..",
    "............",
    "............",
    "............",
    "............",
    "............",
    "............",
    "............",
    "............",
  ],
} as const satisfies Record<"harmony" | "glow" | "valor" | "wit", SpriteRows>;

const AVATAR_PALETTE: SpritePalette = {
  h: "fill-muted-foreground",
  f: "fill-foreground",
  e: "fill-background",
  m: "fill-background",
  b: "fill-muted-foreground",
  w: "fill-foreground",
};

/** The profile's own avatar, dressed in the brand's act colour. */
const HERO_AVATAR_PALETTE: SpritePalette = { ...AVATAR_PALETTE, b: "fill-act" };

/** A tree as the online world draws one. */
const PIXEL_TREE: SpriteRows = [
  "...ww...",
  "..wwww..",
  ".wwwwww.",
  "..wwww..",
  ".wwwwww.",
  "wwwwwwww",
  "...tt...",
  "...tt...",
];

const PIXEL_TREE_PALETTE: SpritePalette = { w: "fill-yty-wit", t: "fill-muted-foreground" };

// ------------------------------------------------------------ the pictures

const ORBIT_TITLE_ID = "platform-vision-orbit-art";

/** The hero: the gamer profile at the centre, the four elements in orbit around it. */
export function ProfileOrbitArt({ title, className }: TitledArtProps) {
  const nodes = [
    { tone: "harmony", cx: 200, cy: 60 },
    { tone: "glow", cx: 340, cy: 200 },
    { tone: "valor", cx: 200, cy: 340 },
    { tone: "wit", cx: 60, cy: 200 },
  ] as const;

  return (
    <svg viewBox="0 0 400 400" role="img" aria-labelledby={ORBIT_TITLE_ID} className={className}>
      <title id={ORBIT_TITLE_ID}>{title}</title>
      <circle cx="200" cy="200" r="186" fill="none" strokeWidth="3" strokeDasharray="1 12" strokeLinecap="round" className="stroke-world" />
      <circle cx="200" cy="200" r="140" fill="none" strokeWidth="2" className="stroke-border" />
      {nodes.map((node) => (
        <line
          key={`spoke-${node.tone}`}
          x1="200"
          y1="200"
          x2={node.cx}
          y2={node.cy}
          strokeWidth="2"
          strokeDasharray="4 8"
          strokeLinecap="round"
          className={VISION_TONES[node.tone].stroke}
        />
      ))}
      <circle cx="200" cy="200" r="82" strokeWidth="4" className="fill-card stroke-act" />
      <PixelSprite
        rows={AVATAR_BASE}
        palette={HERO_AVATAR_PALETTE}
        x={158}
        y={151}
        size={7}
      />
      {nodes.map((node) => (
        <g key={node.tone} transform={`translate(${node.cx} ${node.cy})`}>
          <circle r="30" className={VISION_TONES[node.tone].fill} />
          <path d={ELEMENT_GLYPH_PATHS[node.tone]} className={VISION_TONES[node.tone].onFill} />
        </g>
      ))}
      <Sparkle x={332} y={68} r={16} tone="act" />
      <Sparkle x={70} y={332} r={12} tone="world" />
      <Sparkle x={344} y={322} r={9} tone="harmony" />
      <Sparkle x={62} y={76} r={10} tone="wit" />
      <Sparkle x={292} y={36} r={6} tone="glow" />
    </svg>
  );
}

/** What flows into the profile from the left and out of it to the right. Decorative: the lists beside it say it. */
export function ThreadArt({
  inTones,
  outTones,
  className,
}: ArtProps & { inTones: readonly VisionTone[]; outTones: readonly VisionTone[] }) {
  const inY = inTones.map((_, i) => 40 + i * 60);
  const outY = outTones.map((_, i) => 25 + i * 50);

  return (
    <svg viewBox="0 0 240 200" aria-hidden="true" className={className}>
      {inTones.map((tone, i) => (
        <g key={`in-${i}`}>
          <path d={`M14 ${inY[i]} C60 ${inY[i]} 70 100 120 100`} fill="none" strokeWidth="3" strokeLinecap="round" className={VISION_TONES[tone].stroke} />
          <circle cx="14" cy={inY[i]} r="7" className={VISION_TONES[tone].fill} />
        </g>
      ))}
      {outTones.map((tone, i) => (
        <g key={`out-${i}`}>
          <path d={`M120 100 C170 100 180 ${outY[i]} 226 ${outY[i]}`} fill="none" strokeWidth="3" strokeLinecap="round" className={VISION_TONES[tone].stroke} />
          <circle cx="226" cy={outY[i]} r="7" className={VISION_TONES[tone].fill} />
        </g>
      ))}
      <circle cx="120" cy="100" r="42" strokeWidth="4" className="fill-card stroke-act" />
      <PixelSprite rows={AVATAR_BASE} palette={HERO_AVATAR_PALETTE} x={96} y={72} size={4} />
    </svg>
  );
}

const LOOP_TITLE_ID = "platform-vision-loop-art";

/** The loop: four stations on one track, flowing clockwise and back to the start. */
export function LoopArt({ title, className }: TitledArtProps) {
  const radius = 110;
  const stations = VISION_LOOP.steps.map((step, i) => {
    const angle = (i * Math.PI) / 2;
    return {
      tone: step.tone,
      cx: 160 + radius * Math.sin(angle),
      cy: 160 - radius * Math.cos(angle),
    };
  });
  const arrows = [45, 135, 225, 315].map((degrees) => {
    const angle = (degrees * Math.PI) / 180;
    return {
      degrees,
      x: 160 + radius * Math.sin(angle),
      y: 160 - radius * Math.cos(angle),
    };
  });

  return (
    <svg viewBox="0 0 320 320" role="img" aria-labelledby={LOOP_TITLE_ID} className={className}>
      <title id={LOOP_TITLE_ID}>{title}</title>
      <circle cx="160" cy="160" r={radius} fill="none" strokeWidth="12" className="stroke-lifted" />
      <circle cx="160" cy="160" r={radius} fill="none" strokeWidth="2" strokeDasharray="2 10" strokeLinecap="round" className="stroke-act" />
      {arrows.map((arrow) => (
        <path
          key={arrow.degrees}
          d="M-8 -9 L10 0 L-8 9Z"
          transform={`translate(${arrow.x} ${arrow.y}) rotate(${arrow.degrees})`}
          className="fill-foreground"
        />
      ))}
      {stations.map((station, i) => (
        <g key={station.tone} transform={`translate(${station.cx} ${station.cy})`}>
          <circle r="30" className={VISION_TONES[station.tone].fill} />
          <text
            y="9"
            textAnchor="middle"
            fontSize="26"
            className={cn("font-semibold", VISION_TONES[station.tone].onFill)}
          >
            {i + 1}
          </text>
        </g>
      ))}
      <Sparkle x={160} y={160} r={30} tone="act" />
      <Sparkle x={196} y={128} r={10} tone="world" />
      <Sparkle x={128} y={196} r={8} tone="harmony" />
    </svg>
  );
}

/** Wit's story: the scout's forest and campfire, becoming the pixel forest and the screen. Decorative. */
export function ForestToPixelsArt({ className }: ArtProps) {
  const pines = [50, 112];

  return (
    <svg viewBox="0 0 480 160" aria-hidden="true" className={className}>
      <line x1="10" y1="150" x2="470" y2="150" strokeWidth="3" strokeLinecap="round" className="stroke-border" />
      {pines.map((x) => (
        <g key={x}>
          <rect x={x - 5} y="128" width="10" height="22" className="fill-muted-foreground" />
          <polygon points={`${x},34 ${x + 26},86 ${x - 26},86`} className="fill-yty-glow" />
          <polygon points={`${x},60 ${x + 34},128 ${x - 34},128`} className="fill-yty-glow" />
        </g>
      ))}
      <Logs x={180} y={144} />
      <Flame x={180} y={140} />
      {[236, 254, 272].map((cx) => (
        <circle key={cx} cx={cx} cy="100" r="4" className="fill-act" />
      ))}
      <path d="M288 88 L302 100 L288 112" fill="none" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" className="stroke-act" />
      <PixelSprite rows={PIXEL_TREE} palette={PIXEL_TREE_PALETTE} x={316} y={62} size={11} />
      <rect x="436" y="110" width="12" height="30" className="fill-muted-foreground" />
      <rect x="424" y="138" width="36" height="8" rx="3" className="fill-muted-foreground" />
      <rect x="412" y="66" width="60" height="46" rx="5" strokeWidth="3" className="fill-card stroke-yty-wit" />
      <path d={ELEMENT_GLYPH_PATHS.wit} transform="translate(442 89) scale(0.8)" className="fill-yty-wit" />
    </svg>
  );
}

const AVATAR_TITLE_ID = "platform-vision-avatar-art";

/**
 * One starting avatar branching into four grown ones, an element each. The
 * four grown avatars stand at the centres of four equal columns, so a
 * four-column row of labels under the picture lines up with them at any width.
 */
export function GrowingAvatarArt({ title, className }: TitledArtProps) {
  const branches = [
    { element: "harmony", col: 65 },
    { element: "glow", col: 195 },
    { element: "valor", col: 325 },
    { element: "wit", col: 455 },
  ] as const;

  return (
    <svg viewBox="0 0 520 252" role="img" aria-labelledby={AVATAR_TITLE_ID} className={className}>
      <title id={AVATAR_TITLE_ID}>{title}</title>
      {branches.map((branch) => (
        <path
          key={`branch-${branch.element}`}
          d={`M260 88 C260 124 ${branch.col} 108 ${branch.col} 142`}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          className={VISION_TONES[branch.element].stroke}
        />
      ))}
      <ellipse cx="260" cy="82" rx="30" ry="5" className="fill-lifted" />
      <PixelSprite rows={AVATAR_BASE} palette={AVATAR_PALETTE} x={230} y={8} size={5} />
      {branches.map((branch) => (
        <g key={branch.element}>
          <ellipse cx={branch.col} cy="236" rx="34" ry="6" className={VISION_TONES[branch.element].fill} />
          <PixelSprite
            rows={overlay(AVATAR_BASE, AVATAR_GROWTH[branch.element])}
            palette={{ ...AVATAR_PALETTE, a: VISION_TONES[branch.element].fill }}
            x={branch.col - 36}
            y={146}
            size={6}
          />
        </g>
      ))}
      <Sparkle x={128} y={150} r={7} tone="act" />
      <Sparkle x={392} y={160} r={6} tone="world" />
      <Sparkle x={330} y={30} r={8} tone="act" />
      <Sparkle x={186} y={44} r={5} tone="harmony" />
    </svg>
  );
}

const STAIRCASE_TITLE_ID = "platform-vision-staircase-art";

/** The marketplace's three stages as three rising steps. */
export function StaircaseArt({ title, className }: TitledArtProps) {
  const steps = [
    { x: 10, y: 170 },
    { x: 126, y: 120 },
    { x: 242, y: 70 },
  ];

  return (
    <svg viewBox="0 0 360 230" role="img" aria-labelledby={STAIRCASE_TITLE_ID} className={className}>
      <title id={STAIRCASE_TITLE_ID}>{title}</title>
      {steps.map((step, i) => (
        <g key={step.x}>
          <rect x={step.x} y={step.y} width="108" height={220 - step.y} rx="4" strokeWidth="2" className="fill-card stroke-border" />
          <line x1={step.x + 2} y1={step.y} x2={step.x + 106} y2={step.y} strokeWidth="5" strokeLinecap="round" className="stroke-act" />
          <text x={step.x + 54} y="206" textAnchor="middle" fontSize="26" className="fill-muted-foreground font-semibold">
            {i + 1}
          </text>
        </g>
      ))}
      {/* Stage 1: a Gedu on their own. */}
      <Figure x={64} baseY={170} bodyClassName="fill-act" />
      {/* Stage 2: a Gedu handing their club's material to another. */}
      <Figure x={158} baseY={120} bodyClassName="fill-act" />
      <rect x="173" y="88" width="16" height="12" rx="2" className="fill-yty-wit" />
      <Figure x={204} baseY={120} bodyClassName="fill-muted-foreground" />
      {/* Stage 3: a Gedu leading a team, flag up. */}
      <line x1="278" y1="70" x2="278" y2="18" strokeWidth="3" strokeLinecap="round" className="stroke-muted-foreground" />
      <path d="M278 18 L298 24 L278 30Z" className="fill-world" />
      <Figure x={262} baseY={70} bodyClassName="fill-act" />
      <Figure x={302} baseY={70} bodyClassName="fill-yty-glow" />
      <Figure x={326} baseY={70} bodyClassName="fill-yty-harmony" />
      <Sparkle x={342} y={16} r={8} tone="act" />
    </svg>
  );
}

/** Gamers gathered round a campfire, with a seat left open. Decorative. */
export function CampfireArt({ className }: ArtProps) {
  const tones: readonly VisionTone[] = ["harmony", "glow", "valor", "wit", "harmony", "glow", "valor"];
  const seats = [180, 150, 120, 90, 60, 30, 0].map((degrees, i) => {
    const angle = (degrees * Math.PI) / 180;
    return {
      degrees,
      tone: tones[i % tones.length],
      x: 160 + 128 * Math.cos(angle),
      y: 150 - 70 * Math.sin(angle),
    };
  });

  return (
    <svg viewBox="0 0 320 210" aria-hidden="true" className={className}>
      <ellipse cx="160" cy="156" rx="150" ry="44" className="fill-card" />
      {seats.map((seat) => (
        <Figure key={seat.degrees} x={seat.x} baseY={seat.y} bodyClassName={VISION_TONES[seat.tone].fill} />
      ))}
      <Logs x={160} y={154} />
      <Flame x={160} y={150} />
      <rect x="128" y="62" width="6" height="6" className="fill-act" />
      <rect x="190" y="56" width="6" height="6" className="fill-act" />
      <rect x="176" y="38" width="5" height="5" className="fill-yty-valor" />
      <ellipse cx="160" cy="194" rx="16" ry="5" fill="none" strokeWidth="2" strokeDasharray="3 4" className="stroke-act" />
    </svg>
  );
}

/**
 * The road ahead: four waypoints on one winding path. Decorative — the
 * numbered steps under it say what each one is. The waypoints stand at the
 * centres of four equal columns, so a four-column row beneath lines up.
 */
export function RouteArt({
  tones,
  className,
}: ArtProps & { tones: readonly [VisionTone, VisionTone, VisionTone, VisionTone] }) {
  const points = [
    { x: 75, y: 80 },
    { x: 225, y: 34 },
    { x: 375, y: 80 },
    { x: 525, y: 34 },
  ];

  return (
    <svg viewBox="0 0 600 112" aria-hidden="true" className={className}>
      <path
        d="M8 80 L75 80 C150 80 150 34 225 34 C300 34 300 80 375 80 C450 80 450 34 525 34 L592 34"
        fill="none"
        strokeWidth="5"
        strokeDasharray="1 12"
        strokeLinecap="round"
        className="stroke-muted-foreground"
      />
      {points.map((point, i) => {
        const tone = tones[i];
        return (
          <g key={point.x} transform={`translate(${point.x} ${point.y})`}>
            <circle r="22" className={VISION_TONES[tone].fill} />
            <text y="8" textAnchor="middle" fontSize="22" className={cn("font-semibold", VISION_TONES[tone].onFill)}>
              {i + 1}
            </text>
          </g>
        );
      })}
      <Sparkle x={588} y={34} r={12} tone="act" />
    </svg>
  );
}

/** A small burst of sparkles over the closing line. Decorative. */
export function SparkleBurstArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 160 64" aria-hidden="true" className={className}>
      <Sparkle x={80} y={32} r={26} tone="act" />
      <Sparkle x={36} y={40} r={12} tone="world" />
      <Sparkle x={124} y={22} r={12} tone="harmony" />
      <Sparkle x={14} y={16} r={7} tone="glow" />
      <Sparkle x={148} y={50} r={7} tone="wit" />
      <Sparkle x={112} y={56} r={5} tone="valor" />
    </svg>
  );
}
