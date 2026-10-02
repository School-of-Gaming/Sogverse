import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SOG_MARK_BADGE,
  SOG_MARK_FILL,
  SOG_MARK_MONOGRAM_PATHS,
  SOG_MARK_NAME_PATHS,
  SOG_MARK_NAME_POLYGONS,
  SOG_MARK_NAME_RECT,
  SOG_MARK_VIEW_BOX,
} from "@/components/brand/sog-mark-geometry";

/**
 * The geometry module is the one code-format version of the full mark, for the
 * renderers that cannot load an `.svg`. This holds it to the asset: every shape
 * in the SVG is in the module with the fill it takes, and nothing else is.
 *
 * The reader is a few regexes because it reads exactly one known, flat file —
 * a badge path and one `<g>` of lettering — not arbitrary SVG.
 */

const DRIFT = "sog-logo-full.svg changed; update sog-mark-geometry.ts to match";

const svg = readFileSync(
  join(process.cwd(), "src/assets/brand/sog-logo-full.svg"),
  "utf8",
);

/**
 * Path data or a points list as a canonical token string: commands and numbers.
 * The asset separates every number by a space, a comma or a minus sign, so a
 * number is a run of digits and dots.
 */
function canonical(data: string): string {
  const tokens = data.match(/[A-Za-z]|-?[\d.]+/g) ?? [];
  return tokens.map((t) => (/[A-Za-z]/.test(t) ? t : String(Number(t)))).join(" ");
}

function attr(attrs: string, name: string): string | undefined {
  for (const [, key, value] of attrs.matchAll(/([\w-]+)="([^"]*)"/g)) {
    if (key === name) return value;
  }
  return undefined;
}

/** Every shape in the SVG as "kind fill geometry", fill inherited from its `<g>`. */
function shapesInSvg(): string[] {
  const shapes: string[] = [];
  let groupFill: string | undefined;
  for (const m of svg.matchAll(/<(\/?)(g|path|polygon|rect)\b([^>]*?)\/?>/g)) {
    const [, closing, tag, attrs] = m;
    if (tag === "g") {
      groupFill = closing ? undefined : attr(attrs, "fill");
      continue;
    }
    const fill = (attr(attrs, "fill") ?? groupFill)?.toLowerCase();
    const geometry =
      tag === "path"
        ? canonical(attr(attrs, "d") ?? "")
        : tag === "polygon"
          ? canonical(attr(attrs, "points") ?? "")
          : ["x", "y", "width", "height"]
              .map((k) => `${k}=${Number(attr(attrs, k))}`)
              .join(" ");
    shapes.push(`${tag} ${fill} ${geometry}`);
  }
  return shapes.sort();
}

/** The same listing built from the module, its fills resolved to their hex. */
function shapesInModule(): string[] {
  const badge = SOG_MARK_FILL.badge.toLowerCase();
  const ink = SOG_MARK_FILL.lettering.toLowerCase();
  const r = SOG_MARK_NAME_RECT;
  return [
    `path ${badge} ${canonical(SOG_MARK_BADGE)}`,
    ...[...SOG_MARK_MONOGRAM_PATHS, ...SOG_MARK_NAME_PATHS].map(
      (d) => `path ${ink} ${canonical(d)}`,
    ),
    ...SOG_MARK_NAME_POLYGONS.map((p) => `polygon ${ink} ${canonical(p)}`),
    `rect ${ink} x=${r.x} y=${r.y} width=${r.width} height=${r.height}`,
  ].sort();
}

describe("sog-mark-geometry matches sog-logo-full.svg", () => {
  it("has the asset's viewBox", () => {
    const viewBox = /<svg\b[^>]*\bviewBox="([^"]*)"/.exec(svg)?.[1];
    expect(canonical(SOG_MARK_VIEW_BOX), DRIFT).toBe(canonical(viewBox ?? ""));
  });

  it("reads a non-trivial number of shapes from the asset", () => {
    // Guards the reader itself: a regex that matched nothing would make the
    // two-way comparison below vacuous.
    expect(shapesInSvg().length).toBeGreaterThan(10);
  });

  it("holds every shape in the asset, with the fill it takes", () => {
    const derived = new Set(shapesInModule());
    const missing = shapesInSvg().filter((s) => !derived.has(s));
    expect(missing, DRIFT).toEqual([]);
  });

  it("holds nothing the asset does not", () => {
    const asset = new Set(shapesInSvg());
    const extra = shapesInModule().filter((s) => !asset.has(s));
    expect(extra, DRIFT).toEqual([]);
    // The two checks compare sets, so a shape listed twice needs the counts.
    expect(shapesInModule().length, DRIFT).toBe(shapesInSvg().length);
  });
});
