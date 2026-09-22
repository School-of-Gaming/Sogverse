import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * **A comment describes current behaviour, never a migration number.**
 *
 * A citation like "since 00206" names a file that records one day's change.
 * That is what git history is for, and the citation is worse than redundant:
 * the numbered migrations are periodically squashed into a fresh baseline, at
 * which point every number in the repo points at a file that no longer exists.
 * The reader is then left holding a reference they cannot follow, attached to a
 * sentence that was only ever about the past.
 *
 * What replaces it is stated in the root `CLAUDE.md` under "Code Style": a
 * comment says what the thing does now and why; a decision worth citing is
 * cited by its date and ruling, or by the `docs/records/` entry that tells the
 * story; a rule is cited by the `CLAUDE.md` that holds it.
 *
 * This is the mechanism for that rule rather than a one-off cleanup. The
 * surface is regenerated from disk on every run — no pinned list of files, no
 * pinned count — so a citation written tomorrow fails here the same way one
 * written today does.
 *
 * **Why the sweep reads whole files rather than parsed comments.** A migration
 * number is equally wrong in a string the UI never shows, in a doc comment, in
 * a markdown heading and in a SQL `COMMENT ON` body, and the last of those is
 * not a comment in any parser's sense — it is a string literal that becomes the
 * database's own description of an object. One regex over the text covers all
 * four, and the cost of that reach is the false positives classified below.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * The trees that are swept, each named on its own so a failure reports per
 * directory.
 *
 * `supabase/schema/` is generated rather than authored, and it is in scope for
 * exactly that reason: it is the dump of what the database says about itself,
 * so a number there is a number living in `pg_description` on a hosted
 * database, and the only way to change it is a migration that re-issues the
 * comment. `supabase/migrations/` is deliberately absent — a migration's own
 * header is the one place a migration number is the subject rather than a
 * citation, and those files are append-only anyway.
 */
const ROOTS: readonly { readonly label: string; readonly paths: readonly string[] }[] = [
  { label: "src/", paths: ["src"] },
  { label: "tests/", paths: ["tests"] },
  { label: "scripts/", paths: ["scripts"] },
  { label: "supabase/schema/", paths: ["supabase/schema"] },
  {
    label: "the seeds",
    paths: ["supabase/seed.sql", "supabase/rich-seed.sql"],
  },
];

/** The text files a citation can hide in: source, SQL, shell and prose. */
const SWEPT = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs|sql|md|sh|py)$/;

/** Directories a walk never descends into. */
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".next", "dist", "coverage"]);

/**
 * A migration version as this repo writes them: five digits, the first two
 * being zeroes, not part of a longer run of digits or letters.
 *
 * **The boundary is asymmetric on purpose.** A citation is as often the whole
 * file name as the bare number, and `_` is a word character — so a symmetric
 * `\b...\b` silently misses `00061_get_my_assigned_products.sql`, which is the
 * most followable citation of the lot and therefore the most tempting to write.
 * A leading boundary plus "not followed by another digit" catches the file
 * name, the bare number, and nothing six digits long.
 *
 * Deliberately not narrowed to buy out the false positives below. A narrower
 * regex ("only when preceded by the word migration", say) would miss the shape
 * the citations actually take — a bare number in parentheses — and every
 * narrowing is a hole nobody can see from a call site. The exclusions are
 * classified instead, one by one, each with the reason it is not a citation.
 */
const MIGRATION_NUMBER = /(?<![0-9A-Za-z])00[0-9]{3}(?![0-9])/g;

/**
 * The one thing in this repo that is genuinely five digits beginning `00`: a
 * Finnish postal code. Helsinki's range starts at `00100`, so the capital's
 * codes collide with our migration numbers exactly.
 *
 * The first two exclusions require the digits to sit inside quotes, because
 * that is what separates the two populations almost everywhere: a postcode is
 * *data* — a value in a fixture, an address in a seed row, a token quoted in
 * prose as the thing a parent types — while a migration citation is *prose*,
 * written bare. Neither can be satisfied by a number written the way a citation
 * is written.
 *
 * The next two are the postal suites, where a code is discussed rather than
 * passed: a code named in a sentence or a test title whose subject is postal
 * codes, and a prefix block written as a numeric span. Both are classified by
 * the shape they are written in rather than by the file they sit in, so the
 * exemption travels with the shape, and both carry a `migration` guard so a
 * citation written in the same paragraph is still reported. A code carrying a
 * PostgREST operator prefix (`eq.00100`) needs no rule of its own — the lines
 * that hold one are already about postal codes, and the redundancy check below
 * is what proved a third rule would buy nothing and widen the surface for it.
 */
