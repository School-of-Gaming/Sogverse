"use client";

import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useLanguageNames } from "@/hooks/use-language-names";
import {
  missingRequirementKey,
  type MissingRequirement,
} from "@/lib/products/session-requirements";
import { useQualificationNames } from "./qualification-names";

/**
 * The warning lines a confirm step carries when the gedu being placed falls
 * short of what the session requires — one line per missing qualification, one
 * if they do not speak the language the product is run in, and one if the
 * session is in person at a site outside their coverage areas, the shape the
 * certify-anyway dialog gives each missing prerequisite.
 *
 * **A warning, never a refusal.** For an admin a missing requirement is a gap
 * they may knowingly go past (`src/services/gedu/CLAUDE.md`), so the dialog
 * that carries these keeps its ordinary button: the lines are what stops a
 * skimming admin, and they sit directly above the buttons so the last thing
 * read before the choice is what is being chosen past.
 *
 * Renders nothing when nothing is missing, so a caller drops it into its
 * dialog unconditionally and a pick meeting every requirement reads exactly as
 * it always did.
 */
export function MissingRequirementsWarning({
  missing,
}: {
  missing: readonly MissingRequirement[];
}) {
  const t = useTranslations("admin.missingRequirements");
  const qualificationNames = useQualificationNames();
  const languageName = useLanguageNames();
  if (missing.length === 0) return null;

  function line(requirement: MissingRequirement): string {
    switch (requirement.kind) {
      case "qualification":
        return t("qualification", {
          qualification: qualificationNames[requirement.qualification],
        });
      case "language":
        return t("language", { language: languageName(requirement.language) });
      case "coverage":
        // Every in-person product names its site; the bare line is only for
        // a read that somehow arrived without the name.
        return requirement.site === null
          ? t("coverageUnnamed")
          : t("coverage", { site: requirement.site });
    }
  }

  return (
    <div className="space-y-2">
      {missing.map((requirement) => (
        <Alert key={missingRequirementKey(requirement)} variant="warning">
          <AlertDescription>{line(requirement)}</AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
