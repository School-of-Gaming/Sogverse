/**
 * Draw the rich seed's team photos: one head-and-shoulders silhouette per
 * seeded admin and Gedu, written to `supabase/seed-images/team/` as the
 * 800 x 1000 JPEG the `team-photos` bucket takes (it refuses SVG).
 *
 *   node scripts/local-db/team-photos.mjs
 *
 * The JPEGs are checked in and `rich-images.sh` uploads them; this script only
 * exists so they can be redrawn. Each file is named for the local part of its
 * account's email, which is how `rich-images.sh` finds a person's photo, so a
 * new seeded team profile needs a row here and a rerun.
 *
 * A silhouette rather than a face on purpose: a seeded profile is nobody, and
 * a drawn outline cannot be mistaken for a real person's photo. Everything
 * else is drawn the way a real staff portrait looks — muted room backgrounds,
 * natural skin and hair, everyday clothes, soft light and a little grain — so
 * a page built on these placeholders is judged against the colour real photos
 * will bring, not against saturated vector art.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const WIDTH = 800;
const HEIGHT = 1000;

const outDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "supabase",
  "seed-images",
  "team",
);

const SKIN = {
  porcelain: "#f1d9c9",
  fair: "#e8c4a8",
  light: "#ddb594",
  medium: "#c69472",
  olive: "#b5865f",
  tan: "#a06e4c",
  brown: "#7e5136",
  deep: "#5a3826",
};

const HAIR = {
  black: "#1c1714",
  darkBrown: "#3a2a20",
  brown: "#5c4030",
  lightBrown: "#8a6a4c",
  blonde: "#c9a774",
  ashBlonde: "#b8a68a",
  auburn: "#7c3f26",
  grey: "#9a958f",
  dyedPlum: "#5e3a52",
};

const CLOTHES = {
  navy: "#26324a",
  charcoal: "#3b3d42",
  grey: "#7d8085",
  black: "#1e1f22",
  denim: "#4a6283",
  olive: "#5b6247",
  burgundy: "#5e2a33",
  oatmeal: "#cbbfa9",
  sogPurple: "#4b2f7a",
  white: "#e9e7e2",
};

/**
 * Backgrounds, each a real portrait setting: `wall` a plain painted wall,
 * `window` a wall lit from a window on one side, `office` a room out of focus
 * behind the sitter, `studio` a mottled grey studio backdrop.
 */
