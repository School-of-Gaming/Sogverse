/**
 * §2 — Which steps each outline level may take.
 *
 * **What is being asked.** The model decouples a heading's outline level (h1–h4,
 * which screen readers and tools read) from its visual step, and constrains the
 * pair with a table the types enforce. This section draws that table twice and
 * two real pages' outlines under it.
 *
 * **The two tables.**
 *
 * - `proposed` is the table as first put: h1 hero or page-title; h2 section or
 *   card-title; h3 card-title or sub-section; h4 sub-section or label.
 * - `with the survey's sites` widens it where real usage argues, and only there:
 *   - **`label` at h2 and h3.** The furniture headings head real regions — the
 *     session feed on a family product page, the other-groups rail in a group
 *     workspace, the consent banner, the Roblox page's documents list — and
 *     every one of them is an h2 or an h3 today. A label only at h4 would push
 *     each of them three or two levels below its parent, which is an outline a
 *     screen reader announces wrongly. (§7 asks whether each is a heading at
 *     all; if they are not, this widening is not needed.)
 *   - Nothing else. `card-title` at h2 is already in the first table, and it is
 *     the one the dialogs and sheets need (their titles are h2 at 18px today),
 *     and the one the admin dashboard needs, whose panels sit straight under
 *     the page title with no section between.
 *
 * A cell draws the step it allows; an empty cell is a pair the types refuse.
 *
 * **The two outlines.** The admin dashboard is the shape with no sections —
 * page title, then panels — and today it skips from h1 to h3, because CardTitle
 * is always an h3. The parent dashboard is the shape with sections — a child's
 * name, then the child's clubs — and today its clubs are not headings at all.
 * Each is drawn today and under the table, with its outline listed beside it.
 * The page title on the parent dashboard is visually hidden today and stays
 * hidden in both drawings; it appears in the outline.
 *
 * **Worth seeing in the parent drawing.** `section` (36px) is larger than every
 * `page-title` candidate (28–32px), so on a page with both, the section heading
 * outranks the page's own title by eye while ranking under it in the outline.
 */

import { CalendarClock, ChevronRight } from "lucide-react";

import { Case, CardGround, Column, Columns, Exemplar, Question } from "./parts";
import { LABEL, PAGE_TITLE_DRAWN, STEP } from "./steps";

const STEP_COLUMNS = [
  { name: "hero", cls: STEP.hero },
  { name: "page-title", cls: PAGE_TITLE_DRAWN },
  { name: "section", cls: STEP.section },
  { name: "card-title", cls: STEP.cardTitle },
  { name: "sub-section", cls: STEP.subSection },
  { name: "label", cls: LABEL[14] },
] as const;

type StepName = (typeof STEP_COLUMNS)[number]["name"];
type Level = "h1" | "h2" | "h3" | "h4";

const PROPOSED: Record<Level, readonly StepName[]> = {
  h1: ["hero", "page-title"],
  h2: ["section", "card-title"],
  h3: ["card-title", "sub-section"],
  h4: ["sub-section", "label"],
};

const WITH_SURVEY: Record<Level, readonly StepName[]> = {
  h1: ["hero", "page-title"],
  h2: ["section", "card-title", "label"],
  h3: ["card-title", "sub-section", "label"],
  h4: ["sub-section", "label"],
};

const LEVELS: readonly Level[] = ["h1", "h2", "h3", "h4"];

