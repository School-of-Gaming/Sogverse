import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import { REGISTRATION_CONSENT_DOCUMENTS } from "@/lib/constants/consent-documents";

/**
 * ============================================================================
 * The two registration documents: the text on screen is the version on file.
 * ============================================================================
 *
 * An acceptance row records WHICH VERSION of a document the parent was shown,
 * and the version labels are published by migration (00249 and whatever comes
 * after it). The texts they name live elsewhere — the terms page carries its
 * own "last updated" date, and the guardian declaration *is* the sentence
 * beside the register form's checkbox — and nothing in the type system ties
 * the two together. So this file does: change either text and this fails
 * until a migration publishes a new version row and the constants below are
 * moved to match.
 *
 * Why the terms date is a version at all: 00210 chose the page's own
 * "last updated" date as the label for every document it published, so a
 * migration bumping the date and a page edit changing the text are one
 * change, not two. A terms edit with no date change is a typo fix and needs
 * no new version; a date change with no migration is the failure this file
 * exists to catch.
 */

/** The version row each registration document has been published at. */
const PUBLISHED_VERSIONS: Record<
  (typeof REGISTRATION_CONSENT_DOCUMENTS)[number],
  string
> = {
  "terms-and-conditions": "2026-08-31",
  "guardian-declaration": "2026-09-11",
};

/**
 * The declaration's whole text, in the source locale. The other locales are
 * translations of this sentence; a change of *meaning* starts here.
 */
const DECLARATION_SENTENCE =
  "I confirm that I am a parent or legal guardian, and I agree to the <terms>Terms and Conditions</terms> and have read the <privacy>Privacy Policy</privacy>.";

const root = process.cwd();

function migrationsText(): string {
  const dir = join(root, "supabase", "migrations");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- the path is the migrations directory joined to a name that directory itself listed; reading every migration is the whole point of the check
    .map((name) => readFileSync(join(dir, name), "utf8"))
    .join("\n");
}

describe("the registration documents' versions", () => {
  it("are each published by a migration", () => {
    const sql = migrationsText();
    for (const slug of REGISTRATION_CONSENT_DOCUMENTS) {
      expect(sql).toContain(`('${slug}', '${PUBLISHED_VERSIONS[slug]}')`);
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

  it("name the declaration sentence the register form shows", () => {
    // Rewording the sentence changes what a parent agreed to. Publish a new
    // `guardian-declaration` version row, then move both constants above.
    expect(en.auth.register.termsLabel).toBe(DECLARATION_SENTENCE);
  });
});