const PEOPLE = [
  { file: "admin", hair: "short", hairTone: HAIR.darkBrown, skin: SKIN.light, top: "shirt", cloth: CLOTHES.navy, bg: { kind: "wall", tones: ["#d9d6d0", "#bdb8b0"] } },
  { file: "admin2", hair: "long", hairTone: HAIR.auburn, skin: SKIN.fair, top: "crew", cloth: CLOTHES.charcoal, bg: { kind: "window", tones: ["#e9e4da", "#a9a296"], side: "left" } },
  { file: "juha.makela", hair: "buzz", hairTone: HAIR.ashBlonde, skin: SKIN.porcelain, top: "hoodie", cloth: CLOTHES.sogPurple, bg: { kind: "office", tones: ["#c9c6bf", "#8f8b84"], accent: "#7d8a6e" } },
  { file: "helena.strand", hair: "bun", hairTone: HAIR.blonde, skin: SKIN.fair, top: "crew", cloth: CLOTHES.oatmeal, bg: { kind: "studio", tones: ["#6d6c6a", "#3a3a3a"] } },
  { file: "daniel.okafor", hair: "curly", hairTone: HAIR.black, skin: SKIN.deep, top: "shirt", cloth: CLOTHES.white, bg: { kind: "wall", tones: ["#cfd2d3", "#a7abad"] } },
  { file: "gedu", hair: "short", hairTone: HAIR.brown, skin: SKIN.medium, top: "crew", cloth: CLOTHES.olive, bg: { kind: "office", tones: ["#d6cfc4", "#9c9284"], accent: "#b29b72" } },
  { file: "aino.virtanen", hair: "ponytail", hairTone: HAIR.lightBrown, skin: SKIN.fair, top: "crew", cloth: CLOTHES.denim, bg: { kind: "window", tones: ["#eeeae3", "#b4aea4"], side: "right" } },
  { file: "mikko.lehtinen", hair: "short", hairTone: HAIR.grey, skin: SKIN.light, top: "shirt", cloth: CLOTHES.charcoal, bg: { kind: "studio", tones: ["#8a8987", "#4d4d4c"] } },
  { file: "sofia.nieminen", hair: "long", hairTone: HAIR.dyedPlum, skin: SKIN.porcelain, top: "crew", cloth: CLOTHES.black, bg: { kind: "wall", tones: ["#e3ddd3", "#c4bcae"] } },
  { file: "lucas.moreau", hair: "curly", hairTone: HAIR.darkBrown, skin: SKIN.olive, top: "crew", cloth: CLOTHES.navy, bg: { kind: "office", tones: ["#bfc3c4", "#7f8486"], accent: "#8c7a68" } },
  { file: "emma.koskinen", hair: "bun", hairTone: HAIR.brown, skin: SKIN.light, top: "shirt", cloth: CLOTHES.burgundy, bg: { kind: "window", tones: ["#ebe7df", "#9e9a92"], side: "left" } },
  { file: "oliver.grant", hair: "buzz", hairTone: HAIR.black, skin: SKIN.brown, top: "crew", cloth: CLOTHES.grey, bg: { kind: "wall", tones: ["#d4d0c6", "#aaa497"] } },
  { file: "joonas.heinonen", hair: "short", hairTone: HAIR.blonde, skin: SKIN.fair, top: "hoodie", cloth: CLOTHES.charcoal, bg: { kind: "studio", tones: ["#7a7c7e", "#424446"] } },
  { file: "veera.laaksonen", hair: "long", hairTone: HAIR.ashBlonde, skin: SKIN.porcelain, top: "crew", cloth: CLOTHES.olive, bg: { kind: "office", tones: ["#d8d4cc", "#9a948a"], accent: "#6f7f6a" } },
  { file: "tuomas.rautio", hair: "buzz", hairTone: HAIR.lightBrown, skin: SKIN.light, top: "shirt", cloth: CLOTHES.denim, bg: { kind: "wall", tones: ["#dcdad5", "#b7b4ad"] } },
  { file: "priya.nair", hair: "ponytail", hairTone: HAIR.black, skin: SKIN.tan, top: "crew", cloth: CLOTHES.burgundy, bg: { kind: "window", tones: ["#e7e2d8", "#a49c8e"], side: "right" } },
  { file: "niklas.holmberg", hair: "curly", hairTone: HAIR.auburn, skin: SKIN.fair, top: "crew", cloth: CLOTHES.navy, bg: { kind: "studio", tones: ["#9a9893", "#5c5a56"] } },
  { file: "lotta.saarinen", hair: "bun", hairTone: HAIR.darkBrown, skin: SKIN.medium, top: "hoodie", cloth: CLOTHES.sogPurple, bg: { kind: "office", tones: ["#cdc8c0", "#8d877e"], accent: "#a08c6c" } },
  { file: "ben.carter", hair: "short", hairTone: HAIR.black, skin: SKIN.brown, top: "shirt", cloth: CLOTHES.oatmeal, bg: { kind: "wall", tones: ["#c9cccf", "#9ea2a6"] } },
  { file: "ronja.kallio", hair: "long", hairTone: HAIR.brown, skin: SKIN.light, top: "crew", cloth: CLOTHES.grey, bg: { kind: "window", tones: ["#ece8e1", "#aaa49a"], side: "left" } },
];

/** A hex colour moved toward black (negative) or white (positive) by `amount`. */
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const target = amount < 0 ? 0 : 255;
  const t = Math.abs(amount);
  const mix = (c) => Math.round(c + (target - c) * t);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** The room behind the sitter, already out of focus. */
