"use client";

import { CircleCheck, CircleDashed, X } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { StatusLine } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLanguageNames } from "@/hooks/use-language-names";
import {
  LOCALE_CONFIG,
  SUPPORTED_LOCALES,
  resolveLocale,
  type SupportedLocale,
} from "@/lib/constants/locales";
import { localeTabAfterRemoving } from "@/lib/i18n/locale-tabs";
import { cn, findOption } from "@/lib/utils";
import {
  LANDING_SLUG_MAX_LENGTH,
  LANDING_SUMMARY_MAX_LENGTH,
  LANDING_TITLE_MAX_LENGTH,
} from "@/services/landing-pages/landing-pages.contracts";
import { LandingMarkdownField } from "./landing-markdown-field";
import {
  formLocales,
  isCompleteInForm,
  isUsableSlug,
  missingInForm,
  missingInSection,
  textFieldsOf,
  versionOf,
  withTitle,
  wordKey,
  type FormSection,
  type LandingPageForm,
  type LandingVersionDraft,
  type TextFieldSpec,
} from "./landing-page-form";

type SetForm = React.Dispatch<React.SetStateAction<LandingPageForm>>;

/**
 * **The page's words, one tab per language** — the Library's tabs: a tab per
 * language written, each marked complete or not, a remove control on each
 * while more than one remains, and an "add a language" select for the rest.
 *
 * A tab holds the title, the summary, the slug, and then every section's
 * words in the structure's order. Each section says what it still needs in
 * this language, by the rule publishing reads, so a section just added to a
 * live page names the words its languages now lack.
 *
 * The slug follows the title until it is typed over, and once its language
 * has been published it is fixed — there are no redirects, so a slug that
 * could change would be a link that could break.
 */
