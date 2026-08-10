"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { cn, findOption } from "@/lib/utils";
import {
  LOCALE_CONFIG,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "@/lib/constants/locales";
import { PRODUCT_TOPIC_VALUES } from "@/lib/products/topics";
import { useTopicLabel } from "@/lib/products/use-topic-label";
import { useLanguageNames } from "@/hooks/use-language-names";
import { Constants } from "@/types";
import { FormSection } from "../form-primitives";
import { ImagePicker } from "../image-picker";
import { LongDescriptionBlocksEditor } from "../long-description-blocks-editor";
import {
  type FormState,
  type TranslationDraft,
} from "../product-form-state";
import type { ProductTypeConfig } from "../product-type-config";

interface IdentitySectionProps {
  state: FormState;
  setState: React.Dispatch<React.SetStateAction<FormState>>;
  config: ProductTypeConfig;
  uiLocale: SupportedLocale;
}

export function IdentitySection({
  state,
  setState,
  config,
  uiLocale,
}: IdentitySectionProps) {
  const t = useTranslations("admin.products");
  const topicLabel = useTopicLabel();
  const languageName = useLanguageNames();

  const addedLocales = SUPPORTED_LOCALES.filter(
    (l) => state.translations[l] !== undefined,
  );
  const addableLocales = SUPPORTED_LOCALES.filter(
    (l) => state.translations[l] === undefined,
  );
  const emptyDraft: TranslationDraft = {
    name: "",
    shortDescription: "",
    longDescription: [],
  };
  const activeDraft: TranslationDraft =
    state.translations[state.activeLocale] ?? emptyDraft;

  function setActiveTranslation(patch: Partial<TranslationDraft>) {
    setState((s) => ({
      ...s,
      translations: {
        ...s.translations,
        [s.activeLocale]: {
          ...(s.translations[s.activeLocale] ?? emptyDraft),
          ...patch,
        },
      },
    }));
  }

  function addLocaleTab(locale: SupportedLocale) {
    setState((s) => ({
      ...s,
      translations: {
        ...s.translations,
        [locale]: { name: "", shortDescription: "", longDescription: [] },
      },
      activeLocale: locale,
    }));
  }

  function removeLocaleTab(locale: SupportedLocale) {
    setState((s) => {
      const next = { ...s.translations };
      delete next[locale];
      const remaining = SUPPORTED_LOCALES.filter((l) => next[l] !== undefined);
      return {
        ...s,
        translations: next,
        activeLocale:
          s.activeLocale === locale
            ? (remaining[0] ?? uiLocale)
            : s.activeLocale,
      };
    });
  }

  return (
    <FormSection
      title={t("sections.identity")}
      description={t("sections.identityDescription")}
    >
      {/* Language tabs — at least one filled locale required. The hint below
          spells the rule out. Switching tabs preserves what's typed in each. */}
      <Field label={t("translations.label")} hint={t("translations.hint")}>
        <div className="flex flex-wrap items-center gap-1 border-b border-border">
          {addedLocales.map((locale) => {
            const isActive = state.activeLocale === locale;
            const canRemove = addedLocales.length > 1;
            return (
              <span
                key={locale}
                className={cn(
                  "inline-flex items-center gap-1 rounded-t-md border-b-2 px-3 py-1.5 text-sm transition-colors",
                  isActive
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <button
                  type="button"
                  onClick={() => setState({ ...state, activeLocale: locale })}
                >
                  {LOCALE_CONFIG[locale].nativeLabel}
                </button>
                {canRemove && (
                  <button
                    type="button"
                    onClick={() => removeLocaleTab(locale)}
                    className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                    aria-label={t("translations.removeLocale", {
                      locale: languageName(locale, LOCALE_CONFIG[locale].label),
                    })}
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
              onChange={(e) => {
                const locale = findOption(addableLocales, e.target.value);
                if (locale) addLocaleTab(locale);
              }}
              className="ml-1 mb-1 h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
            >
              <option value="">{t("translations.addLocale")}</option>
              {addableLocales.map((l) => (
                <option key={l} value={l}>
                  {languageName(l, LOCALE_CONFIG[l].label)}
                </option>
              ))}
            </select>
          )}
        </div>
      </Field>

      <Field label={t("labels.name")} htmlFor={`p-name-${state.activeLocale}`}>
        <Input
          id={`p-name-${state.activeLocale}`}
          value={activeDraft.name}
          placeholder={t(`placeholders.name.${config.i18nKey}`)}
          onChange={(e) => setActiveTranslation({ name: e.target.value })}
          required
          maxLength={100}
        />
      </Field>

      <Field
        label={t("labels.shortDescription")}
        htmlFor={`p-short-description-${state.activeLocale}`}
        hint={t("hints.shortDescription")}
      >
        <Textarea
          id={`p-short-description-${state.activeLocale}`}
          placeholder={t(`placeholders.description.${config.i18nKey}`)}
          value={activeDraft.shortDescription}
          onChange={(e) =>
            setActiveTranslation({ shortDescription: e.target.value })
          }
          rows={3}
          required
        />
      </Field>

      <Field
        label={t("labels.longDescription")}
        optional
        hint={t("hints.longDescription")}
      >
        <LongDescriptionBlocksEditor
          value={activeDraft.longDescription}
          onChange={(longDescription) =>
            setActiveTranslation({ longDescription })
          }
        />
      </Field>

      <ImagePicker
        value={state.image}
        onChange={(v) => setState({ ...state, image: v })}
      />

      <Field
        label={t("labels.topic")}
        htmlFor="p-topic"
        hint={t("hints.topicHint")}
      >
        <select
          id="p-topic"
          value={state.topic}
          onChange={(e) =>
            setState({
              ...state,
              topic:
                findOption(Constants.public.Enums.product_topic, e.target.value) ?? "",
            })
          }
          required
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">{t("placeholders.selectTopic")}</option>
          {PRODUCT_TOPIC_VALUES.map((topic) => (
            <option key={topic} value={topic}>
              {topicLabel(topic)}
            </option>
          ))}
        </select>
      </Field>

      {/*
        Staff-facing, and the hint says so. The form used to carry a
        family-facing link directly above this one, and the pair was a trap for
        anyone filling it in quickly; that link is gone, but the warning stays,
        because this one reaches game educators only — it is rendered in their
        group workspace and on no parent or gamer surface.
      */}
      <Field
        label={t("labels.materialUrl")}
        htmlFor="p-material"
        optional
        hint={t("hints.materialUrlHint")}
      >
        <Input
          id="p-material"
          type="url"
          placeholder={t("placeholders.materialUrl")}
          value={state.materialUrl}
          onChange={(e) => setState({ ...state, materialUrl: e.target.value })}
        />
      </Field>
    </FormSection>
  );
}