function background({ kind, tones, side, accent }) {
  const [light, dark] = tones;
  const blur = `<filter id="dof" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="38"/></filter>`;
  switch (kind) {
    case "wall":
      return `<defs><radialGradient id="bg" cx="0.5" cy="0.38" r="0.75"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></radialGradient></defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>`;
    case "window": {
      const x1 = side === "left" ? 0 : 1;
      return `<defs><linearGradient id="bg" x1="${x1}" y1="0.2" x2="${1 - x1}" y2="0.6"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></linearGradient>${blur}</defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <g filter="url(#dof)"><rect x="${side === "left" ? -60 : 600}" y="60" width="260" height="560" fill="${shade(light, 0.5)}" opacity="0.8"/></g>`;
    }
    case "office":
      return `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></linearGradient>${blur}</defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <g filter="url(#dof)">
    <rect x="-40" y="140" width="230" height="16" fill="${shade(dark, -0.25)}"/>
    <rect x="-40" y="300" width="230" height="16" fill="${shade(dark, -0.25)}"/>
    <rect x="20" y="170" width="40" height="120" fill="${shade(accent, -0.2)}"/>
    <rect x="80" y="190" width="30" height="100" fill="${shade(dark, -0.1)}"/>
    <ellipse cx="700" cy="560" rx="110" ry="190" fill="${accent}"/>
    <circle cx="640" cy="170" r="70" fill="${shade(light, 0.55)}"/>
    <rect x="0" y="760" width="${WIDTH}" height="240" fill="${shade(dark, -0.15)}"/>
  </g>`;
    case "studio":
      return `<defs><radialGradient id="bg" cx="0.48" cy="0.36" r="0.7"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></radialGradient>${blur}</defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <g filter="url(#dof)" opacity="0.35">
    <ellipse cx="180" cy="260" rx="160" ry="110" fill="${shade(light, 0.15)}"/>
    <ellipse cx="650" cy="720" rx="200" ry="140" fill="${shade(dark, -0.2)}"/>
  </g>`;
    default:
      throw new Error(`No background called ${kind}`);
  }
}

