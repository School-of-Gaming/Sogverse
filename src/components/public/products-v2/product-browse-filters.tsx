"use client";

import { useTranslations, useLocale } from "next-intl";
import { Sliders, X } from "lucide-react";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { useTopicsV2, useTagsV2 } from "@/services/products-v2";
import { cn } from "@/lib/utils";
import { useBrowseFilters } from "./use-browse-filters";

interface ProductBrowseFiltersProps {
  resultCount: number;
}

// Filter strip — two horizontally-scrollable chip rows (topic, tag) plus
// a result count and a "Clear" affordance shown only when something is
// selected. Chips are pill-shaped with a clear active state (filled
// primary) so taps register on small phone screens; rows are scrollable
// rather than wrapping so they never push the cards down on overflow.
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
  const hasTopicRow = games.length > 0 || subjects.length > 0;
  const hasTagRow = (tags?.length ?? 0) > 0;

  return (
    <div className="rounded-xl border bg-card/50 p-3 sm:p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Sliders className="h-3.5 w-3.5" aria-hidden />
          {t("filterBy")}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{t("results", { count: resultCount })}</span>
          {hasAny && (
            <button
              type="button"
              onClick={clear}
              className="inline-flex items-center gap-1 rounded-full border border-input px-2 py-0.5 font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <X className="h-3 w-3" aria-hidden />
              {t("clearAll")}
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {hasTopicRow && (
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

        {hasTagRow && (
          <FilterRow label={t("tag")}>
            {tags!.map((tg) => {
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
    <div className="flex items-center gap-3">
      <span className="w-12 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:w-14">
        {label}
      </span>
      <div className="flex flex-1 gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
        "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
        active
          ? "border-primary bg-primary text-primary-foreground shadow-sm"
          : "border-input bg-background text-foreground/80 hover:border-primary/40 hover:bg-accent",
      )}
    >
      {label}
    </button>
  );
}
