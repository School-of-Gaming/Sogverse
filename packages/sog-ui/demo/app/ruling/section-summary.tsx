/**
 * Question 0 — the inventory.
 *
 * A table of names: the token, what it paints today, how many call sites it
 * has, and the verdict in one phrase. Every reason behind a verdict is in the
 * doc comments in `inventory.ts`, beside the values it explains.
 *
 * Under the neutrals sits the gallery that makes the table legible: each of
 * those tokens in the construct that actually spends it, copied from the
 * component named in its caption. A swatch labelled `popover-foreground` tells
 * nobody anything; an open menu does.
 */

import type { ReactNode } from "react";
import {
  LOOSE_COLOURS,
  NEUTRAL_ROWS,
  PRODUCT_PALETTE,
  SIDEBAR_ROWS,
  STATUS_ROWS,
  YTY_ROWS,
  ZONE_PALETTE,
} from "./inventory";
import { CARD, Caps, EDGE, Exemplar, Question } from "./parts";
import {
  AppButtons,
  AppCard,
  AppField,
  AppMenu,
  AppPills,
  AppRow,
  AppSkeleton,
  TODAY,
} from "./recipes";

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

/** A framed exemplar, on the card ground most of these constructs really sit on. */
function Framed({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-lg border p-4"
      style={{ borderColor: EDGE, backgroundColor: CARD }}
    >
      {children}
    </div>
  );
}

/**
 * The neutrals and the signature pair, in the constructs that spend them.
 *
 * Every value here is already the library's, so there is nothing to compare —
 * the gallery exists so that the names in the table above stop being names.
 * Each recipe is copied class-for-class from the component in its caption, with
 * only the colour moved to an inline style, because the demo's stylesheet is
 * the library's theme and has no `bg-popover` to compile.
 *
 * States a static page cannot show are drawn as their own copies: the hovered
 * row, the focused field, the selected menu option.
 */
function NeutralExemplars() {
  return (
    <div>
      <Caps>The same tokens, in the things they draw</Caps>
      <div className="mt-4 grid gap-8 lg:grid-cols-2">
        <Exemplar
          file="ui/card.tsx"
          page="every dashboard section — card, card-foreground, border, muted-foreground"
        >
          <AppCard palette={TODAY} />
        </Exemplar>
        <Exemplar
          file="ui/button.tsx"
          page="every action — primary, secondary, input, accent, destructive"
        >
          <Framed>
            <AppButtons palette={TODAY} />
          </Framed>
        </Exemplar>
        <Exemplar
          file="ui/input.tsx with ui/label.tsx"
          page="/login and every admin search box — input, background, ring"
        >
          <Framed>
            <div className="space-y-5">
              <AppField palette={TODAY} focused={false} empty={false} />
              <AppField palette={TODAY} focused empty />
            </div>
          </Framed>
        </Exemplar>
        <Exemplar
          file="ui/filter-dropdown.tsx"
          page="/admin/products — popover, popover-foreground, accent"
        >
          <Framed>
            <AppMenu palette={TODAY} />
          </Framed>
        </Exemplar>
        <Exemplar
          file="admin/users/page.tsx"
          page="/admin/users, the role filter strip — info, muted"
        >
          <Framed>
            <AppPills palette={TODAY} />
          </Framed>
        </Exemplar>
        <Exemplar
          file="admin/users/page.tsx"
          page="/admin/users while the list loads — muted as a solid fill"
        >
          <Framed>
            <AppSkeleton palette={TODAY} />
          </Framed>
        </Exemplar>
        <Exemplar
          file="admin/users/[id]/page.tsx"
          page="/admin/users/[id] — border, accent on hover, success and warning badges"
        >
          <Framed>
            <div className="space-y-2">
              <AppRow palette={TODAY} state="rest" />
              <AppRow palette={TODAY} state="hover" />
              <AppRow palette={TODAY} state="warning" />
            </div>
          </Framed>
        </Exemplar>
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
        : "rename → primary-foreground",
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
    verdict: "admit",
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
        <Group title="Neutrals and the signature pair" rows={NEUTRAL_ROWS.map(toRow)} />
        <NeutralExemplars />
        <Group title="The sidebar's seven" rows={SIDEBAR_ROWS.map(toRow)} />
        <Group title="Status" rows={STATUS_SUMMARY} />
        <Group title="The four Yty families" rows={YTY_SUMMARY} />
        <Group title="Categorical palettes" rows={PALETTE_SUMMARY} />
        <Group title="Colours with no token behind them" rows={LOOSE_SUMMARY} />
      </div>
    </Question>
  );
}

function toRow(row: {
  token: string;
  today: string;
  uses: number;
  verdict: string;
}): Row {
  return {
    token: row.token,
    hex: row.today,
    uses: row.uses,
    verdict: row.verdict,
  };
}
