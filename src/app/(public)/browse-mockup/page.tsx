"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarClock,
  Monitor,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  EMPTY_FILTERS,
  LANGUAGE_NAMES,
  LANGUAGE_ORDER,
  PRODUCTS,
  PRODUCT_TYPE_DEFS,
  TOPICS,
  filterProducts,
  type Filters,
  type Language,
  type ProductType,
  type Topic,
} from "./_mock/data";
import { MockupRibbon } from "./_components/mockup-ribbon";
import { ProductCard } from "./_components/product-card";
import { TYPE_ICON } from "./_components/type-icon";

export default function BrowseMockupPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const filtered = useMemo(() => filterProducts(PRODUCTS, filters), [filters]);

  const grouped = useMemo(() => {
    return PRODUCT_TYPE_DEFS.map((def) => ({
      def,
      items: filtered.filter((p) => p.type === def.slug),
    })).filter((g) => g.items.length > 0);
  }, [filtered]);

  const hasActiveFilter = useMemo(() => {
    return (
      filters.age !== null ||
      filters.languages.length > 0 ||
      filters.types.length > 0 ||
      filters.format !== "any" ||
      filters.topicIds.length > 0
    );
  }, [filters]);

  return (
    <div className="container mx-auto px-4 py-12">
      <MockupRibbon />

      <Hero />

      <div id="browse" className="mx-auto mt-12 max-w-6xl">
        <FilterBar
          filters={filters}
          onChange={setFilters}
          onClear={() => setFilters(EMPTY_FILTERS)}
          hasActiveFilter={hasActiveFilter}
          count={filtered.length}
        />

        <div className="mt-8 space-y-10">
          {grouped.map(({ def, items }) => (
            <section key={def.slug}>
              <div className="flex items-baseline justify-between gap-2 border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <TypeBadge type={def.slug} />
                  <h2 className="text-lg font-semibold">{def.plural}</h2>
                  <span className="text-sm text-muted-foreground">
                    {items.length}
                  </span>
                </div>
                <p className="hidden text-xs text-muted-foreground sm:block">
                  {def.shortBlurb}
                </p>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            </section>
          ))}

          {grouped.length === 0 && <EmptyState onReset={() => setFilters(EMPTY_FILTERS)} />}
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <div className="mx-auto max-w-4xl text-center">
      <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
        Find the right thing for your gamer
      </h1>
      <p className="mx-auto mt-4 max-w-2xl text-muted-foreground sm:text-lg">
        Sogverse runs weekly clubs, school-holiday camps, and one-off events —
        online and across Finland. Pick the path that fits you.
      </p>

      <div className="mx-auto mt-10 grid gap-4 sm:grid-cols-2">
        <Link
          href="/browse-mockup/quiz"
          className="group relative block rounded-xl border border-primary/40 p-6 text-left transition-colors hover:border-primary hover:bg-accent"
        >
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Sparkles className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold">Not sure what fits?</h2>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Answer five quick questions about your gamer. We&apos;ll shortlist
                the clubs, camps, and events that match.
              </p>
            </div>
          </div>
        </Link>

        <a
          href="#browse"
          className="group relative block rounded-xl border border-input bg-card p-6 text-left transition-colors hover:border-primary/50 hover:bg-accent"
        >
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
              <Monitor className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold">I know what I want</h2>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Browse everything on offer. Narrow by age, language, type, or
                game.
              </p>
            </div>
          </div>
        </a>
      </div>
    </div>
  );
}

function FilterBar({
  filters,
  onChange,
  onClear,
  hasActiveFilter,
  count,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  onClear: () => void;
  hasActiveFilter: boolean;
  count: number;
}) {
  const toggleLanguage = (lang: Language) => {
    onChange({
      ...filters,
      languages: filters.languages.includes(lang)
        ? filters.languages.filter((l) => l !== lang)
        : [...filters.languages, lang],
    });
  };

  const toggleType = (type: ProductType) => {
    onChange({
      ...filters,
      types: filters.types.includes(type)
        ? filters.types.filter((t) => t !== type)
        : [...filters.types, type],
    });
  };

  const toggleTopic = (id: string) => {
    onChange({
      ...filters,
      topicIds: filters.topicIds.includes(id)
        ? filters.topicIds.filter((t) => t !== id)
        : [...filters.topicIds, id],
    });
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <FieldLabel label="Your gamer's age">
            <Input
              type="number"
              min={4}
              max={18}
              inputMode="numeric"
              placeholder="e.g. 10"
              value={filters.age ?? ""}
              onChange={(e) => {
                const raw = e.target.value.trim();
                onChange({
                  ...filters,
                  age: raw === "" ? null : Number(raw),
                });
              }}
              className="w-28"
            />
          </FieldLabel>

          <FieldLabel label="Language">
            <ChipRow>
              {LANGUAGE_ORDER.map((code) => (
                <Chip
                  key={code}
                  active={filters.languages.includes(code)}
                  onClick={() => toggleLanguage(code)}
                >
                  {LANGUAGE_NAMES[code]}
                </Chip>
              ))}
            </ChipRow>
          </FieldLabel>

          <FieldLabel label="Kind">
            <ChipRow>
              {PRODUCT_TYPE_DEFS.map((def) => (
                <Chip
                  key={def.slug}
                  active={filters.types.includes(def.slug)}
                  onClick={() => toggleType(def.slug)}
                >
                  {def.plural}
                </Chip>
              ))}
            </ChipRow>
          </FieldLabel>

          <FieldLabel label="Where">
            <ChipRow>
              <Chip
                active={filters.format === "any"}
                onClick={() => onChange({ ...filters, format: "any" })}
              >
                Either
              </Chip>
              <Chip
                active={filters.format === "online"}
                onClick={() => onChange({ ...filters, format: "online" })}
              >
                Online
              </Chip>
              <Chip
                active={filters.format === "in_person"}
                onClick={() => onChange({ ...filters, format: "in_person" })}
              >
                In person
              </Chip>
            </ChipRow>
          </FieldLabel>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Games &amp; interests
          </p>
          <div className="flex flex-wrap gap-2">
            {TOPICS.map((t) => (
              <TopicChip
                key={t.id}
                topic={t}
                active={filters.topicIds.includes(t.id)}
                onClick={() => toggleTopic(t.id)}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
          <p className="text-muted-foreground">
            {count === 0 ? "No matches" : `Showing ${count} ${count === 1 ? "option" : "options"}`}
          </p>
          {hasActiveFilter && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              className="text-muted-foreground"
            >
              <X className="h-4 w-4" />
              Clear filters
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function FieldLabel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-1.5">{children}</div>;
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-sm transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-input text-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

function TopicChip({
  topic,
  active,
  onClick,
}: {
  topic: Topic;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-sm transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-input text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
      title={topic.blurb}
    >
      {topic.name}
      {topic.kind === "subject" && (
        <span className="ml-1.5 text-[10px] uppercase tracking-wider opacity-60">
          topic
        </span>
      )}
    </button>
  );
}

function TypeBadge({ type }: { type: ProductType }) {
  const Icon = TYPE_ICON[type];
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
      <Icon className="h-4 w-4" />
    </div>
  );
}

function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <CalendarClock className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-4 text-sm text-muted-foreground">
          Nothing matches your filters right now.
        </p>
        <p className="text-sm text-muted-foreground">
          Try widening the age range or clearing a filter.
        </p>
        <Button variant="outline" size="sm" onClick={onReset} className="mt-4">
          Clear all filters
        </Button>
      </CardContent>
    </Card>
  );
}

