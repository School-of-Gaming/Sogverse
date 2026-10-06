"use client";

/**
 * Admin editor for a Gedu's spoken languages, on the Gedu's /admin/users/[id]
 * page beside the coverage editor — the two answers substitute matching reads
 * besides certification. A Gedu sees a substitution request only for a session
 * in a language ticked here, so an empty list is an empty pool; this card is
 * how an admin fills one in for a Gedu who registered without any.
 *
 * Seeded with the profile row the page already read, so the boxes paint ticked
 * on the first frame; a save refetches that row and the people lists.
 */

import { useState } from "react";
import { AlertCircle, Languages } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SpokenLanguageCheckboxes } from "@/components/ui/spoken-language-checkboxes";
import { SPOKEN_LANGUAGES } from "@/lib/constants/spoken-languages";
import { useProfile, useSetUserSpokenLanguages } from "@/services/users";
import type { Profile, SpokenLanguageCode } from "@/types";

function sameLanguages(a: readonly SpokenLanguageCode[], b: readonly SpokenLanguageCode[]) {
  return a.length === b.length && a.every((code) => b.includes(code));
}

export function GeduSpokenLanguagesCard({
  geduId,
  initialProfile,
}: {
  geduId: string;
  /** The Gedu's profile row as the page read it. */
  initialProfile: Profile;
}) {
  const t = useTranslations("admin.geduLanguages");
  const c = useTranslations("common");
  const { data: profile } = useProfile(geduId, { initialData: initialProfile });
  const setLanguages = useSetUserSpokenLanguages();

  const saved = (profile ?? initialProfile).spoken_languages;
  // Before the first edit the boxes render straight off the saved list.
  const [draft, setDraft] = useState<SpokenLanguageCode[] | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  /**
   * Set synchronously before the save starts and cleared once it settles: the
   * card stays on the page through both outcomes. `mutateAsync` settles only
   * after the profile has been refetched, so dropping the draft then cannot
   * flash the old ticks.
   */
  const [committing, setCommitting] = useState(false);

  const selected = draft ?? saved;
  const isDirty = draft !== null && !sameLanguages(draft, saved);

  async function handleSave() {
    if (committing || draft === null) return;
    setSaveError(null);
    setCommitting(true);
    try {
      await setLanguages.mutateAsync({
        userId: geduId,
        // Stored in the vocabulary's order, whatever order they were ticked in.
        spokenLanguages: SPOKEN_LANGUAGES.filter((code) => draft.includes(code)),
      });
      setDraft(null);
    } catch {
      setSaveError(t("error"));
    } finally {
      setCommitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Languages className="h-5 w-5 text-act" aria-hidden />
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("note")}</p>

        <SpokenLanguageCheckboxes
          selected={selected}
          onChange={(next) => {
            setSaveError(null);
            setDraft(next);
          }}
          disabled={committing}
        />

        {/* One reserved line for the failure message, so surfacing it cannot
            move the save button out from under the pointer. */}
        <div className="flex items-start justify-between gap-3">
          <p
            className="flex min-h-[20px] flex-1 items-start gap-1.5 text-sm text-foreground"
            role="alert"
          >
            {saveError !== null && (
              <>
                <AlertCircle
                  className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                  aria-hidden
                />
                <span>{saveError}</span>
              </>
            )}
          </p>
          <Button type="button" onClick={handleSave} disabled={!isDirty || committing}>
            {committing ? c("saving") : c("save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
