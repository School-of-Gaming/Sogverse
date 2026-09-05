/**
 * Question 0 — the whole inventory on one screen.
 *
 * Every colour Sogverse defines, what it costs to keep, and the fate proposed
 * for it. The one finding that reads best as a number rather than a picture:
 * **nothing is unused.** The brief allowed for a "delete (unused)" bucket and
 * the bucket came back empty — every token in `globals.css` has at least one
 * live call site, down to the single use of `sidebar-primary`.
 */

import {
  LOOSE_COLOURS,
  NEUTRAL_ROWS,
  PRODUCT_PALETTE,
  SIDEBAR_ROWS,
  STATUS_ROWS,
  YTY_ROWS,
  ZONE_PALETTE,
  type Fate,
} from "./inventory";
import { Caps, Note, Question } from "./parts";
import { BRAND, YTY_FAMILIES } from "../../../src/tokens/brand";

const FATE_LABEL: Record<Fate, string> = {
  already: "already in the library",
  alias: "a second name for a library token",
  admit: "enters the library as-is",
  retune: "enters the library retuned",
  ruling: "needs a ruling",
  delete: "delete — unused",
};

const FATE_COLOUR: Record<Fate, string> = {
  already: YTY_FAMILIES.wit.soft,
  alias: YTY_FAMILIES.wit.soft,
  admit: YTY_FAMILIES.glow.soft,
  retune: YTY_FAMILIES.valor.soft,
  ruling: BRAND.primary.hex,
  delete: YTY_FAMILIES.harmony.soft,
};

interface Row {
  readonly token: string;
  readonly hex: string;
  readonly uses: number;
  readonly fate: Fate;
  readonly note: string;
}

function Group({ title, rows }: { title: string; rows: readonly Row[] }) {
  return (
    <div>
      <Caps>{title}</Caps>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[52rem] border-collapse text-body-s">
          <thead>
            <tr className="border-b border-border text-left align-bottom">
              <th className="py-2 pr-4 font-semibold tracking-wider uppercase">
                Token
              </th>
              <th className="py-2 pr-4 font-semibold tracking-wider uppercase">
                Today
              </th>
              <th className="py-2 pr-4 text-right font-semibold tracking-wider uppercase">
                Uses
              </th>
              <th className="py-2 pr-4 font-semibold tracking-wider uppercase">
                Fate
              </th>
              <th className="py-2 font-semibold tracking-wider uppercase">
                Why
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.token} className="border-b border-border align-top">
                <td className="py-2 pr-4 font-brand-mono">{row.token}</td>
                <td className="py-2 pr-4">
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block h-4 w-4 shrink-0 rounded-sm border border-border"
                      style={{ backgroundColor: row.hex }}
                    />
                    <span className="font-brand-mono text-muted-foreground">
                      {row.hex}
                    </span>
                  </span>
                </td>
                <td className="py-2 pr-4 text-right font-brand-mono text-muted-foreground">
                  {row.uses}
                </td>
                <td
                  className="py-2 pr-4"
                  style={{ color: FATE_COLOUR[row.fate] }}
                >
                  {FATE_LABEL[row.fate]}
                </td>
                <td className="py-2 text-muted-foreground">{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const STATUS_SUMMARY: readonly Row[] = STATUS_ROWS.flatMap((status) => [
  {
    token: status.id,
    hex: status.today,
    uses: status.uses,
    fate: "retune" as const,
    note: `Collides in hue with ${status.collidesWith.name}. ${status.why}`,
  },
  {
    token: `${status.id}-foreground`,
    hex: status.todayForeground,
    uses: status.id === "warning" ? 2 : status.id === "info" ? 1 : 3,
    fate: status.todayForeground === "#FFFFFF" ? ("retune" as const) : ("alias" as const),
    note:
      status.todayForeground === "#FFFFFF"
        ? "White on a light fill, below the body floor. Becomes ink, which is primary-foreground under another name."
        : "Already ink — the same value as primary-foreground.",
  },
]);

const YTY_SUMMARY: readonly Row[] = YTY_ROWS.map((family) => ({
  token: `yty-${family.id}`,
  hex: family.today,
  uses: family.uses,
  fate: "retune" as const,
  note: `Replaced by the library's ${family.name} pair, which is a different hue family entirely.`,
}));

const PALETTE_SUMMARY: readonly Row[] = [
  ...PRODUCT_PALETTE.map((entry) => ({
    token: entry.token,
    hex: entry.hex,
    uses: 2,
    fate: "admit" as const,
    note: "A categorical palette entry: a glyph tint and a tile wash on the admin product key.",
  })),
  ...ZONE_PALETTE.map((entry) => ({
    token: entry.token,
    hex: entry.hex,
    uses: 5,
    fate: "admit" as const,
    note: "One of the sixteen colours a moderator picks a voice zone from — tile, glyph, ring, glow and swatch.",
  })),
];

const LOOSE_SUMMARY: readonly Row[] = LOOSE_COLOURS.map((colour) => ({
  token: colour.label,
  hex: colour.value,
  uses: colour.uses,
  fate: colour.label.startsWith("Klingon")
    ? ("delete" as const)
    : colour.label === "Lynx cyan"
      ? ("delete" as const)
      : ("admit" as const),
  note: `${colour.where}. ${colour.proposal}`,
}));

export function SummarySection() {
  return (
    <Question
      n={0}
      title="The inventory"
      asks="Every colour Sogverse defines today, with its live use count and the fate proposed for it. Nothing below is unused: the delete column is spent on colours with no token behind them, not on tokens nobody reaches."
    >
      <Note>
        Counts are utility-class uses in `src/`, measured rather than estimated;
        the regeneration commands are in the doc comment on `inventory.ts` beside
        the numbers. Two rows carry a `delete` mark for a different reason than
        disuse: the Klingon easter egg is artwork carrying its own palette, and
        the Lynx cyan belongs to a partner, so neither may enter School of
        Gaming&rsquo;s palette however often it is drawn.
      </Note>
      <div className="space-y-10">
        <Group
          title="Neutrals and the signature pair"
          rows={NEUTRAL_ROWS.map((row) => ({
            token: row.token,
            hex: row.today,
            uses: row.uses,
            fate: row.fate,
            note: row.note,
          }))}
        />
        <Group
          title="The sidebar's seven"
          rows={SIDEBAR_ROWS.map((row) => ({
            token: row.token,
            hex: row.today,
            uses: row.uses,
            fate: row.fate,
            note: row.note,
          }))}
        />
        <Group title="Status" rows={STATUS_SUMMARY} />
        <Group title="The four Yty families" rows={YTY_SUMMARY} />
        <Group title="Categorical palettes" rows={PALETTE_SUMMARY} />
        <Group title="Colours with no token behind them" rows={LOOSE_SUMMARY} />
      </div>
    </Question>
  );
}
