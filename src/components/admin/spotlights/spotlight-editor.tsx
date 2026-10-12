"use client";

import { useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { StatusLine } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { UnsavedChangesGuard } from "@/components/ui/unsaved-changes-guard";
import { AuthoredBodyEditor } from "@/components/admin/authored-body-editor";
import { LocaleVersionTabs } from "@/components/admin/locale-version-tabs";
import { ImagePicker } from "@/components/admin/products/image-picker";
import { useLanguageNames } from "@/hooks/use-language-names";
import {
  LOCALE_CONFIG,
  resolveLocale,
  type SupportedLocale,
} from "@/lib/constants/locales";
import { localeTabAfterRemoving } from "@/lib/i18n/locale-tabs";
import {
  spotlightWriteFailure,
  type AdminSpotlight,
  type SpotlightInput,
} from "@/services/spotlights";
import {
  emptySpotlightForm,
  formLocales,
  isBlankSpotlightForm,
  isCompleteSpotlightVersion,
  sameAsSaved,
  spotlightFormFromSaved,
  spotlightInputFromForm,
  spotlightSaveBlocker,
  versionOf,
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

  // Each body the rich editor has been seeded with, mapped to the editor's own
  // serialisation of it — how an untouched body comes back out of the editor.
  const [editorBodies, setEditorBodies] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const recordEditorBody = ({
    value,
    markdown,
  }: {
    value: string;
    markdown: string;
  }) =>
    setEditorBodies((current) =>
      current.get(value) === markdown
        ? current
        : new Map(current).set(value, markdown),
    );

  const dirty =
    spotlight === null || !sameAsSaved(form, spotlight, editorBodies);
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
              form={form}
              setForm={setForm}
              onSeeded={recordEditorBody}
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
 * **A spotlight's text, one tab per language**, in the language tabs the
 * per-locale admin editors share. Each tab says whether its version is
 * complete — a title and a body — because the save refuses one that is not.
 *
 * The body editor reads its content once, at mount, so the locale is its key
 * and switching tabs remounts it on that language's draft.
 */
function SpotlightVersionsSection({
  form,
  setForm,
  onSeeded,
}: {
  form: SpotlightForm;
  setForm: React.Dispatch<React.SetStateAction<SpotlightForm>>;
  onSeeded: (seed: { value: string; markdown: string }) => void;
}) {
  const t = useTranslations("admin.spotlights");
  const uiLocale = resolveLocale(useLocale());

  const locale = form.activeLocale;
  const draft = versionOf(form, locale);

  function setActive(patch: Partial<SpotlightVersionDraft>) {
    setForm((prev) => ({
      ...prev,
      versions: {
        ...prev.versions,
        [prev.activeLocale]: { ...versionOf(prev, prev.activeLocale), ...patch },
      },
    }));
  }

  function addLocale(next: SupportedLocale) {
    setForm((prev) => ({
      ...prev,
      versions: { ...prev.versions, [next]: versionOf(prev, next) },
      activeLocale: next,
    }));
  }

  function removeLocale(gone: SupportedLocale) {
    setForm((prev) => {
      const next = { ...prev.versions };
      delete next[gone];
      return {
        ...prev,
        versions: next,
        activeLocale: localeTabAfterRemoving(
          next,
          prev.activeLocale,
          gone,
          uiLocale,
        ),
      };
    });
  }

  return (
    <div className="space-y-5">
      <Field label={t("fields.languages")} hint={t("hints.languages")}>
        <LocaleVersionTabs
          open={formLocales(form)}
          active={locale}
          isComplete={(l) => isCompleteSpotlightVersion(versionOf(form, l))}
          onSelect={(l) => setForm((prev) => ({ ...prev, activeLocale: l }))}
          onAdd={addLocale}
          onRemove={removeLocale}
          labels={{
            addLocale: t("addLocale"),
            removeLocale: (language) => t("removeLocale", { language }),
            complete: t("versionComplete"),
            incomplete: t("versionIncomplete"),
          }}
        />
      </Field>

      <Field label={t("fields.title")} htmlFor="spotlight-title">
        <Input
          id="spotlight-title"
          value={draft.title}
          lang={locale}
          onChange={(event) => setActive({ title: event.target.value })}
          autoComplete="off"
        />
      </Field>

      <Field label={t("fields.body")} hint={t("hints.body")}>
        {({ hintId }) => (
          <div lang={locale}>
            <AuthoredBodyEditor
              useCase="spotlight"
              key={locale}
              value={draft.body}
              onChange={(body) => setActive({ body })}
              onSeeded={onSeeded}
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
