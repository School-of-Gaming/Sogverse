"use client";

import { useTranslations } from "next-intl";
import { CheckboxRow } from "@/components/ui/checkbox-row";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { LocaleTabs } from "@/components/ui/locale-tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  addLocaleTab,
  removeLocaleTab,
  writtenLocales,
  type LocaleTabState,
} from "@/lib/i18n/locale-tabs";
import { findOption } from "@/lib/utils";
import type { SupportedLocale } from "@/lib/constants/locales";
import { PRODUCT_TOPIC_VALUES } from "@/lib/products/topics";
import { useTopicLabel } from "@/lib/products/use-topic-label";
import { Constants } from "@/types";
import { FormSection } from "../form-primitives";
import { ImagePicker } from "../image-picker";
import type { ProductImageSelection } from "../product-image-selection";
import { LongDescriptionEditor } from "../long-description-editor";
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
  /** The catalogue entry `state.imageId` points at, resolved by whoever holds
   *  the product read. Derived, so it travels beside form state rather than
   *  inside it. */
  currentImage: ProductImageSelection | null;
  /** The pick changed — id for form state, picture for the card, together. */
  onImageChange: (
    imageId: string | null,
    image: ProductImageSelection | null,
  ) => void;
}

export function IdentitySection({
  state,
  setState,
  config,
  uiLocale,
  currentImage,
  onImageChange,
}: IdentitySectionProps) {
  const t = useTranslations("admin.products");
  const topicLabel = useTopicLabel();

  const emptyDraft: TranslationDraft = {
    name: "",
    shortDescription: "",
    longDescription: "",
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

  /** The form's translations as the shared tab-set helpers take them, and back. */
  function updateTabs(
    change: (
      tabs: LocaleTabState<TranslationDraft>,
    ) => LocaleTabState<TranslationDraft>,
  ) {
    setState((s) => {
      const next = change({ drafts: s.translations, active: s.activeLocale });
      return { ...s, translations: next.drafts, activeLocale: next.active };
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
        <LocaleTabs
          written={writtenLocales(state.translations)}
          active={state.activeLocale}
          onSelect={(locale) =>
            setState((s) => ({ ...s, activeLocale: locale }))
          }
          onAdd={(locale) =>
            updateTabs((tabs) => addLocaleTab(tabs, locale, emptyDraft))
          }
          onRemove={(locale) =>
            updateTabs((tabs) => removeLocaleTab(tabs, locale, uiLocale))
          }
          addLabel={t("translations.addLocale")}
          removeLabel={(language) =>
            t("translations.removeLocale", { locale: language })
          }
        />
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

      {/* The editor reads its content once at mount, so the locale is its
          React key: switching tabs remounts it against that locale's draft
          rather than leaving the previous language's copy in the box. */}
      <Field
        label={t("labels.longDescription")}
        optional
        hint={t("hints.longDescription")}
      >
        {({ hintId }) => (
          <LongDescriptionEditor
            key={state.activeLocale}
            value={activeDraft.longDescription}
            placeholder={t("longDescription.placeholder")}
            ariaLabel={t("labels.longDescription")}
            describedBy={hintId}
            onChange={(longDescription) =>
              setActiveTranslation({ longDescription })
            }
          />
        )}
      </Field>

      <ImagePicker
        purpose="product"
        label={t("imagePicker.label")}
        hint={t("imagePicker.hint")}
        imageId={state.imageId}
        current={currentImage}
        onChange={onImageChange}
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
          className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
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

      {/*
        Beside the lesson-material link, and last in the section, because the
        two are this form's only staff-facing fields: every other section
        answers a question a family meets — who may buy a seat, where, when,
        what it costs, what they agree to, where it is listed — while these two
        say how the people running the product work. The flag itself changes
        nothing a family sees.

        The shared bordered row rather than a hand-built label: the border is
        what says where an admin may click, and this is a standalone question
        rather than a checkbox inside a field group.
      */}
      <CheckboxRow
        checked={state.requiresGamerCreations}
        onCheckedChange={(requiresGamerCreations) =>
          setState({ ...state, requiresGamerCreations })
        }
        label={t("labels.requiresGamerCreations")}
        hint={t("hints.requiresGamerCreationsHint")}
      />
    </FormSection>
  );
}
