"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight, Search, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  LOCATIONS,
  getAncestors,
  getProductsForLocation,
  type Location,
} from "../browse-mockup/_mock/data";

type ActiveLocation = {
  location: Location;
  productCount: number;
  ancestors: Location[]; // root → self, excluding country
};

export default function RegistrationLandingPage() {
  const [query, setQuery] = useState("");

  // Every location that has at least one product at-or-under it. We search
  // across *all* levels — a parent who types "Ressu" should find the school,
  // one who types "Helsinki" should find the municipality, one who types
  // "Uusimaa" should find the region.
  const active = useMemo<ActiveLocation[]>(() => {
    return LOCATIONS.filter((l) => l.type !== "country")
      .map((location) => {
        const productCount = getProductsForLocation(location.id).length;
        const ancestors = getAncestors(location.id).filter(
          (a) => a.type !== "country" && a.id !== location.id,
        );
        return { location, productCount, ancestors };
      })
      .filter((r) => r.productCount > 0);
  }, []);

  const normalized = query.trim().toLowerCase();

  const matches = useMemo<ActiveLocation[]>(() => {
    if (!normalized) return active;
    return active.filter(({ location, ancestors }) => {
      const haystack = [location.name, ...ancestors.map((a) => a.name)]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [active, normalized]);

  // When browsing (no query), pull municipalities to the top — that's what
  // most parents want. Regions and sites are still reachable via search.
  const browseList = useMemo<ActiveLocation[]>(() => {
    return matches
      .filter((r) => r.location.type === "municipality")
      .sort((a, b) => a.location.name.localeCompare(b.location.name));
  }, [matches]);

  const searchList = useMemo<ActiveLocation[]>(() => {
    return [...matches].sort((a, b) => {
      const order: Record<string, number> = {
        municipality: 0,
        site: 1,
        region: 2,
      };
      const oa = order[a.location.type] ?? 99;
      const ob = order[b.location.type] ?? 99;
      if (oa !== ob) return oa - ob;
      return a.location.name.localeCompare(b.location.name);
    });
  }, [matches]);

  const list = normalized ? searchList : browseList;

  return (
    <div className="container mx-auto px-4 py-12">
      <MockupRibbon />

      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
          Find your child&apos;s club, camp, or event
        </h1>
        <p className="mt-4 text-muted-foreground sm:text-lg">
          Sogverse runs clubs, camps, and events — online and across Finland.
          Type where you live or your child&apos;s school to see what&apos;s
          offered there.
        </p>
      </div>

      <div className="mx-auto mt-10 max-w-xl">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Helsinki, Espoo, Tapiolan koulu, Uusimaa"
            autoFocus
            className="pl-9 text-base"
          />
        </div>
        {!normalized && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Or pick your town from the list below
          </p>
        )}
      </div>

      <div className="mx-auto mt-8 max-w-xl space-y-2">
        {list.map(({ location, productCount, ancestors }) => (
          <ResultRow
            key={location.id}
            location={location}
            productCount={productCount}
            ancestors={ancestors}
          />
        ))}
        {list.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No matches for &quot;{query}&quot;. Try your town, your
              child&apos;s school, or the region (e.g. Uusimaa).
            </CardContent>
          </Card>
        )}
      </div>

      <div className="mx-auto mt-12 max-w-xl">
        <Link
          href="/browse-mockup"
          className="group block rounded-xl border border-dashed border-primary/40 bg-primary/5 p-5 text-left transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Not tied to a location?</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Browse our online clubs, camps, and events — or let our quick
                wizard pick a shortlist for your gamer.
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
        </Link>
      </div>

      <div className="mx-auto mt-14 max-w-4xl">
        <h2 className="text-center text-xl font-semibold">How it works</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <StepCard
            step="1"
            title="Find your town or school"
            body="We'll show every club, camp, and event offered there — at schools, libraries, community centres, or online."
          />
          <StepCard
            step="2"
            title="Be ready when signup opens"
            body="Seats fill fast. Save your child ahead of time so you're ready the moment registration opens."
          />
          <StepCard
            step="3"
            title="Join the waitlist if full"
            body="We'll notify you by email or WhatsApp if a seat opens up."
          />
        </div>
      </div>
    </div>
  );
}

function ResultRow({
  location,
  productCount,
  ancestors,
}: {
  location: Location;
  productCount: number;
  ancestors: Location[];
}) {
  const breadcrumb = ancestors.map((a) => a.name).join(" · ");
  const typeLabel =
    location.type === "region"
      ? "Region"
      : location.type === "municipality"
        ? "Municipality"
        : "Venue";

  return (
    <Link
      href={`/registration/${location.slug}`}
      className="block rounded-md border border-input bg-card transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      <div className="flex items-center justify-between px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{location.name}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {typeLabel}
            </span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {breadcrumb ? <span>{breadcrumb} · </span> : null}
            {productCount} {productCount === 1 ? "offering" : "offerings"}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </div>
    </Link>
  );
}

function StepCard({ step, title, body }: { step: string; title: string; body: string }) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
          {step}
        </div>
        <h3 className="mt-4 font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}

function MockupRibbon() {
  return (
    <div className="mx-auto mb-8 max-w-md rounded-md border border-dashed border-primary/50 bg-primary/10 px-4 py-2 text-center text-xs text-primary">
      Mockup · all data is fake · for product-team review
    </div>
  );
}
