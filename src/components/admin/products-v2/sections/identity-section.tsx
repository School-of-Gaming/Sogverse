"use client";

import { Check, Loader2, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  LOCALE_CONFIG,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import {
  useCreateTagV2,
  useCreateTopicV2,
  useTagsV2,
  useTopicsV2,
} from "@/services/products-v2";
import { Field, FormSection } from "../form-primitives";
import { ImagePickerV2 } from "../image-picker-v2";
import {
  TOPIC_KIND_ORDER,
  type FormState,
  type TranslationDraft,
} from "../product-v2-form-state";
import type { ProductTypeConfig } from "../product-v2-type-config";

interface IdentitySectionProps {
  state: FormState;
  setState: React.Dispatch<React.SetStateAction<FormState>>;
  config: ProductTypeConfig;
  uiLocale: SupportedLocale;
  setError: (msg: string | null) => void;
}

export function IdentitySection({
  state,
  setState,
  config,
  uiLocale,
  setError,
}: IdentitySectionProps) {
  const t = useTranslations("admin.productsV2");
  const c = useTranslations("common");

  const { data: topics } = useTopicsV2();
  const { data: tags } = useTagsV2();
  const createTopic = useCreateTopicV2();
  const createTag = useCreateTagV2();

  const addedLocales = SUPPORTED_LOCALES.filter(
    (l) => state.translations[l] !== undefined,
  );
  const addableLocales = SUPPORTED_LOCALES.filter(
    (l) => state.translations[l] === undefined,
  );
  const activeDraft: TranslationDraft = state.translations[
    state.activeLocale
  ] ?? { name: "", description: "" };

  function setActiveTranslation(patch: Partial<TranslationDraft>) {
    setState((s) => ({
      ...s,
      translations: {
        ...s.translations,
        [s.activeLocale]: {
          ...(s.translations[s.activeLocale] ?? { name: "", description: "" }),
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
        [locale]: { name: "", description: "" },
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

  async function handleCreateTopic() {
    const name = state.newTopicName.trim();
    if (!name) return;
    setError(null);
    try {
      const created = await createTopic.mutateAsync({
        name,
        kind: state.newTopicKind,
        locale: uiLocale,
      });
      setState((s) => ({
        ...s,
        topicId: created.id,
        showNewTopic: false,
        newTopicName: "",
        newTopicKind: "game",
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.createFailed"));
    }
  }

  async function handleCreateTag() {
    const name = state.newTagName.trim();
    if (!name) return;
    setError(null);
    try {
      const created = await createTag.mutateAsync({ name, locale: uiLocale });
      setState((s) => {
        const next = new Set(s.tagIds);
        next.add(created.id);
        return {
          ...s,
          tagIds: next,
          showNewTag: false,
          newTagName: "",
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.createFailed"));
    }
  }

  return (
    <FormSection
      title={t("sections.identity")}
      description={t("sections.identityDescription")}
    >
      {/* Language tabs — at least one of (en, fi) required. The hint below
          spells the rule out. Switching tabs preserves what's typed in each. */}
      <div className="space-y-2">
        <Label>
          {t("translations.label")}
          <span className="ml-0.5 text-destructive">*</span>
        </Label>
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
                      locale: LOCALE_CONFIG[locale].label,
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
                if (e.target.value)
                  addLocaleTab(e.target.value as SupportedLocale);
              }}
              className="ml-1 mb-1 h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
            >
              <option value="">{t("translations.addLocale")}</option>
              {addableLocales.map((l) => (
                <option key={l} value={l}>
                  {LOCALE_CONFIG[l].label}
                </option>
              ))}
            </select>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {t("translations.hint")}
        </p>
      </div>

      <Field
        label={t("labels.name")}
        htmlFor={`p-name-${state.activeLocale}`}
        required
      >
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
        label={t("labels.description")}
        htmlFor={`p-description-${state.activeLocale}`}
        required
      >
        <textarea
          id={`p-description-${state.activeLocale}`}
          placeholder={t(`placeholders.description.${config.i18nKey}`)}
          value={activeDraft.description}
          onChange={(e) =>
            setActiveTranslation({ description: e.target.value })
          }
          rows={3}
          required
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </Field>

      <ImagePickerV2
        value={state.image}
        onChange={(v) => setState({ ...state, image: v })}
      />

      <Field
        label={t("labels.topic")}
        htmlFor="p-topic"
        required
        hint={t("hints.topicHint")}
      >
        {state.showNewTopic ? (
          <div className="space-y-2 rounded-md border border-input bg-muted/20 p-3">
            <Input
              placeholder={t("placeholders.newTopicName")}
              value={state.newTopicName}
              onChange={(e) =>
                setState({ ...state, newTopicName: e.target.value })
              }
              autoFocus
              disabled={createTopic.isPending}
            />
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {t("labels.groupTopicUnder")}
              </span>
              {TOPIC_KIND_ORDER.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setState({ ...state, newTopicKind: kind })}
                  disabled={createTopic.isPending}
                  className={cn(
                    "rounded-md border px-3 py-1 text-xs transition-colors",
                    state.newTopicKind === kind
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-input text-muted-foreground hover:border-foreground hover:text-foreground"
                  )}
                >
                  {t(`topicKindSingular.${kind}`)}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("translations.inlineCreateHint", {
                locale: LOCALE_CONFIG[uiLocale].nativeLabel,
              })}
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={createTopic.isPending}
                onClick={() =>
                  setState({
                    ...state,
                    newTopicName: "",
                    showNewTopic: false,
                  })
                }
              >
                {c("cancel")}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!state.newTopicName.trim() || createTopic.isPending}
                onClick={handleCreateTopic}
              >
                {createTopic.isPending && (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                )}
                {t("actions.addTopic")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <select
              id="p-topic"
              value={state.topicId}
              onChange={(e) =>
                setState({ ...state, topicId: e.target.value })
              }
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">{t("placeholders.selectTopic")}</option>
              {TOPIC_KIND_ORDER.map((kind) => {
                const group =
                  topics?.filter((topic) => topic.kind === kind) ?? [];
                if (group.length === 0) return null;
                return (
                  <optgroup key={kind} label={t(`topicKinds.${kind}`)}>
                    {group.map((topic) => {
                      const tr = resolveTranslation(
                        topic.topic_translations_v2,
                        uiLocale,
                      );
                      return (
                        <option key={topic.id} value={topic.id}>
                          {tr?.name ?? topic.slug}
                        </option>
                      );
                    })}
                  </optgroup>
                );
              })}
            </select>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setState({ ...state, showNewTopic: true })}
              title={t("actions.addNewTopic")}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        )}
      </Field>

      <Field label={t("labels.tags")} hint={t("hints.tagsHint")}>
        <div className="flex flex-wrap items-center gap-2">
          {tags?.map((tag) => {
            const selected = state.tagIds.has(tag.id);
            const tr = resolveTranslation(tag.tag_translations_v2, uiLocale);
            const tagName = tr?.name ?? tag.slug;
            const tagDescription = tr?.description ?? null;
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => {
                  const next = new Set(state.tagIds);
                  if (selected) next.delete(tag.id);
                  else next.add(tag.id);
                  setState({ ...state, tagIds: next });
                }}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  selected
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-input text-muted-foreground hover:border-foreground hover:text-foreground"
                )}
                title={tagDescription ?? undefined}
              >
                {selected && <Check className="mr-1 inline h-3 w-3" />}
                {tagName}
              </button>
            );
          })}

          {state.showNewTag ? (
            <span className="inline-flex items-center gap-1">
              <Input
                value={state.newTagName}
                onChange={(e) =>
                  setState({ ...state, newTagName: e.target.value })
                }
                placeholder={t("placeholders.newTagName")}
                autoFocus
                className="h-7 w-40 text-xs"
                disabled={createTag.isPending}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleCreateTag();
                  }
                  if (e.key === "Escape") {
                    setState({
                      ...state,
                      newTagName: "",
                      showNewTag: false,
                    });
                  }
                }}
              />
              <Button
                type="button"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={!state.newTagName.trim() || createTag.isPending}
                onClick={handleCreateTag}
              >
                {createTag.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  t("actions.addTagShort")
                )}
              </Button>
              <button
                type="button"
                onClick={() =>
                  setState({ ...state, newTagName: "", showNewTag: false })
                }
                className="rounded p-1 text-muted-foreground hover:text-foreground"
                aria-label={c("cancel")}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setState({ ...state, showNewTag: true })}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-input px-3 py-1 text-xs text-muted-foreground hover:border-foreground hover:text-foreground"
            >
              <Plus className="h-3 w-3" />
              {t("actions.addNewTag")}
            </button>
          )}
        </div>
        {state.showNewTag && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t("translations.inlineCreateHint", {
              locale: LOCALE_CONFIG[uiLocale].nativeLabel,
            })}
          </p>
        )}
      </Field>

      <Field
        label={t("labels.padletUrl")}
        htmlFor="p-padlet"
        hint={t("hints.padletHint")}
      >
        <Input
          id="p-padlet"
          type="url"
          placeholder={t("placeholders.padletUrl")}
          value={state.padletUrl}
          onChange={(e) => setState({ ...state, padletUrl: e.target.value })}
        />
      </Field>
    </FormSection>
  );
}
