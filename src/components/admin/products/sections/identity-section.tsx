"use client";

import { useTranslations } from "next-intl";
import {
  AuthoredBodyEditor,
  type AuthoredBodiesHandle,
} from "@/components/ui/authored-body-editor";
import { CheckboxRow } from "@/components/ui/checkbox-row";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { LocaleTabs } from "@/components/ui/locale-tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  activeLocaleDraft,
  addLocaleTab,
  editActiveLocaleDraft,
  removeLocaleTab,
  selectLocaleTab,
  writtenLocales,
  type LocaleTabState,
} from "@/lib/i18n/locale-tabs";
import { findOption } from "@/lib/type-guards";
import type { SupportedLocale } from "@/lib/constants/locales";
import { PRODUCT_TOPIC_VALUES } from "@/lib/products/topics";
import { useTopicLabel } from "@/lib/products/use-topic-label";
import { Constants } from "@/types";
import { FormSection } from "../form-primitives";
import { ImagePicker } from "../image-picker";
import type { ProductImageSelection } from "../product-image-selection";
import {
  asksJoinInstructions,
  EMPTY_TRANSLATION,
  isCompleteTranslation,
  type FormState,
  type TranslationDraft,
} from "../product-form-state";
import type { ProductTypeConfig } from "../product-type-config";

interface IdentitySectionProps {
  state: FormState;
  setState: React.Dispatch<React.SetStateAction<FormState>>;
  config: ProductTypeConfig;
  uiLocale: SupportedLocale;
  /** The form's body record, which the long description's editor fills. */
  bodies: AuthoredBodiesHandle;
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
  bodies,
  currentImage,
  onImageChange,
}: IdentitySectionProps) {
  const t = useTranslations("admin.products");
  const topicLabel = useTopicLabel();

  const tabs = state.translations;
  const locale = tabs.active;
  const activeDraft = activeLocaleDraft(tabs, EMPTY_TRANSLATION);

  /** Apply a tab-set change to the form's languages. */
  function setTabs(
    change: (
      current: LocaleTabState<TranslationDraft>,
    ) => LocaleTabState<TranslationDraft>,
  ) {
    setState((s) => ({ ...s, translations: change(s.translations) }));
  }

  function setActiveTranslation(patch: Partial<TranslationDraft>) {
    setTabs((current) =>
      editActiveLocaleDraft(current, patch, EMPTY_TRANSLATION),
    );
  }

  return (
    <FormSection
      title={t("sections.identity")}
      description={t("sections.identityDescription")}
    >
      {/* Language tabs — at least one complete locale required, and a tab left
          blank is not saved. The hint below spells the rule out. Switching
          tabs preserves what's typed in each. */}
      <Field label={t("translations.label")} hint={t("translations.hint")}>
        <LocaleTabs
          written={writtenLocales(tabs.drafts)}
          active={locale}
          onSelect={(next) => setTabs((current) => selectLocaleTab(current, next))}
          onAdd={(next) =>
            setTabs((current) => addLocaleTab(current, next, EMPTY_TRANSLATION))
          }
          onRemove={(gone) =>
            setTabs((current) => removeLocaleTab(current, gone, uiLocale))
          }
          isComplete={(l) =>
            isCompleteTranslation(tabs.drafts[l] ?? EMPTY_TRANSLATION)
          }
        />
      </Field>

      {/* No `required` on the name and the short description: a tab left blank
          is dropped at save rather than refused, so whether this tab must be
          filled in is `validate()`'s to say, for every tab at once. */}
      <Field label={t("labels.name")} htmlFor={`p-name-${locale}`}>
        <Input
          id={`p-name-${locale}`}
          value={activeDraft.name}
          lang={locale}
          placeholder={t(`placeholders.name.${config.i18nKey}`)}
          onChange={(e) => setActiveTranslation({ name: e.target.value })}
          maxLength={100}
        />
      </Field>

      <Field
        label={t("labels.shortDescription")}
        htmlFor={`p-short-description-${locale}`}
        hint={t("hints.shortDescription")}
      >
        <Textarea
          id={`p-short-description-${locale}`}
          placeholder={t(`placeholders.description.${config.i18nKey}`)}
          value={activeDraft.shortDescription}
          lang={locale}
          onChange={(e) =>
            setActiveTranslation({ shortDescription: e.target.value })
          }
          rows={3}
        />
      </Field>

      {/* The marketing long description, edited as rich text in the
          `marketing` use case — the one the public product page renders it
          with, links and headings included. The rich editor is loaded on
          demand, and only the shown tab's is ever mounted: it reads its content
          once at mount, so the locale is its React key and switching tabs
          remounts it against that locale's draft. */}
      <Field
        label={t("labels.longDescription")}
        optional
        hint={t("hints.longDescription")}
      >
        {({ hintId }) => (
          <div lang={locale}>
            <AuthoredBodyEditor
              key={locale}
              bodies={bodies}
              useCase="marketing"
              value={activeDraft.longDescription}
              placeholder={t("longDescription.placeholder")}
              ariaLabel={t("labels.longDescription")}
              describedBy={hintId}
              onChange={(longDescription) =>
                setActiveTranslation({ longDescription })
              }
            />
          </div>
        )}
      </Field>

      {/* The join instructions of a product with no voice room, written per
          locale beside the rest of this tab's copy. Shown only while that is
          the Where section's choice; hidden, the field keeps what was typed but
          the save sends nothing from it. Plain text, not markdown. */}
      {asksJoinInstructions(state) && (
        <Field
          label={t("labels.voiceJoinInstructions")}
          htmlFor={`p-join-instructions-${locale}`}
          hint={t("hints.voiceJoinInstructionsHint")}
        >
          <Textarea
            id={`p-join-instructions-${locale}`}
            value={activeDraft.voiceJoinInstructions}
            lang={locale}
            onChange={(e) =>
              setActiveTranslation({ voiceJoinInstructions: e.target.value })
            }
            rows={4}
          />
        </Field>
      )}

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
          onChange={(e) => {
            const topic =
              findOption(Constants.public.Enums.product_topic, e.target.value) ?? "";
            setState((s) => ({ ...s, topic }));
          }}
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
          onChange={(e) => {
            const materialUrl = e.target.value;
            setState((s) => ({ ...s, materialUrl }));
          }}
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
          setState((s) => ({ ...s, requiresGamerCreations }))
        }
        label={t("labels.requiresGamerCreations")}
        hint={t("hints.requiresGamerCreationsHint")}
      />
    </FormSection>
  );
}