export function LandingVersionsPane({
  form,
  setForm,
  fixedSlugs,
  onSeeded,
}: {
  form: LandingPageForm;
  setForm: SetForm;
  fixedSlugs: ReadonlySet<SupportedLocale>;
  onSeeded: (seed: { value: string; markdown: string }) => void;
}) {
  const t = useTranslations("admin.landingPages");
  const format = useFormatter();
  const languageName = useLanguageNames();
  const uiLocale = resolveLocale(useLocale());

  const locale = form.activeLocale;
  const addedLocales = formLocales(form);
  const addableLocales = SUPPORTED_LOCALES.filter((l) => form.versions[l] === undefined);
  const draft = versionOf(form, locale);
  const slugFixed = fixedSlugs.has(locale);
  const missing = missingInForm(form, locale);

  function setActive(update: (version: LandingVersionDraft) => LandingVersionDraft) {
    setForm((prev) => ({
      ...prev,
      versions: {
        ...prev.versions,
        [prev.activeLocale]: update(versionOf(prev, prev.activeLocale)),
      },
    }));
  }

  const setWord = (key: string, value: string) =>
    setActive((version) => ({ ...version, words: { ...version.words, [key]: value } }));

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
        activeLocale: localeTabAfterRemoving(next, prev.activeLocale, gone, uiLocale),
      };
    });
  }

  return (
    <section aria-labelledby="landing-words-heading" className="space-y-5">
      <div>
        <h2 id="landing-words-heading" className="text-lg font-semibold">
          {t("words.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("words.subtitle")}</p>
      </div>

      <div
        role="group"
        aria-label={t("fields.languages")}
        className="flex flex-wrap items-center gap-1 border-b border-border"
      >
        {addedLocales.map((l) => {
          const isActive = locale === l;
          const canRemove = addedLocales.length > 1;
          const name = languageName(l, LOCALE_CONFIG[l].label);
          const complete = isCompleteInForm(form, l);
          const Mark = complete ? CircleCheck : CircleDashed;
          return (
            <span
              key={l}
              className={cn(
                "inline-flex items-center gap-1 rounded-t-md border-b-2 border-border px-3 py-1.5 text-sm transition-colors",
                isActive ? "text-act" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <button
                type="button"
                aria-pressed={isActive}
                className="inline-flex items-center gap-1.5"
                onClick={() => setForm((prev) => ({ ...prev, activeLocale: l }))}
              >
                {LOCALE_CONFIG[l].nativeLabel}
                <Mark className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only">
                  {complete ? t("versionComplete") : t("versionIncomplete")}
                </span>
              </button>
              {canRemove && (
                <button
                  type="button"
                  onClick={() => removeLocale(l)}
                  className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                  aria-label={t("removeLocale", { language: name })}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          );
        })}
        {addableLocales.length > 0 && (
          <select
            value=""
            aria-label={t("addLocale")}
            onChange={(e) => {
              const next = findOption(addableLocales, e.target.value);
              if (next) addLocale(next);
            }}
            className="mb-1 ml-1 h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
          >
            <option value="">{t("addLocale")}</option>
            {addableLocales.map((l) => (
              <option key={l} value={l}>
                {languageName(l, LOCALE_CONFIG[l].label)}
              </option>
            ))}
          </select>
        )}
      </div>

      <div lang={locale} className="space-y-5">
        <Field label={t("fields.title")} htmlFor="landing-title">
          <Input
            id="landing-title"
            value={draft.title}
            maxLength={LANDING_TITLE_MAX_LENGTH}
            onChange={(event) =>
              setActive((version) => withTitle(version, event.target.value, slugFixed))
            }
            autoComplete="off"
          />
        </Field>

        <Field
          label={t("fields.summary")}
          htmlFor="landing-summary"
          hint={t("hints.summary")}
          labelAction={
            <span className="text-xs tabular-nums text-muted-foreground">
              {t("summaryCount", {
                count: draft.summary.length,
                max: LANDING_SUMMARY_MAX_LENGTH,
              })}
            </span>
          }
        >
          {({ hintId }) => (
            <Textarea
              id="landing-summary"
              value={draft.summary}
              maxLength={LANDING_SUMMARY_MAX_LENGTH}
              onChange={(event) =>
                setActive((version) => ({ ...version, summary: event.target.value }))
              }
              aria-describedby={hintId}
              rows={2}
            />
          )}
        </Field>

        <Field
          label={t("fields.slug")}
          htmlFor="landing-slug"
          hint={slugFixed ? t("hints.slugFixed") : t("hints.slug")}
        >
          {({ hintId }) => (
            <div className="space-y-1.5">
              <Input
                id="landing-slug"
                value={draft.slug}
                readOnly={slugFixed}
                maxLength={LANDING_SLUG_MAX_LENGTH}
                aria-describedby={hintId}
                aria-invalid={!isUsableSlug(draft.slug)}
                onChange={(event) =>
                  setActive((version) => ({
                    ...version,
                    slug: event.target.value,
                    // Emptied, it goes back to following the title.
                    slugFollowsTitle: event.target.value.trim() === "",
                  }))
                }
                autoComplete="off"
                spellCheck={false}
                className={cn("font-mono", slugFixed && "text-muted-foreground")}
              />
              {!isUsableSlug(draft.slug) && (
                <StatusLine status="destructive">{t("errors.slugShape")}</StatusLine>
              )}
            </div>
          )}
        </Field>

        {missing.some((path) => path === "title" || path === "summary" || path === "slug") && (
          <StatusLine status="info">
            {t("words.stillNeeded", {
              fields: format.list(
                missing
                  .filter((path) => path === "title" || path === "summary" || path === "slug")
                  .map((path) => t(`fields.${path}`)),
                { type: "conjunction" },
              ),
            })}
          </StatusLine>
        )}

        <ol className="space-y-0 divide-y divide-border border-t border-border">
          {form.sections.map((section, index) => (
            <SectionWords
              key={`${locale}:${section.id}`}
              section={section}
              number={index + 1}
              version={draft}
              missing={missingInSection(missing, section.id)}
              setWord={setWord}
              onSeeded={onSeeded}
            />
          ))}
        </ol>
      </div>
    </section>
  );
}

/** A field's label: its own name, under its item's name when it belongs to one. */
function useFieldLabel(section: FormSection) {
  const t = useTranslations("admin.landingPages");
  const itemName = (number: number) =>
    section.type === "image" || section.type === "points" || section.type === "steps" || section.type === "faq"
      ? t(`items.${section.type}`, { number })
      : "";
  return (spec: TextFieldSpec) =>
    spec.item === undefined
      ? t(`fields.${spec.name}`)
      : t("fields.ofItem", { item: itemName(spec.item.number), field: t(`fields.${spec.name}`) });
}

/** One section's words in the language being written, and what it still needs. */
function SectionWords({
  section,
  number,
  version,
  missing,
  setWord,
  onSeeded,
}: {
  section: FormSection;
  number: number;
  version: LandingVersionDraft;
  /** This section's missing fields in this language, as paths within it. */
  missing: readonly string[];
  setWord: (key: string, value: string) => void;
  onSeeded: (seed: { value: string; markdown: string }) => void;
}) {
  const t = useTranslations("admin.landingPages");
  const format = useFormatter();
  const labelOf = useFieldLabel(section);
  const specs = textFieldsOf(section);
  const sectionName = t("structure.sectionName", {
    number,
    type: t(`sectionTypes.${section.type}`),
  });
  const complete = missing.length === 0;
  const Mark = complete ? CircleCheck : CircleDashed;

  return (
    <li aria-label={sectionName} className="space-y-4 py-5">
      <div className="flex items-center gap-2">
        <h3 className="font-medium">{sectionName}</h3>
        <Mark
          className={cn("h-4 w-4", complete ? "text-success" : "text-muted-foreground")}
          aria-hidden
        />
        <span className="sr-only">
          {complete ? t("versionComplete") : t("versionIncomplete")}
        </span>
      </div>

      {!complete && (
        <StatusLine status="info">
          {t("words.stillNeeded", {
            fields: format.list(
              specs.filter((spec) => missing.includes(spec.path)).map(labelOf),
              { type: "conjunction" },
            ),
          })}
        </StatusLine>
      )}

      {specs.map((spec) => {
        const key = wordKey(section.id, spec.path);
        const id = `landing-word-${key.replaceAll(".", "-")}`;
        const value = version.words[key] ?? "";
        const label = labelOf(spec);
        return (
          <Field key={key} label={label} htmlFor={spec.kind === "markdown" ? undefined : id} optional={spec.optional}>
            {({ hintId }) =>
              spec.kind === "markdown" ? (
                <LandingMarkdownField
                  value={value}
                  placeholder={t("markdownPlaceholder")}
                  openLabel={t("markdownOpen", { field: label })}
                  ariaLabel={label}
                  describedBy={hintId}
                  onChange={(markdown) => setWord(key, markdown)}
                  onSeeded={onSeeded}
                />
              ) : spec.kind === "lines" ? (
                <Textarea
                  id={id}
                  value={value}
                  rows={2}
                  onChange={(event) => setWord(key, event.target.value)}
                />
              ) : (
                <Input
                  id={id}
                  value={value}
                  onChange={(event) => setWord(key, event.target.value)}
                  autoComplete="off"
                />
              )
            }
          </Field>
        );
      })}
    </li>
  );
}
