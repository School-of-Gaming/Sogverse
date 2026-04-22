"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ProductCard } from "../../browse-mockup/_components/product-card";
import {
  getAncestors,
  getLocation,
  getMunicipalityClubsForLocation,
} from "../../browse-mockup/_mock/data";

export default function LocationPage() {
  const { locationSlug } = useParams<{ locationSlug: string }>();
  const location = getLocation(locationSlug);

  if (!location) {
    return (
      <div className="container mx-auto px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold">Location not found</h1>
        <p className="mt-2 text-muted-foreground">
          We couldn&apos;t find anywhere called &quot;{locationSlug}&quot;.
        </p>
        <Link href="/registration" className="mt-6 inline-block">
          <Button variant="outline">Back to search</Button>
        </Link>
      </div>
    );
  }

  const clubs = getMunicipalityClubsForLocation(location.id);
  const breadcrumb = getAncestors(location.id)
    .filter((a) => a.type !== "country" && a.id !== location.id)
    .map((a) => a.name)
    .join(" · ");

  return (
    <div className="container mx-auto px-4 py-10">
      <div className="mb-2">
        <Link
          href="/registration"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Back to search
        </Link>
      </div>

      <div className="border-b border-border pb-6">
        {breadcrumb && (
          <p className="text-sm text-muted-foreground">{breadcrumb}</p>
        )}
        <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
          {location.name}
        </h1>
        {location.termLabel && (
          <p className="mt-3 text-sm text-muted-foreground">
            {location.termLabel}
          </p>
        )}
      </div>

      <div className="mt-8">
        <h2 className="text-xl font-semibold">
          {clubs.length === 0
            ? "No municipality clubs here this term"
            : clubs.length === 1
              ? "1 municipality club at this location"
              : `${clubs.length} municipality clubs at this location`}
        </h2>
        {clubs.length > 0 && (
          <p className="mt-1 text-sm text-muted-foreground">
            Free to families — funded by the municipality. Seats fill fast,
            especially in the minutes after registration opens.
          </p>
        )}
      </div>

      <div className="mt-6">
        {clubs.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {clubs.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {location.name} doesn&apos;t have a municipality-funded club this
              term. Check back next semester.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