/** Hair drawn behind the head, then the shapes drawn over it. */
function hairShapes(hair, fill) {
  const cap =
    "M 248 470 C 236 320 318 268 400 268 C 486 268 566 322 552 470 " +
    "C 532 380 470 352 400 352 C 330 352 268 384 248 470 Z";
  switch (hair) {
    case "short":
      return { back: "", front: `<path d="${cap}" fill="${fill}"/>` };
    case "buzz":
      return {
        back: "",
        front: `<path d="M 262 420 C 268 316 330 282 400 282 C 470 282 532 316 538 420 C 510 360 460 334 400 334 C 340 334 290 360 262 420 Z" fill="${fill}"/>`,
      };
    case "long":
      return {
        back: `<path d="M 236 470 C 226 312 318 262 400 262 C 482 262 574 312 564 470 L 590 780 C 520 812 280 812 210 780 Z" fill="${fill}"/>`,
        front: `<path d="${cap}" fill="${fill}"/>`,
      };
    case "bun":
      return {
        back: `<circle cx="400" cy="250" r="68" fill="${fill}"/>`,
        front: `<path d="${cap}" fill="${fill}"/>`,
      };
    case "ponytail":
      return {
        back: `<path d="M 520 360 C 640 380 660 560 600 700 C 590 600 560 500 500 440 Z" fill="${fill}"/>`,
        front: `<path d="${cap}" fill="${fill}"/>`,
      };
    case "curly": {
      const curls = [
        [262, 400, 50],
        [290, 320, 56],
        [350, 280, 58],
        [420, 270, 60],
        [486, 296, 56],
        [532, 360, 52],
        [546, 432, 42],
      ]
        .map(([cx, cy, r]) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`)
        .join("");
      return { back: curls, front: "" };
    }
    default:
      throw new Error(`No hair shape called ${hair}`);
  }
}

/** What sits at the neckline: a shirt collar, a hood, or a plain crew neck. */
function neckline(top, cloth) {
  switch (top) {
    case "shirt": {
      const collar = cloth === CLOTHES.white || cloth === CLOTHES.oatmeal ? shade(cloth, 0.4) : shade(cloth, 0.12);
      return `<path d="M 340 735 L 400 830 L 372 850 L 318 760 Z" fill="${collar}"/>
  <path d="M 460 735 L 400 830 L 428 850 L 482 760 Z" fill="${collar}"/>`;
    }
    case "hoodie":
      return `<path d="M 300 760 C 300 700 500 700 500 760 C 470 800 330 800 300 760 Z" fill="${shade(cloth, -0.25)}"/>
  <line x1="378" y1="790" x2="372" y2="900" stroke="${shade(cloth, 0.35)}" stroke-width="6" stroke-linecap="round"/>
  <line x1="422" y1="790" x2="428" y2="900" stroke="${shade(cloth, 0.35)}" stroke-width="6" stroke-linecap="round"/>`;
    default:
      return `<path d="M 346 742 C 360 772 440 772 454 742" fill="none" stroke="${shade(cloth, -0.2)}" stroke-width="10"/>`;
  }
}

/**
 * The sitter, lit softly from the upper left. The figure is drawn at its
 * original coordinates and lifted so the head sits in the upper third, as in
 * a head-and-shoulders portrait.
 */
function portrait({ hair, hairTone, skin, top, cloth, bg }) {
  const { back, front } = hairShapes(hair, "url(#hair)");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  ${background(bg)}
  <defs>
    <radialGradient id="skin" cx="0.38" cy="0.35" r="0.8"><stop offset="0" stop-color="${shade(skin, 0.08)}"/><stop offset="1" stop-color="${shade(skin, -0.14)}"/></radialGradient>
    <radialGradient id="hair" cx="0.35" cy="0.25" r="0.9"><stop offset="0" stop-color="${shade(hairTone, 0.12)}"/><stop offset="1" stop-color="${shade(hairTone, -0.2)}"/></radialGradient>
    <linearGradient id="cloth" x1="0" y1="0" x2="1" y2="0.4"><stop offset="0" stop-color="${shade(cloth, 0.06)}"/><stop offset="1" stop-color="${shade(cloth, -0.22)}"/></linearGradient>
    <linearGradient id="neck" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(skin, -0.3)}"/><stop offset="0.6" stop-color="${shade(skin, -0.1)}"/></linearGradient>
    <filter id="soft"><feGaussianBlur stdDeviation="1.2"/></filter>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="30"/></filter>
  </defs>
  <g transform="translate(0 -75)">
    <ellipse cx="420" cy="720" rx="340" ry="260" fill="#000" opacity="0.16" filter="url(#shadow)"/>
    <g filter="url(#soft)">
      ${back}
      <path d="M 40 1100 L 66 880 C 96 762 228 692 400 692 C 572 692 704 762 734 880 L 760 1100 Z" fill="url(#cloth)"/>
      <rect x="336" y="560" width="128" height="170" rx="44" fill="url(#neck)"/>
      <g transform="translate(0 -38)">${neckline(top, cloth)}</g>
      <ellipse cx="400" cy="460" rx="148" ry="168" fill="url(#skin)"/>
      ${front}
    </g>
  </g>
</svg>`;
}

/** Repeatable pseudo-random numbers, so a rerun redraws identical grain. */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A soft-light grain layer, mid-grey with fine noise, seeded per person. */
function grain(seed) {
  const random = prng(seed);
  const pixels = Buffer.alloc(WIDTH * HEIGHT);
  for (let i = 0; i < pixels.length; i++) {
    pixels[i] = 128 + Math.round((random() + random() + random() - 1.5) * 14);
  }
  return sharp(pixels, { raw: { width: WIDTH, height: HEIGHT, channels: 1 } }).png().toBuffer();
}

/** A dark edge vignette, as a lens leaves on any real portrait. */
const VIGNETTE = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
  <defs><radialGradient id="v" cx="0.5" cy="0.42" r="0.72"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.3"/></radialGradient></defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#v)"/>
</svg>`,
);

await mkdir(outDir, { recursive: true });
for (const [index, person] of PEOPLE.entries()) {
  const file = path.join(outDir, `${person.file}.jpg`);
  const info = await sharp(Buffer.from(portrait(person)))
    .composite([
      { input: VIGNETTE },
      { input: await grain(index + 1), blend: "soft-light" },
    ])
    .jpeg({ quality: 72, mozjpeg: true, chromaSubsampling: "4:2:0" })
    .toFile(file);
  console.log(`${person.file}.jpg  ${info.width}x${info.height}  ${info.size} bytes`);
}
