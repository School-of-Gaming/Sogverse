"use client";

import { useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { StatusLine } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  AuthoredBodyEditor,
  useAuthoredBodies,
  type AuthoredBodiesHandle,
} from "@/components/ui/authored-body-editor";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { LocaleTabs } from "@/components/ui/locale-tabs";
import { UnsavedChangesGuard } from "@/components/ui/unsaved-changes-guard";
import { ImagePicker } from "@/components/admin/products/image-picker";
import { useLanguageNames } from "@/hooks/use-language-names";
import { LOCALE_CONFIG, resolveLocale } from "@/lib/constants/locales";
import {
  activeLocaleDraft,
  addLocaleTab,
  editActiveLocaleDraft,
  removeLocaleTab,
  selectLocaleTab,
  writtenLocales,
  type LocaleTabState,
} from "@/lib/i18n/locale-tabs";
import {
  spotlightWriteFailure,
  type AdminSpotlight,
  type SpotlightInput,
} from "@/services/spotlights";
import {
  EMPTY_VERSION,
  emptySpotlightForm,
  isBlankSpotlightForm,
  isCompleteSpotlightVersion,
  sameAsSaved,
  spotlightFormFromSaved,
  spotlightInputFromForm,
  spotlightSaveBlocker,
  withPicture,
  type SpotlightForm,
  type SpotlightVersionDraft,
} from "./spotlight-form";

export interface SpotlightEditorProps {
  /** The spotlight as last read, or null for a new one. */
  spotlight: AdminSpotlight | null;
  /**
   * Save the spotlight. Throws on refusal, so the editor can say why. For a
   * new spotlight it resolves as the page leaves, which is why the editor
   * never hands the button back on that path.
   */
  save: (input: SpotlightInput) => Promise<void>;
  /** Leave without saving — offered on a new spotlight only. */
  onCancel?: () => void;
}

/**
 * **The page a spotlight is written on**, a new one and a saved one alike:
 * its text per language in tabs, its picture, whether it is in session report
 * emails, and Save.
 *
 * **The form is seeded once per spotlight, never per read.** Every spotlight
 * write and every catalogue replace or removal refetches the spotlight; the
 * form is keyed on its id and seeds its state at mount, so a refetch refreshes
 * whether the form differs from the saved copy and never what the admin is
 * typing.
 *
 * **Whether it is in the emails is part of the form**, saved by the same Save
 * in one write with the picture and the text, so the database judges the
 * state the admin asked for and never a half-saved one. A spotlight cannot be
 * on without a picture, so the box is disabled with the reason while there is
 * none, and taking the picture off unticks it.
 *
 * **Leaving with unsaved changes asks first**, until a save lands.
 */
export function SpotlightEditor(props: SpotlightEditorProps) {
  return <EditorForm key={props.spotlight?.id ?? "new"} {...props} />;
}

