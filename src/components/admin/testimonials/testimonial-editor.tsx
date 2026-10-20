"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { StatusLine } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { LocaleTabs } from "@/components/ui/locale-tabs";
import { Textarea } from "@/components/ui/textarea";
import { UnsavedChangesGuard } from "@/components/ui/unsaved-changes-guard";
import { useLanguageNames } from "@/hooks/use-language-names";
import { LOCALE_CONFIG, resolveLocale } from "@/lib/constants/locales";
import {
  activeLocaleDraft,
  addLocaleTab,
  editActiveLocaleDraft,
  removeLocaleTab,
  selectLocaleTab,
  writtenLocales,
} from "@/lib/i18n/locale-tabs";
import {
  hasQuotationMarks,
  testimonialWriteFailure,
  type AdminTestimonial,
  type TestimonialInput,
} from "@/services/testimonials/testimonials.contracts";
import {
  EMPTY_VERSION,
  emptyTestimonialForm,
  isBlankTestimonialForm,
  isCompleteTestimonialVersion,
  sameAsSaved,
  testimonialFormFromSaved,
  testimonialInputFromForm,
  testimonialSaveBlocker,
  type TestimonialForm,
  type TestimonialVersionDraft,
} from "./testimonial-form";

export interface TestimonialEditorProps {
  /** The testimonial as last read, or null for a new one. */
  testimonial: AdminTestimonial | null;
  /**
   * Save the testimonial. Throws on refusal, so the editor can say why. For a
   * new one it resolves as the page leaves, which is why the editor never
   * hands the button back on that path.
   */
  save: (input: TestimonialInput) => Promise<void>;
  /** Leave without saving — offered on a new testimonial only. */
  onCancel?: () => void;
}

/**
 * **The page a testimonial is written on**, a new one and a saved one alike:
 * whom it is from and the quote, one tab per language, and Save.
 *
 * **The words are the giver's, never ours.** The quote is typed as they gave
 * it, without quotation marks: the site wraps it in each language's own, so a
 * quote that starts or ends with one is held back with the reason, on the
 * field as it is typed and again at Save.
 *
 * **The form is seeded once per testimonial, never per read**, keyed on its
 * id, so a refetch after a save never touches what is being typed. Leaving
 * with unsaved changes asks first.
 */
export function TestimonialEditor(props: TestimonialEditorProps) {
  return <EditorForm key={props.testimonial?.id ?? "new"} {...props} />;
}

function EditorForm({ testimonial, save, onCancel }: TestimonialEditorProps) {
  const t = useTranslations("admin.testimonials");
  const languageName = useLanguageNames();
  const uiLocale = resolveLocale(useLocale());

  const [form, setForm] = useState<TestimonialForm>(() =>
    testimonial === null
      ? emptyTestimonialForm(uiLocale)
      : testimonialFormFromSaved(testimonial, uiLocale),
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const dirty = testimonial === null || !sameAsSaved(form, testimonial);
  const unsaved =
    testimonial === null ? !saving && !isBlankTestimonialForm(form) : dirty;

  const locale = form.tabs.active;
  const draft = activeLocaleDraft(form.tabs, EMPTY_VERSION);
  const edit = (patch: Partial<TestimonialVersionDraft>) =>
    setForm((current) => ({
      tabs: editActiveLocaleDraft(current.tabs, patch, EMPTY_VERSION),
    }));
  const quoteMarked = hasQuotationMarks(draft.quote);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    const blocker = testimonialSaveBlocker(form);
    if (blocker !== null) {
      setSaveError(
        blocker.kind === "noVersion"
          ? t("errors.noVersion")
          : t(blocker.kind === "quoted" ? "errors.quoted" : "errors.versionIncomplete", {
              language: languageName(blocker.locale, LOCALE_CONFIG[blocker.locale].label),
            }),
      );
      return;
    }
    setSaveError(null);
    // Set before the first render after the click: a second press while the
    // first is in flight would create a second testimonial.
    setSaving(true);
    try {
      await save(testimonialInputFromForm(form));
      // A new testimonial's page is leaving; only a saved one stays to edit on.
      if (testimonial !== null) setSaving(false);
    } catch (failure) {
      setSaving(false);
      const reason = testimonialWriteFailure(failure);
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
            <Field label={t("fields.languages")} hint={t("hints.languages")}>
              <LocaleTabs
                written={writtenLocales(form.tabs.drafts)}
                active={locale}
                onSelect={(next) =>
                  setForm((current) => ({ tabs: selectLocaleTab(current.tabs, next) }))
                }
                onAdd={(next) =>
                  setForm((current) => ({
                    tabs: addLocaleTab(current.tabs, next, EMPTY_VERSION),
                  }))
                }
                onRemove={(gone) =>
                  setForm((current) => ({
                    tabs: removeLocaleTab(current.tabs, gone, uiLocale),
                  }))
                }
                isComplete={(l) =>
                  isCompleteTestimonialVersion(form.tabs.drafts[l] ?? EMPTY_VERSION)
                }
              />
            </Field>

            <Field label={t("fields.quote")} hint={t("hints.quote")} htmlFor="testimonial-quote">
              <Textarea
                id="testimonial-quote"
                value={draft.quote}
                lang={locale}
                rows={5}
                aria-invalid={quoteMarked || undefined}
                onChange={(event) => edit({ quote: event.target.value })}
              />
            </Field>
            {/* Under the field as it is typed, so the reason arrives with
                the mark rather than after Save. */}
            {quoteMarked && (
              <StatusLine status="destructive" size="xs">
                {t("quoteHasMarks")}
              </StatusLine>
            )}

            <Field label={t("fields.from")} hint={t("hints.from")} htmlFor="testimonial-from">
              <Input
                id="testimonial-from"
                value={draft.from}
                lang={locale}
                onChange={(event) => edit({ from: event.target.value })}
                autoComplete="off"
              />
            </Field>
          </CardContent>
        </Card>

        {/* Negative first in the DOM, the affirmative last. */}
        <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:justify-end">
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              {t("actions.cancel")}
            </Button>
          )}
          <Button type="submit" disabled={saving || !dirty}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {testimonial === null ? t("newPage.submit") : t("actions.save")}
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
