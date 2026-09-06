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
 * Sogverse defines. The identicon's white and black have gone the same way, out
 * of the loose-colour table and into a numbered palette of four, and the media
 * rows left with the ruling that answered them.
 *
 * **Two whole tables have gone with the sweeps that emptied them.** The status
 * surface was keyed on the construct and the act surface on the job, because
 * both were classifications waiting for their sweep to run; both have run, so
 * what is left of either is a row in the alpha table saying how many sites
 * survive and why. A classification of a surface that no longer exists is a
 * list nobody can check.
 *
 * The alpha table carries no swatch: an alpha step has no colour of its own to
 * show. It had a fourth column naming what each step lands on, and that column
 * went with the scrim and glass ruling — the fifteen sites that blended over a
 * ground the system had not chosen are library constructs now, so every row
 * left over sits on a token and the column would say one thing on every line.
 */

import { ALPHA_SITES, LOOSE_COLOURS } from "./inventory";
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
        <Group title="Colours with no token behind them" rows={LOOSE_SUMMARY} />
        <AlphaGroup title="Colour at an alpha step" />
      </div>
    </Question>
  );
}
