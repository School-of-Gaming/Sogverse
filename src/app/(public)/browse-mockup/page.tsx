"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarClock,
  SlidersHorizontal,
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

// Browse is the *consumer* entry point — parents who buy clubs, camps, or
// events directly from us. Municipality clubs live on /registration as a
// separate discovery path; the two paths never cross-link (docs/products-
// redesign.md §7.1).
const BROWSE_PRODUCTS = PRODUCTS.filter((p) => p.type !== "municipality-club");
const BROWSE_TYPE_DEFS = PRODUCT_TYPE_DEFS.filter(
  (d) => d.slug !== "municipality-club",
);
import { ProductCard } from "./_components/product-card";
import { TYPE_ICON } from "./_components/type-icon";

export default function BrowseMockupPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const filtered = useMemo(
    () => filterProducts(BROWSE_PRODUCTS, filters),
    [filters],
  );

  const grouped = useMemo(() => {
    return BROWSE_TYPE_DEFS.map((def) => ({
      def,
      items: filtered.filter((p) => p.type === def.slug),
    })).filter((g) => g.items.length > 0);
  }, [filtered]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.age !== null) n += 1;
    n += filters.languages.length;
    n += filters.types.length;
    if (filters.format !== "any") n += 1;
    n += filters.topicIds.length;
    return n;
  }, [filters]);

  const clear = () => setFilters(EMPTY_FILTERS);

  return (
    <div>
      <div className="container mx-auto px-4 py-12">
        <Hero />
      </div>

      <div id="browse" className="flex items-start border-t border-sidebar-border">
        <aside className="sticky top-0 h-screen w-72 shrink-0 overflow-y-auto border-r border-sidebar-border bg-sidebar-background">
          <FilterPanel
            filters={filters}
            onChange={setFilters}
            onClear={clear}
            activeCount={activeFilterCount}
            resultCount={filtered.length}
          />
        </aside>

        <div className="min-w-0 flex-1">
          <div className="space-y-10 px-8 py-8">
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
                  <p className="text-xs text-muted-foreground">
                    {def.shortBlurb}
                  </p>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {items.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
              </section>
            ))}

            {grouped.length === 0 && <EmptyState onReset={clear} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
        Find the right thing for your gamer
      </h1>
      <p className="mx-auto mt-4 text-muted-foreground sm:text-lg">
        Sogverse runs weekly clubs, school-holiday camps, and one-off events —
        online and across Finland. Scroll to browse below, or let us help if
        it feels like a lot.
      </p>

      <Link
        href="/browse-mockup/quiz"
        className="group mx-auto mt-8 flex max-w-md items-center gap-4 rounded-xl border border-primary/40 bg-primary/5 p-5 text-left transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Sparkles className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Feeling overwhelmed? Take the quiz.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Five quick questions about your gamer. We&apos;ll shortlist what
            fits.
          </p>
        </div>
        <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}

function FilterPanel({
  filters,
  onChange,
  onClear,
  activeCount,
  resultCount,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  onClear: () => void;
  activeCount: number;
  resultCount: number;
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
    <div className="flex h-full flex-col bg-sidebar-background text-sidebar-foreground">
      <div className="flex items-center justify-between gap-2 border-b border-sidebar-border px-5 py-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-sidebar-foreground/70" />
          <p className="text-sm font-semibold">Filters</p>
          {activeCount > 0 && (
            <span className="rounded-full bg-sidebar-primary/15 px-2 py-0.5 text-xs text-sidebar-primary">
              {activeCount}
            </span>
          )}
        </div>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <p className="text-xs text-sidebar-foreground/60">
          {resultCount === 0
            ? "No matches"
            : `${resultCount} ${resultCount === 1 ? "option" : "options"} match`}
        </p>

        <div className="mt-6 space-y-6">
          <Section label="Your gamer's age">
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
              className="w-full"
            />
          </Section>

          <Section label="Kind">
            <ChipRow>
              {BROWSE_TYPE_DEFS.map((def) => (
                <Chip
                  key={def.slug}
                  active={filters.types.includes(def.slug)}
                  onClick={() => toggleType(def.slug)}
                >
                  {def.plural}
                </Chip>
              ))}
            </ChipRow>
          </Section>

          <Section label="Where">
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
          </Section>

          <Section label="Language">
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
          </Section>

          <Section label="Games & interests">
            <ChipRow>
              {TOPICS.map((t) => (
                <TopicChip
                  key={t.id}
                  topic={t}
                  active={filters.topicIds.includes(t.id)}
                  onClick={() => toggleTopic(t.id)}
                />
              ))}
            </ChipRow>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/60">
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
          ? "border-sidebar-primary bg-sidebar-primary/15 text-sidebar-primary"
          : "border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
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
        "rounded-full border px-3 py-1 text-xs transition-colors",
        active
          ? "border-sidebar-primary bg-sidebar-primary/15 text-sidebar-primary"
          : "border-sidebar-border text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
      title={topic.blurb}
    >
      {topic.name}
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
