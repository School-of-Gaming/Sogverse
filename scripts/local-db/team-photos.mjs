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
 * a drawn outline cannot be mistaken for a real person's photo.
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

/**
 * One row per person: the file name, the hair shape, the background's two
 * gradient stops, and the figure's and hair's colours.
 */
const PEOPLE = [
  { file: "admin", hair: "short", bg: ["#1d3557", "#457b9d"], figure: "#f1faee", hairTone: "#a8dadc" },
  { file: "admin2", hair: "long", bg: ["#6d597a", "#b56576"], figure: "#ffe8d6", hairTone: "#e5989b" },
  { file: "juha.makela", hair: "buzz", bg: ["#264653", "#2a9d8f"], figure: "#e9f5db", hairTone: "#b5c99a" },
  { file: "helena.strand", hair: "bun", bg: ["#003049", "#669bbc"], figure: "#fdf0d5", hairTone: "#e9c46a" },
  { file: "daniel.okafor", hair: "curly", bg: ["#3d405b", "#81b29a"], figure: "#f4f1de", hairTone: "#c9ada7" },
  { file: "gedu", hair: "short", bg: ["#2b9348", "#80b918"], figure: "#f1f8e9", hairTone: "#c5e1a5" },
  { file: "aino.virtanen", hair: "ponytail", bg: ["#9d0208", "#e85d04"], figure: "#fff3e0", hairTone: "#ffba08" },
  { file: "mikko.lehtinen", hair: "short", bg: ["#0b3954", "#087e8b"], figure: "#e0fbfc", hairTone: "#98c1d9" },
  { file: "sofia.nieminen", hair: "long", bg: ["#7b2cbf", "#c77dff"], figure: "#f8edff", hairTone: "#e0aaff" },
  { file: "lucas.moreau", hair: "curly", bg: ["#023e8a", "#0096c7"], figure: "#e3f6fc", hairTone: "#90e0ef" },
  { file: "emma.koskinen", hair: "bun", bg: ["#bc4749", "#f2a65a"], figure: "#fff4e6", hairTone: "#ffd6a5" },
  { file: "oliver.grant", hair: "buzz", bg: ["#344e41", "#588157"], figure: "#eef5e9", hairTone: "#a3b18a" },
  { file: "joonas.heinonen", hair: "short", bg: ["#22223b", "#4a4e69"], figure: "#f2e9e4", hairTone: "#c9ada7" },
  { file: "veera.laaksonen", hair: "long", bg: ["#005f73", "#0a9396"], figure: "#e9fbf7", hairTone: "#94d2bd" },
  { file: "tuomas.rautio", hair: "buzz", bg: ["#d00000", "#ff7b00"], figure: "#fff1e6", hairTone: "#ffb703" },
  { file: "priya.nair", hair: "ponytail", bg: ["#240046", "#5a189a"], figure: "#f3e8ff", hairTone: "#c8b6ff" },
  { file: "niklas.holmberg", hair: "curly", bg: ["#1b4332", "#40916c"], figure: "#e8f8ef", hairTone: "#95d5b2" },
  { file: "lotta.saarinen", hair: "bun", bg: ["#ff006e", "#fb5607"], figure: "#fff0f5", hairTone: "#ffbe0b" },
  { file: "ben.carter", hair: "short", bg: ["#14213d", "#fca311"], figure: "#fefae0", hairTone: "#e5e5e5" },
  { file: "ronja.kallio", hair: "long", bg: ["#3a0ca3", "#4cc9f0"], figure: "#eef6ff", hairTone: "#b8c0ff" },
];

/** Hair drawn behind the head, then the shapes drawn over it. */
function hairShapes(hair, tone) {
  const cap =
    "M 248 470 C 236 320 318 268 400 268 C 486 268 566 322 552 470 " +
    "C 532 380 470 352 400 352 C 330 352 268 384 248 470 Z";
  switch (hair) {
    case "short":
      return { back: "", front: `<path d="${cap}" fill="${tone}"/>` };
    case "buzz":
      return {
        back: "",
        front: `<path d="M 262 420 C 268 316 330 282 400 282 C 470 282 532 316 538 420 C 510 360 460 334 400 334 C 340 334 290 360 262 420 Z" fill="${tone}"/>`,
      };
    case "long":
      return {
        back: `<path d="M 236 470 C 226 312 318 262 400 262 C 482 262 574 312 564 470 L 590 780 C 520 812 280 812 210 780 Z" fill="${tone}"/>`,
        front: `<path d="${cap}" fill="${tone}"/>`,
      };
    case "bun":
      return {
        back: `<circle cx="400" cy="250" r="68" fill="${tone}"/>`,
        front: `<path d="${cap}" fill="${tone}"/>`,
      };
    case "ponytail":
      return {
        back: `<path d="M 520 360 C 640 380 660 560 600 700 C 590 600 560 500 500 440 Z" fill="${tone}"/>`,
        front: `<path d="${cap}" fill="${tone}"/>`,
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
        .map(([cx, cy, r]) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${tone}"/>`)
        .join("");
      return { back: curls, front: "" };
    }
    default:
      throw new Error(`No hair shape called ${hair}`);
  }
}

function silhouette({ hair, bg, figure, hairTone }) {
  const { back, front } = hairShapes(hair, hairTone);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="${bg[0]}"/>
      <stop offset="1" stop-color="${bg[1]}"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <circle cx="400" cy="470" r="300" fill="#ffffff" opacity="0.08"/>
  ${back}
  <path d="M 100 1000 C 100 820 220 730 400 730 C 580 730 700 820 700 1000 Z" fill="${figure}"/>
  <rect x="346" y="560" width="108" height="200" rx="40" fill="${figure}"/>
  <ellipse cx="400" cy="460" rx="148" ry="168" fill="${figure}"/>
  ${front}
</svg>`;
}

await mkdir(outDir, { recursive: true });
for (const person of PEOPLE) {
  const file = path.join(outDir, `${person.file}.jpg`);
  const info = await sharp(Buffer.from(silhouette(person)))
    .jpeg({ quality: 80, mozjpeg: true })
    .toFile(file);
  console.log(`${person.file}.jpg  ${info.width}x${info.height}  ${info.size} bytes`);
}