const QUOTES = new Set(["'", '"', "`"]);

/**
 * What a paragraph about postal codes says, and a paragraph about a migration
 * does not. Matched as a substring rather than as a word, because the word is
 * as often inside an identifier — `getMunicipalitiesByPostalCode`,
 * `postal_codes` — as it is in the prose.
 */
const POSTAL_VOCABULARY = /postal|postcode|post code|zipcode|zip code/i;

/** The sweep's own file, which has to spell the shapes it forbids to explain them. */
const THIS_FILE = "tests/unit/no-migration-numbers-in-comments.test.ts";

const EXCLUSIONS: readonly {
  readonly id: string;
  readonly reason: string;
  readonly applies: (context: MatchContext) => boolean;
}[] = [
  {
    id: "quoted-postcode-literal",
    reason:
      "The whole quoted token is the five digits — a postal code as a value or as a token quoted in prose. A migration is never cited in quotes.",
    applies: ({ before, after }) => {
      const opener = before.at(-1);
      return opener !== undefined && QUOTES.has(opener) && after.startsWith(opener);
    },
  },
  {
    id: "postcode-in-a-street-address",
    reason:
      "A postal code inside a quoted Finnish address: a comma before it and the town after it, which is the only place a bare five-digit run appears in a string. The town may be on the next line when the string is wrapped.",
    applies: ({ before, follows }) =>
      /['"`]/.test(before) && before.endsWith(", ") && /^\s+\p{Lu}\p{L}/u.test(follows),
  },
  {
    id: "postcode-beside-the-postal-vocabulary",
    reason:
      "A code named in a comment or a test title whose own sentence is about postal codes — `postal`, `postcode` or `zip` within a line of it. That vocabulary never appears near a migration citation in this repo, and the `migration` guard keeps it that way.",
    applies: ({ neighbourhood }) =>
      POSTAL_VOCABULARY.test(neighbourhood) && !/migration/i.test(neighbourhood),
  },
  {
    id: "postcode-block-written-as-a-span",
    reason:
      "One end of a span of two codes (`00300-00399`), which is how a prefix block is written. Migrations are cited one at a time and never as a numeric range.",
    applies: ({ before, after, line }) =>
      (/[-–—]\s*$/.test(before) || /^\s*[-–—]\s*00[0-9]{3}/.test(after)) &&
      /00[0-9]{3}\s*[-–—]\s*00[0-9]{3}/.test(line) &&
      !/migration/i.test(line),
  },
  {
    id: "the-sweep-itself",
    reason:
      "This file, which cannot explain the shapes it forbids without writing them. Nothing here is a citation a reader could follow — they are examples of what not to write.",
    applies: ({ file }) => file === THIS_FILE,
  },
];

interface MatchContext {
  /** The repo-relative path of the file the five digits were found in. */
  readonly file: string;
  /** The whole line they were found on. */
  readonly line: string;
  /** Everything on the line ahead of the five digits. */
  readonly before: string;
  /** Everything on the line behind the five digits. */
  readonly after: string;
  /**
   * `after`, with the following line appended when the digits end the line —
   * a wrapped address puts its town there, and a comment's `*`, `//` or `--`
   * decoration is stripped first so the town is the first word seen.
   */
  readonly follows: string;
  /**
   * The line with its immediate neighbours, which is the unit a sentence
   * wrapped by the formatter actually occupies.
   */
  readonly neighbourhood: string;
}

/** A line's comment decoration, so a wrapped sentence reads as one sentence. */
function undecorate(line: string): string {
  return line.replace(/^\s*(?:\/\/+|\/?\*+|--+|#+)\s*/, "");
}

/** Every swept file under a path, as repo-relative POSIX paths. */
function sweptFiles(path: string): string[] {
  const full = join(repoRoot, path);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- a fixed in-repo path from ROOTS above, resolved against this file's own location; nothing here comes from outside the repo
  if (statSync(full).isFile()) return [path];
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- same fixed in-repo path, walked directory by directory
  return readdirSync(full, { withFileTypes: true }).flatMap((entry) => {
    const child = relative(repoRoot, join(full, entry.name)).split(sep).join("/");
    if (entry.isDirectory()) {
      return SKIPPED_DIRECTORIES.has(entry.name) ? [] : sweptFiles(child);
    }
    return SWEPT.test(entry.name) ? [child] : [];
  });
}

/**
 * Every five-digit run in one file, each with the context an exclusion judges
 * it by. One builder, used by both checks below, so the sweep and the
 * completeness check can never disagree about what they are looking at.
 */
function matchesIn(file: string): (MatchContext & { readonly number: number })[] {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- reads a file discovered by the fixed in-repo walk above
  const lines = readFileSync(join(repoRoot, file), "utf8").split(/\r?\n/);
  return lines.flatMap((line, index) =>
    [...line.matchAll(MIGRATION_NUMBER)].map((match) => {
      const after = line.slice(match.index + match[0].length);
      return {
        file,
        line,
        number: index + 1,
        before: line.slice(0, match.index),
        after,
        follows: after.trim() === "" ? `${after} ${undecorate(lines[index + 1] ?? "")}` : after,
        neighbourhood: [lines[index - 1] ?? "", line, lines[index + 1] ?? ""].join("\n"),
      };
    }),
  );
}

/** One reported line per offending line, however many numbers that line carries. */
function citationsUnder(paths: readonly string[]): string[] {
  const found = paths.flatMap((path) =>
    sweptFiles(path)
      .flatMap(matchesIn)
      .filter((context) => !EXCLUSIONS.some((exclusion) => exclusion.applies(context)))
      .map(({ file, number, line }) => `${file}:${number}  ${line.trim()}`),
  );
  return [...new Set(found)];
}

const WHY =
  "A comment describes what the code does now and why — never which migration changed it. A migration number names a file git already remembers, and the numbered files are squashed into a new baseline periodically, so the citation ends up pointing at nothing. Rewrite the sentence around the behaviour it is describing; where the decision itself is the point, cite it by date and ruling or by its docs/records entry. Comments on database objects (a COMMENT ON body in supabase/schema/) are changed by a migration that re-issues the comment, never by editing the dump.";

describe("no comment cites a migration number", () => {
  for (const { label, paths } of ROOTS) {
    it(`${label} cites none`, () => {
      expect(citationsUnder(paths), WHY).toEqual([]);
    });
  }

  const everything = ROOTS.flatMap(({ paths }) => paths).flatMap((path) =>
    sweptFiles(path).flatMap(matchesIn),
  );

  it("classifies every false positive it still excludes", () => {
    // The other half of an allowlist's job. An exclusion that nothing matches
    // any more is an exemption for a shape that left the repo, and it has to
    // leave the list with it — allowlist growth is the failure mode of every
    // allowlist design.
    expect(
      EXCLUSIONS.filter(
        (exclusion) => !everything.some((context) => exclusion.applies(context)),
      ).map(({ id }) => id),
      "This exclusion matches nothing in the swept tree any more — delete it, along with the reasoning that kept it.",
    ).toEqual([]);
  });

  it("carries no exclusion that a narrower one already covers", () => {
    // Same job, one level finer. An exclusion whose every match some other
    // exclusion also claims is not buying anything, and a rule that buys
    // nothing is a hole left open for no reason.
    const redundant = EXCLUSIONS.filter((exclusion) =>
      everything
        .filter((context) => exclusion.applies(context))
        .every((context) =>
          EXCLUSIONS.some((other) => other !== exclusion && other.applies(context)),
        ),
    ).map(({ id }) => id);

    expect(
      redundant,
      "Every match this exclusion claims is claimed by another one too — delete it.",
    ).toEqual([]);
  });
});
