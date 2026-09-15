import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **Every place under `src/` that names `gedu_group_assignments` either reaches
 * for the cover branch as well, or says in writing why it does not.**
 *
 * A gedu covering a session is not assigned to its group — that is the whole
 * point of the feature — so every gate written against the assignment table
 * had to learn a second arm. The database half of that surface is policed by a
 * catalog query in the DB suite; this is the TypeScript half, and the two are
 * the same mechanism applied to the two languages the surface is written in.
 *
 * **The enumeration is a filesystem walk, never a list.** A frozen list of
 * files is a snapshot, and a snapshot is stale the moment somebody adds the
 * sixth gate — which is precisely the case this exists to catch. The walk finds
 * it; what a human then has to supply is the *classification*, which is the one
 * thing a machine cannot derive: does a missing cover branch here mean a bug,
 * or the design?
 *
 * Markdown is walked alongside the code on purpose. A colocated `CLAUDE.md`
 * describing a gate is part of that gate's surface: a doc that still says
 * membership means an assignment row, after the route learned otherwise, is a
 * wrong answer somebody will act on.
 *
 * Three things are deliberately *not* checked here, because they belong to the
 * DB suite: whether a predicate's body is correct, whether a policy composes
 * the right arm, and whether a new database function exists at all.
 */

const SRC = join(process.cwd(), "src");

/** Extensions the walk reads. Anything else is bytes, not a gate. */
const EXTENSIONS = [".ts", ".tsx", ".md"];

/** The assignment table — the surface this check is about. */
const ASSIGNMENTS = "gedu_group_assignments";

/**
 * What counts as reaching for the cover branch: the requests table itself, or
 * either of the two predicates that encapsulate it. Any one of them is enough,
 * because a file that names one of these has demonstrably been through this
 * question.
 */
const COVER_BRANCH = [
  "session_cover_requests",
  "gedu_covers_group",
  "gedu_covers_session",
];

/**
 * **Files that name the assignment table and are assignment-only by nature**,
 * each with the reason a missing cover branch is the design rather than a gap.
 *
 * The bar for adding an entry is the bar for the DB suite's own annotated list:
 * write the sentence you would want to read in a review. "Not a gate" is not a
 * reason; *why* it is not a gate is.
 *
 * A `Map` rather than an object literal, because the keys are file paths that a
 * walk produced: an object answers `constructor` and `__proto__` off its
 * prototype chain, which would silently classify a file nobody annotated.
 */
const ASSIGNMENT_ONLY = new Map<string, string>([
  [
    "components/admin/products/product-list-filters.tsx",
    "A filter over the admin product list: it asks which gedus are ASSIGNED to each product so an admin can narrow the list by one of them. It gates nothing, and a substitution is not a standing property of a product — a sub who covered one afternoon is not one of a club's educators, and listing them as one would make the filter answer a different question from the one it asks.",
  ],
  [
    "services/products/products.service.ts",
    "Embeds `gedu_group_assignments(gedu_id)` on the admin product read, feeding the filter above. Same reason: it LISTS a product's standing staff rather than gating on them.",
  ],
  [
    "services/assignments/assignments.service.ts",
    "Names the table in prose, to say which rows the assignment arm of `get_my_assigned_products` comes from. The cover arm of that same read is carried on the row's own `kind` discriminator, which this file maps; there is no gate here to widen.",
  ],
]);

/** Every file under `src/` whose bytes name the assignment table. */
function filesNamingAssignments(): string[] {
  const found: string[] = [];

  const walk = (dir: string): void => {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- walks a fixed in-repo directory (src/) from a path built out of cwd and a literal, no external input; the walk IS the regeneration command this check is built on
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!EXTENSIONS.some((ext) => entry.name.endsWith(ext))) continue;
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- reads a file the fixed in-repo walk above discovered
      if (!readFileSync(full, "utf8").includes(ASSIGNMENTS)) continue;
      found.push(relative(SRC, full).split(sep).join("/"));
    }
  };

  walk(SRC);
  return found.sort();
}

function hasCoverBranch(path: string): boolean {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the path came out of the fixed in-repo walk above, or out of the annotated table in this file; reading it is the point of the check
  const source = readFileSync(join(SRC, path.split("/").join(sep)), "utf8");
  return COVER_BRANCH.some((token) => source.includes(token));
}

describe("the cover branch on every gate named in TypeScript", () => {
  it("finds the surface at all", () => {
    // A walk that matched nothing would make every assertion below vacuous —
    // which is exactly how a completeness check rots into a rubber stamp.
    expect(filesNamingAssignments().length).toBeGreaterThan(3);
  });

  it("classifies every file: the cover branch, or a written reason", () => {
    const unclassified = filesNamingAssignments().filter(
      (path) => !hasCoverBranch(path) && !ASSIGNMENT_ONLY.has(path),
    );

    expect(
      unclassified,
      `These files name ${ASSIGNMENTS} without reaching for the cover branch and without an annotation.\n` +
        `Either widen them (a covering gedu is not assigned to the group they cover), or add an entry to\n` +
        `ASSIGNMENT_ONLY in this file saying why a missing cover branch is the design:\n  ` +
        unclassified.join("\n  "),
    ).toEqual([]);
  });

  it("keeps the annotated list honest — no entry outlives its file", () => {
    // An annotation for a file that no longer names the table, or that has
    // since grown the cover branch, is a rubber stamp waiting to be inherited.
    // Deleting it is part of the change that made it untrue.
    const surface = new Set(filesNamingAssignments());
    const stale = [...ASSIGNMENT_ONLY.keys()].filter(
      (path) => !surface.has(path) || hasCoverBranch(path),
    );

    expect(
      stale,
      "These ASSIGNMENT_ONLY entries no longer describe anything — the file has " +
        "stopped naming the table, or it now carries the cover branch. Delete them:\n  " +
        stale.join("\n  "),
    ).toEqual([]);
  });

  it("gives every annotation a real reason", () => {
    const thin = [...ASSIGNMENT_ONLY.entries()]
      .filter(([, reason]) => reason.trim().length < 40)
      .map(([path]) => path);

    expect(
      thin,
      "An annotation is the whole point of the list: a deliberate omission and a " +
        "missed gate look identical without one.\n  " +
        thin.join("\n  "),
    ).toEqual([]);
  });
});
