/**
 * Question 3 — the greys.
 *
 * One question is left in this set. `muted` #262626 and `accent` #212121 are
 * now the library's own neutrals, and the seven `sidebar-*` tokens are gone —
 * the rail is chrome and composes from the general neutrals, on the card
 * ground. What is still open is which of the two new greys a hover takes.
 *
 * **Accent measures barely above 1:1 against the card it lifts from**, which is
 * why the hover row is drawn on accent and then on muted rather than measured:
 * if the lift cannot be seen in the row, the number would not have helped.
 *
 * Both fills are real theme tokens now, so both columns are drawn in classes
 * rather than inline styles — what is on screen is what the app paints.
 */

import { Case, Compare, Exemplar, Panel, Question } from "./parts";

/**
 * The "Active" badge's fill and its label — Sogverse's `success` pair.
 *
 * The status colours are question 2's and are not the library's, so they are
 * spelled here rather than named. The row is drawn whole because a hover is
 * judged against the row it lifts, not against a stripped copy of it.
 */
const SUCCESS = "#2EB88A";
const SUCCESS_INK = "#FFFFFF";

/** The row's own geometry, identical in every column. Only the fill differs. */
const ROW =
  "flex items-center justify-between rounded-lg border border-border p-3";

/**
 * `admin/users/[id]/page.tsx` — an assigned-product row, copied class for class
 * from the real one.
 *
 * The hover fill is a literal class per state rather than one assembled from
 * the prop, because Tailwind scans source text and a class built at render time
 * is a class the stylesheet does not contain.
 */
function AppRow({ fill }: { fill: "rest" | "accent" | "muted" }) {
  return (
    <span
      className={
        fill === "accent"
          ? `${ROW} bg-accent`
          : fill === "muted"
            ? `${ROW} bg-muted`
            : ROW
      }
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">
          Minecraft club — Espoo
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          Wednesdays, 17:00
        </span>
      </span>
      <span
        className="ml-3 inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold"
        style={{
          backgroundColor: SUCCESS,
          color: SUCCESS_INK,
          borderColor: SUCCESS,
        }}
      >
        Active
      </span>
    </span>
  );
}

/** The card ground the list really sits on. */
function Framed({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">{children}</div>
  );
}

export function GreysSection() {
  return (
    <Question n={3} title="The greys">
      <Case title="Accent, as a hover">
        <Compare columns={2}>
          <Panel label="Today — hover on accent">
            <Exemplar
              file="admin/users/[id]/page.tsx"
              page="/admin/users/[id], the assigned-products list"
            >
              <Framed>
                <div className="space-y-2">
                  <AppRow fill="rest" />
                  <AppRow fill="accent" />
                </div>
              </Framed>
            </Exemplar>
          </Panel>
          <Panel label="Alternative — hover on muted">
            <Exemplar
              file="admin/users/[id]/page.tsx"
              page="the same list, with the hover fill swapped"
            >
              <Framed>
                <div className="space-y-2">
                  <AppRow fill="rest" />
                  <AppRow fill="muted" />
                </div>
              </Framed>
            </Exemplar>
          </Panel>
        </Compare>
      </Case>
    </Question>
  );
}
