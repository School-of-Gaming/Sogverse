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
 * short of what the session requires — one line per missing qualification, and
 * one if they do not speak the language the product is run in, the shape the
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
  return (
    <div className="space-y-2">
      {missing.map((requirement) => (
        <Alert key={missingRequirementKey(requirement)} variant="warning">
          <AlertDescription>
            {requirement.kind === "qualification"
              ? t("qualification", {
                  qualification: qualificationNames[requirement.qualification],
                })
              : t("language", { language: languageName(requirement.language) })}
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
