import { readdir, readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import {
  GAMER_CONSENT_DOCUMENTS,
  REGISTRATION_CONSENT_DOCUMENTS,
} from "@/lib/constants/consent-documents";

/**
 * ============================================================================
 * The two self-service documents: the text on screen is the version on file.
 * ============================================================================
 *
 * An acceptance row records WHICH VERSION of a document the person was shown,
 * and the version labels are published by migration (00249, 00250 and whatever
 * comes after them). The texts they name live elsewhere — the terms page
 * carries its own "last updated" date, and the guardian declaration *is* the
 * sentence beside the add-gamer form's checkbox — and nothing in the type
 * system ties the two together. So this file does: change either text and this
 * fails until a migration publishes a new version row and the constants below
 * are moved to match.
 *
 * Why the terms date is a version at all: 00210 chose the page's own
 * "last updated" date as the label for every document it published, so a
 * migration bumping the date and a page edit changing the text are one
 * change, not two. A terms edit with no date change is a typo fix and needs
 * no new version; a date change with no migration is the failure this file
 * exists to catch.
 *
 * The two documents are accepted at different moments and against different
 * subjects — the terms once per account at registration, the declaration once
 * per CHILD as that child is created (00250) — which is why the sets they come
 * from are two constants rather than one. What they share is this file's rule.
 */

/** The version row each self-service document has been published at. */
const PUBLISHED_VERSIONS: Record<
  | (typeof REGISTRATION_CONSENT_DOCUMENTS)[number]
  | (typeof GAMER_CONSENT_DOCUMENTS)[number],
  string
> = {
  "terms-and-conditions": "2026-08-31",
  "guardian-declaration": "2026-09-14",
};

const SELF_SERVICE_DOCUMENTS = [
  ...REGISTRATION_CONSENT_DOCUMENTS,
  ...GAMER_CONSENT_DOCUMENTS,
];

/**
 * The declaration's whole text, in the source locale, in both the shapes the
 * form can render it in. The other locales are translations of these; a change
 * of *meaning* starts here.
 *
 * Both are pinned because both are the wording a parent may actually tick: the
 * box is the last row of the page the child is named on, so it renders — and
 * can be ticked — while the first-name field is still empty.
 */
const DECLARATION_KEYS = [
  "guardianAttestation",
  "guardianAttestationUnnamed",
] as const;

const DECLARATION_SENTENCES: Record<(typeof DECLARATION_KEYS)[number], string> = {
  guardianAttestation:
    "{name} is my child, or I am their legal guardian. I have read the <privacy>Privacy Policy</privacy>.",
  guardianAttestationUnnamed:
    "This gamer is my child, or I am their legal guardian. I have read the <privacy>Privacy Policy</privacy>.",
};

const root = process.cwd();

/**
 * Every `(slug, version)` pair any migration publishes, as `slug@version`.
 *
 * **Read once, off the main thread, and never as one string.** This used to
 * `readFileSync` all 242 migrations and `join` them into a ~9 MB buffer inside
 * the assertion — a quarter-gigabyte-per-run of blocking syscalls and a
 * megastring allocation, all on the worker's own thread and all charged to the
 * per-test timeout while thirty other files hammer the same disk in the fork
 * pool. The test then timed out at five seconds under load and passed in
 * isolation, which is the signature of a duration bound to contention rather
 * than to anything the test is about. Nothing here needs the concatenation: the
 * question is whether a pair was published, so each file is read
 * asynchronously, scanned for the pairs, and dropped, and the small answer is
 * memoized for the cases that follow.
 */
let publishedPairsCache: Promise<ReadonlySet<string>> | null = null;

function publishedPairs(): Promise<ReadonlySet<string>> {
  publishedPairsCache ??= readPublishedPairs();
  return publishedPairsCache;
}

async function readPublishedPairs(): Promise<ReadonlySet<string>> {
  const dir = join(root, "supabase", "migrations");
  const names = (await readdir(dir)).filter((name) => name.endsWith(".sql"));
  const perFile = await Promise.all(
    names.map(async (name) => {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- the path is the migrations directory joined to a name that directory itself listed; reading every migration is the whole point of the check
      const text = await readFile(join(dir, name), "utf8");
      return pairsIn(text);
    }),
  );
  return new Set(perFile.flat());
}

/**
 * The pairs one migration publishes.
 *
 * Scoped to the `consent_document_versions` statements rather than matched
 * loosely across the file: a two-element tuple is an ordinary shape in SQL, and
 * a match taken from some other table's INSERT would let a version pass as
 * published that nothing ever published.
 *
 * A tuple's first two values are the slug and the version; what follows them is
 * not the scan's business. A hand-written statement names those two columns and
 * stops there, while a statement dumped out of a database carries every column
 * positionally — so a tuple is read up to its second value and no further.
 */
function pairsIn(sql: string): string[] {
  const statements =
    sql.match(/INSERT\s+INTO\s+public\.consent_document_versions\b[^;]*;/gi) ?? [];
  return statements.flatMap((statement) =>
    [...statement.matchAll(/\(\s*'([^']+)'\s*,\s*'([^']+)'\s*[,)]/g)].map(
      ([, slug, version]) => `${slug}@${version}`,
    ),
  );
}

describe("the self-service documents' versions", () => {
  it("are each published by a migration", async () => {
    const pairs = await publishedPairs();

    // Anti-vacuity: a scan that found nothing would pass every `toContain`
    // below by finding nothing to contradict them.
    expect(pairs.size).toBeGreaterThan(0);

    for (const slug of SELF_SERVICE_DOCUMENTS) {
      expect([...pairs]).toContain(`${slug}@${PUBLISHED_VERSIONS[slug]}`);
    }
  });

  it("name the terms page's own last-updated date", () => {
    const page = readFileSync(
      join(
        root,
        "src",
        "app",
        "[locale]",
        "(public)",
        "terms-and-conditions",
        "page.tsx",
      ),
      "utf8",
    );
    const lastUpdated = /LAST_UPDATED = "(\d{4}-\d{2}-\d{2})"/.exec(page)?.[1];

    // A new date on the page is a new text: publish it as a new version row
    // before moving the constant above.
    expect(lastUpdated).toBe(PUBLISHED_VERSIONS["terms-and-conditions"]);
  });

  it("name the declaration sentences the add-gamer form shows", () => {
    // Rewording either sentence changes what a parent declared. Publish a new
    // `guardian-declaration` version row, then move both constants above.
    for (const key of DECLARATION_KEYS) {
      expect(en.family.addGamerForm[key]).toBe(DECLARATION_SENTENCES[key]);
    }
  });

  it("no longer asks for the declaration at registration", () => {
    // 00250 moved it to the child it is about. The register label is pinned
    // negatively rather than exactly, because it is no longer a versioned
    // document text — what matters is that the account-level tick has stopped
    // claiming to be a declaration about anybody.
    expect(REGISTRATION_CONSENT_DOCUMENTS).not.toContain("guardian-declaration");
    expect(en.auth.register.termsLabel).not.toMatch(/guardian/i);
  });
});