function EditorForm({ spotlight, save, onCancel }: SpotlightEditorProps) {
  const t = useTranslations("admin.spotlights");
  const languageName = useLanguageNames();
  const uiLocale = resolveLocale(useLocale());

  const [form, setForm] = useState<SpotlightForm>(() =>
    spotlight === null
      ? emptySpotlightForm(uiLocale)
      : spotlightFormFromSaved(spotlight, uiLocale),
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const enabledReasonId = useId();

  const bodies = useAuthoredBodies();

  const dirty = spotlight === null || !sameAsSaved(form, spotlight, bodies);
  // What leaving would lose. A new spotlight's save leaves the page on
  // purpose, so from the press on there is nothing to ask about.
  const unsaved =
    spotlight === null ? !saving && !isBlankSpotlightForm(form) : dirty;
  const saveDisabled = saving || !dirty;

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    const blocker = spotlightSaveBlocker(form);
    if (blocker !== null) {
      setSaveError(
        blocker.kind === "noVersion"
          ? t("errors.noVersion")
          : t("errors.versionIncomplete", {
              language: languageName(
                blocker.locale,
                LOCALE_CONFIG[blocker.locale].label,
              ),
            }),
      );
      return;
    }
    setSaveError(null);
    // Set before the first render after the click: a second press while the
    // first is in flight would create a second spotlight.
    setSaving(true);
    try {
      await save(spotlightInputFromForm(form));
      // A new spotlight's page is leaving; only a saved one stays to edit on.
      if (spotlight !== null) setSaving(false);
    } catch (failure) {
      setSaving(false);
      const reason = spotlightWriteFailure(failure);
      setSaveError(
        reason.kind === "reason"
          ? t("errors.saveFailedWithReason", { reason: reason.reason })
          : t("errors.saveFailed"),
      );
    }
  }

  return (
    <div className="space-y-6">
      <UnsavedChangesGuard when={unsaved} />

      <form onSubmit={handleSave} className="space-y-6">
        <Card>
          <CardContent className="space-y-5 p-6">
            <SpotlightVersionsSection
              tabs={form.tabs}
              setTabs={(update) =>
                setForm((current) => ({ ...current, tabs: update(current.tabs) }))
              }
              bodies={bodies}
            />

            <ImagePicker
              purpose="spotlight_image"
              label={t("fields.picture")}
              hint={t("hints.picture")}
              optional
              imageId={form.picture?.id ?? null}
              current={form.picture}
              onChange={(id, image) =>
                setForm((current) =>
                  withPicture(
                    current,
                    id === null || image === null ? null : { id, ...image },
                  ),
                )
              }
            />

            <div className="space-y-1">
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <Checkbox
                  className="mt-0.5"
                  checked={form.enabled}
                  disabled={form.picture === null}
                  aria-describedby={
                    form.picture === null ? enabledReasonId : undefined
                  }
                  onChange={(event) => {
                    const enabled = event.target.checked;
                    setForm((current) => ({ ...current, enabled }));
                  }}
                />
                {t("switchLabel")}
              </label>
              {/* The reason the box cannot be ticked, beside it, rather than a
                  refusal after Save. */}
              {form.picture === null && (
                <StatusLine
                  id={enabledReasonId}
                  status="info"
                  size="xs"
                  muted
                >
                  {t("needsPicture")}
                </StatusLine>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Negative first in the DOM, the affirmative last. */}
        <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:justify-end">
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              {t("actions.cancel")}
            </Button>
          )}
          <Button type="submit" disabled={saveDisabled}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {spotlight === null ? t("newPage.submit") : t("actions.save")}
          </Button>
        </div>
        {/* Last, so a refusal adds a line below everything rather than moving
            anything the admin was looking at. */}
        {saveError && (
          <StatusLine status="destructive" role="alert">
            {saveError}
          </StatusLine>
        )}
      </form>
    </div>
  );
}

/**
 * **A spotlight's text, one tab per language**, under the shared locale tab
 * bar. Each tab says whether its version is complete — a title and a body —
 * because the save refuses one that is not.
 *
 * The body editor reads its content once, at mount, so the locale is its key
 * and switching tabs remounts it on that language's draft.
 */
function SpotlightVersionsSection({
  tabs,
  setTabs,
  bodies,
}: {
  tabs: LocaleTabState<SpotlightVersionDraft>;
  setTabs: (
    update: (
      tabs: LocaleTabState<SpotlightVersionDraft>,
    ) => LocaleTabState<SpotlightVersionDraft>,
  ) => void;
  bodies: AuthoredBodiesHandle;
}) {
  const t = useTranslations("admin.spotlights");
  const uiLocale = resolveLocale(useLocale());

  const locale = tabs.active;
  const draft = activeLocaleDraft(tabs, EMPTY_VERSION);
  const edit = (patch: Partial<SpotlightVersionDraft>) =>
    setTabs((current) => editActiveLocaleDraft(current, patch, EMPTY_VERSION));

  return (
    <div className="space-y-5">
      <Field label={t("fields.languages")} hint={t("hints.languages")}>
        <LocaleTabs
          written={writtenLocales(tabs.drafts)}
          active={locale}
          onSelect={(next) => setTabs((current) => selectLocaleTab(current, next))}
          onAdd={(next) =>
            setTabs((current) => addLocaleTab(current, next, EMPTY_VERSION))
          }
          onRemove={(gone) =>
            setTabs((current) => removeLocaleTab(current, gone, uiLocale))
          }
          isComplete={(l) =>
            isCompleteSpotlightVersion(tabs.drafts[l] ?? EMPTY_VERSION)
          }
        />
      </Field>

      <Field label={t("fields.title")} htmlFor="spotlight-title">
        <Input
          id="spotlight-title"
          value={draft.title}
          lang={locale}
          onChange={(event) => edit({ title: event.target.value })}
          autoComplete="off"
        />
      </Field>

      <Field label={t("fields.body")} hint={t("hints.body")}>
        {({ hintId }) => (
          <div lang={locale}>
            <AuthoredBodyEditor
              key={locale}
              bodies={bodies}
              useCase="spotlight"
              value={draft.body}
              onChange={(body) => edit({ body })}
              placeholder={t("bodyPlaceholder")}
              ariaLabel={t("fields.body")}
              describedBy={hintId}
            />
          </div>
        )}
      </Field>
    </div>
  );
}
