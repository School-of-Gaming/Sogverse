"use client";

import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { GeduQualification } from "@/types";
import { useQualificationNames } from "./qualification-names";

/**
 * The warning lines a confirm step carries when the gedu being placed lacks a
 * qualification the product requires — one line per missing qualification, the
 * shape the certify-anyway dialog gives each missing prerequisite.
 *
 * **A warning, never a refusal.** For an admin a missing qualification is a gap
 * they may knowingly go past (`src/services/gedu/CLAUDE.md`), so the dialog
 * that carries these keeps its ordinary button: the lines are what stops a
 * skimming admin, and they sit directly above the buttons so the last thing
 * read before the choice is what is being chosen past.
 *
 * Renders nothing when nothing is missing, so a caller drops it into its
 * dialog unconditionally and a qualified pick reads exactly as it always did.
 */
export function MissingQualificationsWarning({
  missing,
}: {
  missing: readonly GeduQualification[];
}) {
  const t = useTranslations("admin.geduQualifications");
  const names = useQualificationNames();
  if (missing.length === 0) return null;
  return (
    <div className="space-y-2">
      {missing.map((qualification) => (
        <Alert key={qualification} variant="warning">
          <AlertDescription>
            {t("missingWarning", { qualification: names[qualification] })}
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
