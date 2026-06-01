"use client";

import { useTranslations, useLocale } from "next-intl";
import { Sliders, X, Globe, MapPin } from "lucide-react";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { LanguageFlag } from "@/components/ui/language-flag";
import { useTopics, useTags } from "@/services/products";
import { useSpokenLanguages } from "@/services/users";
import { cn } from "@/lib/utils";
import { useBrowseFilters } from "./use-browse-filters";

// Filter strip — three horizontally-scrollable chip rows (topic, tag,
// format). Chips are pill-shaped with a clear active state (filled
// primary) so taps register on small phone screens; rows are scrollable
// rather than wrapping so they never push the cards down on overflow.
//
// Format is single-valued — the parent picks Online OR In-person, not
// both. Toggling the active chip clears the filter back to "either".
//
// No match-count display: the visible card grid already conveys that
// information at a glance, and surfacing a count next to a "Clear"
// button made the meta row's height jump when the button appeared.
export function ProductBrowseFilters() {
  const t = useTranslations("productBrowse.filters");
  const uiLocale = resolveLocale(useLocale());
  const { data: topics } = useTopics();
  const { data: tags } = useTags();
  const { data: spokenLanguages } = useSpokenLanguages();
  const {
    topics: selectedTopics,
    tags: selectedTags,
    format: selectedFormat,
    languages: selectedLanguages,
    hasAny,
    toggleTopic,
    toggleTag,
    toggleFormat,
    toggleLanguage,
    clear,
  } = useBrowseFilters();

  const games = (topics ?? []).filter((tp) => tp.kind === "game");
  const subjects = (topics ?? []).filter((tp) => tp.kind === "subject");
  const hasTopicRow = games.length > 0 || subjects.length > 0;
  const hasTagRow = (tags?.length ?? 0) > 0;
  const hasLanguageRow = (spokenLanguages?.length ?? 0) > 0;

  return (
    <div className="rounded-xl border bg-card/50 p-3 sm:p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Sliders className="h-3.5 w-3.5" aria-hidden />
          {t("filterBy")}
        </div>
        {/* Clear is always rendered so the row's height doesn't shift
            when a filter becomes active — `invisible` keeps the box,
            hides the pixels. */}
        <button
          type="button"
          onClick={clear}
          aria-hidden={!hasAny}
          tabIndex={hasAny ? 0 : -1}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border border-input px-2 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
            !hasAny && "invisible pointer-events-none",
          )}
        >
          <X className="h-3 w-3" aria-hidden />
          {t("clearAll")}
        </button>
      </div>

      <div className="space-y-2">
        {hasTopicRow && (
          <FilterRow label={t("topic")}>
            {games.map((tp) => {
              const tr = resolveTranslation(tp.topic_translations, uiLocale);
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
              const tr = resolveTranslation(tp.topic_translations, uiLocale);
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
              const tr = resolveTranslation(tg.tag_translations, uiLocale);
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

        <FilterRow label={t("format")}>
          <Chip
            icon={<Globe className="h-3 w-3" aria-hidden />}
            label={t("formatOnline")}
            active={selectedFormat === "online"}
            onToggle={() => toggleFormat("online")}
          />
          <Chip
            icon={<MapPin className="h-3 w-3" aria-hidden />}
            label={t("formatInPerson")}
            active={selectedFormat === "in_person"}
            onToggle={() => toggleFormat("in_person")}
          />
        </FilterRow>

        {hasLanguageRow && (
          <FilterRow label={t("language")}>
            {spokenLanguages!.map((lang) => (
              <Chip
                key={lang.code}
                icon={<LanguageFlag code={lang.code} showCode={false} title={lang.name} />}
                label={lang.code.toUpperCase()}
                active={selectedLanguages.includes(lang.code.toLowerCase())}
                onToggle={() => toggleLanguage(lang.code)}
              />
            ))}
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
  icon,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
        active
          ? "border-primary bg-primary text-primary-foreground shadow-sm"
          : "border-input bg-background text-foreground/80 hover:border-primary/40 hover:bg-accent",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
