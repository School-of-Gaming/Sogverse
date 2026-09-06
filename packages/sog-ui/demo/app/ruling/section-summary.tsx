/**
 * Question 0 — the inventory.
 *
 * A table of names: the token, what it paints today, how many call sites it
 * has, and the verdict in one phrase. Every reason behind a verdict is in the
 * doc comments in `inventory.ts`, beside the values it explains.
 *
 * The neutrals, the signature pair, the four Yty families, the four statuses and
 * the sixteen picks have left the table. Those rows are ruled and landed — the
 * tokens are the library's now — so the gallery that made their names legible
 * has gone with them. The four product-type colours have left it with nothing in
 * their place: a product kind takes a Yty family now, so it is not a colour
 * Sogverse defines. What is left is what is still open: the colours with no
 * token behind them, and the alpha steps.
 *
 * The status set keeps one table, and it is keyed on the **construct** rather
 * than on the token. The values are ruled; what is not yet swept is the 335 call
 * sites, and which of the four a site spends is not the interesting axis — a
 * status colour is ink under a field, a wash behind a paragraph, a solid disc on
 * a corner and a dot on a rail, and those ask different things of the same hex.
 * The construct is the unit the sweep runs in, so it is the unit the table is
 * keyed on.
 *
 * The alpha steps get a table of their own shape, carrying no swatch: an alpha
 * step has no colour of its own to show. It had a fourth column naming what
 * each step lands on, and that column has gone with the ruling — the fifteen
 * sites that blended over a ground the system had not chosen are the library's
 * scrim and glass now, so every row left over sits on a token and the column
 * would say one thing on every line.
 *
 * The act and world steps get a third shape again. They are ruled — neither
 * carries alpha anywhere — so what is open is what stands in each place, and
 * that is a question per *job* rather than per token or per ground. Its first
 * column is therefore the job, which is the unit the owner rules on and the
 * unit question 7 draws.
 */

import {
  ACT_ALPHA_JOBS,
  ALPHA_SITES,
  LOOSE_COLOURS,
  STATUS_SITES,
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

/** The same table without the swatch column, for rows whose subject is a step rather than a colour. */
function AlphaGroup({ title }: { title: string }) {
  return (
    <div>
      <Caps>{title}</Caps>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-body-s">
          <thead>
            <tr className="border-b border-border text-left align-bottom">
              <th className="py-2 pr-4 font-semibold tracking-wider uppercase">
                Step
              </th>
              <th className="py-2 pr-4 font-semibold tracking-wider uppercase">
                Where
              </th>
              <th className="py-2 text-right font-semibold tracking-wider uppercase">
                Uses
              </th>
            </tr>
          </thead>
          <tbody>
            {ALPHA_SITES.map((site) => (
              <tr
                key={`${site.step} ${site.where}`}
                className="border-b border-border align-top"
              >
                <td className="py-2 pr-4 font-brand-mono">{site.step}</td>
                <td className="py-2 pr-4 text-muted-foreground">{site.where}</td>
                <td className="py-2 text-right font-brand-mono text-muted-foreground">
                  {site.uses}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * The status surface, keyed on the construct rather than on the token.
 *
 * A status colour is not one thing spent 335 times — it is ink under a field, a
 * wash behind a paragraph, a solid disc on a card's corner, a dot on a rail —
 * and each of those asks something different of the same hex. So the unit here
 * is the construct, which is the unit question 2 draws and the unit the set is
 * judged in.
 */
function StatusSiteGroup({ title }: { title: string }) {
  return (
    <div>
      <Caps>{title}</Caps>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-body-s">
          <thead>
            <tr className="border-b border-border text-left align-bottom">
              <th className="py-2 pr-4 font-semibold tracking-wider uppercase">
                Construct
              </th>
              <th className="py-2 pr-4 font-semibold tracking-wider uppercase">
                Step
              </th>
              <th className="py-2 pr-4 font-semibold tracking-wider uppercase">
                Where
              </th>
              <th className="py-2 pr-4 text-right font-semibold tracking-wider uppercase">
                Uses
              </th>
              <th className="py-2 text-right font-semibold tracking-wider uppercase">
                Files
              </th>
            </tr>
          </thead>
          <tbody>
            {STATUS_SITES.map((site) => (
              <tr key={site.construct} className="border-b border-border align-top">
                <td className="py-2 pr-4">{site.construct}</td>
                <td className="py-2 pr-4 font-brand-mono">{site.step}</td>
                <td className="py-2 pr-4 text-muted-foreground">{site.where}</td>
                <td className="py-2 pr-4 text-right font-brand-mono text-muted-foreground">
                  {site.uses}
                </td>
                <td className="py-2 text-right font-brand-mono text-muted-foreground">
                  {site.files}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** The same table again, keyed on the job rather than on the ground. */
function ActGroup({ title }: { title: string }) {
  return (
    <div>
      <Caps>{title}</Caps>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-body-s">
          <thead>
            <tr className="border-b border-border text-left align-bottom">
              <th className="py-2 pr-4 font-semibold tracking-wider uppercase">
                Job
              </th>
              <th className="py-2 pr-4 font-semibold tracking-wider uppercase">
                Step
              </th>
              <th className="py-2 pr-4 font-semibold tracking-wider uppercase">
                Where
              </th>
              <th className="py-2 text-right font-semibold tracking-wider uppercase">
                Uses
              </th>
            </tr>
          </thead>
          <tbody>
            {ACT_ALPHA_JOBS.map((row) => (
              <tr key={row.job} className="border-b border-border align-top">
                <td className="py-2 pr-4">{row.job}</td>
                <td className="py-2 pr-4 font-brand-mono">{row.step}</td>
                <td className="py-2 pr-4 text-muted-foreground">{row.where}</td>
                <td className="py-2 text-right font-brand-mono text-muted-foreground">
                  {row.uses}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

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
        <StatusSiteGroup title="Status, by construct" />
        <Group title="Colours with no token behind them" rows={LOOSE_SUMMARY} />
        <AlphaGroup title="Colour at an alpha step" />
        <ActGroup title="Act and world at an alpha step, by job" />
      </div>
    </Question>
  );
}
