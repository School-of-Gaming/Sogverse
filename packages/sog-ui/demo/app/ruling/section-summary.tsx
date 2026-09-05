/**
 * Question 0 — the inventory.
 *
 * A table of names: the token, what it paints today, how many call sites it
 * has, and the verdict in one phrase. Every reason behind a verdict is in the
 * doc comments in `inventory.ts`, beside the values it explains.
 *
 * The neutrals and the signature pair have left the table. Those rows are ruled
 * and landed — the tokens are the library's now — so the gallery that made
 * their names legible has gone with them. What is left is what is still open:
 * the status colours, the four Yty families, the categorical palettes, and the
 * colours with no token behind them.
 */

import {
  LOOSE_COLOURS,
  PRODUCT_FAMILY,
  PRODUCT_PALETTE,
  STATUS_ROWS,
  YTY_ROWS,
  ZONE_PALETTE,
} from "./inventory";
import { Caps, Question } from "./parts";

interface Row {
  readonly token: string;
  readonly hex: string;
  readonly uses: number;
  readonly verdict: string;
}

function Group({ title, rows }: { title: string; rows: readonly Row[] }) {
  return (
    <div>
      <Caps>{title}</Caps>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-body-s">
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
              <th className="py-2 font-semibold tracking-wider uppercase">
                Verdict
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
                <td className="py-2 font-brand-mono">{row.verdict}</td>
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
    verdict: "retune",
  },
  {
    token: `${status.id}-foreground`,
    hex: status.todayForeground,
    uses: status.id === "warning" ? 2 : status.id === "info" ? 1 : 3,
    verdict:
      status.todayForeground === "#FFFFFF"
        ? "retune → ink"
        : "rename → act-foreground",
  },
]);

const YTY_SUMMARY: readonly Row[] = YTY_ROWS.map((family) => ({
  token: `yty-${family.id}`,
  hex: family.today,
  uses: family.uses,
  verdict: `retune → ${family.name.toLowerCase()} strong / soft`,
}));

const PALETTE_SUMMARY: readonly Row[] = [
  ...PRODUCT_PALETTE.map((entry) => ({
    token: entry.token,
    hex: entry.hex,
    uses: 2,
    verdict: `delete → yty-${PRODUCT_FAMILY[entry.token]}`,
  })),
  ...ZONE_PALETTE.map((entry) => ({
    token: entry.token,
    hex: entry.hex,
    uses: 5,
    verdict: "admit",
  })),
];

const LOOSE_SUMMARY: readonly Row[] = LOOSE_COLOURS.map((colour) => ({
  token: `${colour.label} — ${colour.where}`,
  hex: colour.value,
  uses: colour.uses,
  verdict: colour.verdict,
}));

export function SummarySection() {
  return (
    <Question n={0} title="The inventory">
      <div className="space-y-10">
        <Group title="Status" rows={STATUS_SUMMARY} />
        <Group title="The four Yty families" rows={YTY_SUMMARY} />
        <Group title="Categorical palettes" rows={PALETTE_SUMMARY} />
        <Group title="Colours with no token behind them" rows={LOOSE_SUMMARY} />
      </div>
    </Question>
  );
}
