"use client";

import { useTranslations } from "next-intl";
import { resolveLocale } from "@/lib/constants/locales";
import { useLocale } from "next-intl";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { useTopicsV2, useTagsV2 } from "@/services/products-v2";
import { cn } from "@/lib/utils";
import { useBrowseFilters } from "./use-browse-filters";

interface ProductBrowseFiltersProps {
  resultCount: number;
}

// Filter strip — two horizontally-scrollable chip rows (topic, tag)
// plus a "clear filters" affordance and live result count. Keeping
// the chip rows as `overflow-x-auto` flex containers lets long lists
// scroll on narrow screens without wrapping into multi-row stacks
// that push the cards down.
export function ProductBrowseFilters({ resultCount }: ProductBrowseFiltersProps) {
  const t = useTranslations("productBrowse.filters");
  const uiLocale = resolveLocale(useLocale());
  const { data: topics } = useTopicsV2();
  const { data: tags } = useTagsV2();
  const {
    topics: selectedTopics,
    tags: selectedTags,
    hasAny,
    toggleTopic,
    toggleTag,
    clear,
  } = useBrowseFilters();

  const games = (topics ?? []).filter((tp) => tp.kind === "game");
  const subjects = (topics ?? []).filter((tp) => tp.kind === "subject");

  return (
    <div className="space-y-3">
      {(games.length > 0 || subjects.length > 0) && (
        <FilterRow label={t("topic")}>
          {games.map((tp) => {
            const tr = resolveTranslation(tp.topic_translations_v2, uiLocale);
            return (
              <Chip
                key={tp.id}
                label={tr?.name ?? tp.slug}
                active={selectedTopics.includes(tp.slug.toLowerCase())}
                onToggle={() => toggleTopic(tp.slug)}
              />
            );
          })}
          {subjects.length > 0 && games.length > 0 && (
            <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-border" />
          )}
          {subjects.map((tp) => {
            const tr = resolveTranslation(tp.topic_translations_v2, uiLocale);
            return (
              <Chip
                key={tp.id}
                label={tr?.name ?? tp.slug}
                active={selectedTopics.includes(tp.slug.toLowerCase())}
                onToggle={() => toggleTopic(tp.slug)}
              />
            );
          })}
        </FilterRow>
      )}

      {tags && tags.length > 0 && (
        <FilterRow label={t("tag")}>
          {tags.map((tg) => {
            const tr = resolveTranslation(tg.tag_translations_v2, uiLocale);
            return (
              <Chip
                key={tg.id}
                label={tr?.name ?? tg.slug}
                active={selectedTags.includes(tg.slug.toLowerCase())}
                onToggle={() => toggleTag(tg.slug)}
              />
            );
          })}
        </FilterRow>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{t("results", { count: resultCount })}</span>
        {hasAny && (
          <button
            type="button"
            onClick={clear}
            className="font-medium text-primary hover:underline"
          >
            {t("clearAll")}
          </button>
        )}
      </div>
    </div>
  );
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-1 gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
    </div>
  );
}

function Chip({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1 text-xs transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {label}
    </button>
  );
}