function Matrix({ table }: { table: Record<Level, readonly StepName[]> }) {
  return (
    <div className="overflow-x-auto">
      <table className="border-collapse">
        <thead>
          <tr>
            <th className="p-3" />
            {STEP_COLUMNS.map(({ name }) => (
              <th
                key={name}
                className="border-b border-border p-3 text-left text-body-s font-normal text-muted-foreground"
              >
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {LEVELS.map((level) => (
            <tr key={level}>
              <th className="border-r border-border p-3 text-left font-mono text-body-s font-normal text-muted-foreground">
                {level}
              </th>
              {STEP_COLUMNS.map(({ name, cls }) => (
                <td
                  key={name}
                  className="border-b border-border p-3 align-middle"
                >
                  {table[level].includes(name) ? (
                    <span className={cls}>Aa</span>
                  ) : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A page's heading outline, as a screen reader's heading list reads it. */
function Outline({
  items,
}: {
  items: readonly { level: 1 | 2 | 3 | 4; text: string; step?: string }[];
}) {
  const indent = {
    1: "pl-0",
    2: "pl-5",
    3: "pl-10",
    4: "pl-15",
  } as const;
  return (
    <ul className="space-y-1 text-body-s">
      {items.map((item, i) => (
        <li key={i} className={indent[item.level]}>
          <span className="font-mono text-muted-foreground">{`h${item.level}`}</span>{" "}
          {item.text}
          {item.step ? (
            <span className="text-muted-foreground">{` — ${item.step}`}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** One club row from the parent dashboard, with its name in the given element and class. */
function ClubCard({ named }: { named: "p" | "h3" }) {
  const Name = named;
  return (
    <CardGround>
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
              Club
            </p>
            <Name
              className={
                named === "h3"
                  ? STEP.cardTitle
                  : "text-lg leading-tight font-semibold"
              }
            >
              Minecraft-maanantaikerho
            </Name>
          </div>
          <ChevronRight aria-hidden className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex items-start gap-1.5 text-sm text-muted-foreground">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span className="tabular-nums">Mondays 17:00–18:30</span>
        </div>
      </div>
    </CardGround>
  );
}

export function LevelsSection() {
  return (
    <Question n={2} title="Level → step">
      <Case title="The table">
        <Columns of={2}>
          <Column name="proposed">
            <Matrix table={PROPOSED} />
          </Column>
          <Column name="with the survey's sites">
            <Matrix table={WITH_SURVEY} />
          </Column>
        </Columns>
      </Case>

      <Case title="A page with no sections">
        <Exemplar
          file="src/app/[locale]/(dashboard)/admin/page.tsx"
          page="Admin dashboard"
        >
          <Columns of={2}>
            <Column name="today">
              <div className="space-y-6">
                <div>
                  <h1 className="text-3xl font-bold">Dashboard</h1>
                  <p className="text-muted-foreground">
                    What needs an admin today, who is on the platform, and what
                    is running.
                  </p>
                </div>
                <CardGround>
                  <h3 className="font-semibold tracking-tight text-xl">
                    Needs attention
                  </h3>
                </CardGround>
                <CardGround>
                  <h3 className="font-semibold tracking-tight text-xl">
                    Schedule
                  </h3>
                  <h3 className="mt-8 text-sm font-semibold">Coming up</h3>
                </CardGround>
                <Outline
                  items={[
                    { level: 1, text: "Dashboard" },
                    { level: 3, text: "Needs attention" },
                    { level: 3, text: "Schedule" },
                    { level: 3, text: "Coming up" },
                  ]}
                />
              </div>
            </Column>
            <Column name="proposed">
              <div className="space-y-6">
                <div>
                  <h1 className={PAGE_TITLE_DRAWN}>Dashboard</h1>
                  <p className="text-muted-foreground">
                    What needs an admin today, who is on the platform, and what
                    is running.
                  </p>
                </div>
                <CardGround>
                  <h2 className={STEP.cardTitle}>Needs attention</h2>
                </CardGround>
                <CardGround>
                  <h2 className={STEP.cardTitle}>Schedule</h2>
                  <h3 className={`mt-8 ${LABEL[14]}`}>Coming up</h3>
                </CardGround>
                <Outline
                  items={[
                    { level: 1, text: "Dashboard", step: "page-title" },
                    { level: 2, text: "Needs attention", step: "card-title" },
                    { level: 2, text: "Schedule", step: "card-title" },
                    { level: 3, text: "Coming up", step: "label" },
                  ]}
                />
              </div>
            </Column>
          </Columns>
        </Exemplar>
      </Case>

      <Case title="A page with sections">
        <Exemplar
          file="src/components/parent/parent-dashboard-page-body.tsx"
          page="Parent dashboard"
        >
          <Columns of={2}>
            <Column name="today">
              <div className="space-y-6">
                <h1 className="sr-only">My SOG</h1>
                <h2 className="min-w-0 text-3xl font-bold break-words">Aino</h2>
                <ClubCard named="p" />
                <h2 className="pt-6 text-3xl font-bold">Billing</h2>
                <Outline
                  items={[
                    { level: 1, text: "My SOG" },
                    { level: 2, text: "Aino" },
                    { level: 2, text: "Billing" },
                  ]}
                />
              </div>
            </Column>
            <Column name="proposed">
              <div className="space-y-6">
                <h1 className={`sr-only ${PAGE_TITLE_DRAWN}`}>My SOG</h1>
                <h2 className={`min-w-0 break-words ${STEP.section}`}>Aino</h2>
                <ClubCard named="h3" />
                <h2 className={`pt-6 ${STEP.section}`}>Billing</h2>
                <Outline
                  items={[
                    { level: 1, text: "My SOG", step: "page-title" },
                    { level: 2, text: "Aino", step: "section" },
                    {
                      level: 3,
                      text: "Minecraft-maanantaikerho",
                      step: "card-title",
                    },
                    { level: 2, text: "Billing", step: "section" },
                  ]}
                />
              </div>
            </Column>
          </Columns>
        </Exemplar>
      </Case>
    </Question>
  );
}
