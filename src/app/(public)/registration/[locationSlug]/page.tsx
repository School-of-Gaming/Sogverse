"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ProductCard } from "../../browse-mockup/_components/product-card";
import {
  PRODUCT_TYPE_DEFS,
  getAncestors,
  getLocation,
  getProductsForLocation,
} from "../../browse-mockup/_mock/data";

export default function LocationPage() {
  const { locationSlug } = useParams<{ locationSlug: string }>();
  const location = getLocation(locationSlug);

  if (!location) {
    return (
      <div className="container mx-auto px-4 py-24 text-center">
        <MockupRibbon />
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

  const products = getProductsForLocation(location.id);
  const breadcrumb = getAncestors(location.id)
    .filter((a) => a.type !== "country" && a.id !== location.id)
    .map((a) => a.name)
    .join(" · ");

  // Group by product type so the page still reads as "school clubs + camps
  // + events at this location" rather than one undifferentiated list.
  const grouped = PRODUCT_TYPE_DEFS.map((def) => ({
    def,
    items: products.filter((p) => p.type === def.slug),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="container mx-auto px-4 py-10">
      <MockupRibbon />

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
          {products.length === 1
            ? "1 thing on offer here"
            : `${products.length} things on offer here`}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Seats fill fast — especially in the minutes after registration opens.
        </p>
      </div>

      <div className="mt-6 space-y-10">
        {grouped.map(({ def, items }) => (
          <section key={def.slug}>
            <div className="flex items-baseline justify-between gap-2 border-b border-border pb-3">
              <h3 className="text-lg font-semibold">
                {def.plural}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {items.length}
                </span>
              </h3>
              <p className="hidden text-xs text-muted-foreground sm:block">
                {def.shortBlurb}
              </p>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {items.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        ))}

        {products.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Nothing is offered at {location.name} this term. Check back next
              semester — or browse our online clubs, camps, and events that work
              anywhere in Finland.
              <div className="mt-4">
                <Link href="/browse-mockup">
                  <Button variant="outline">Browse everything</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function MockupRibbon() {
  return (
    <div className="mx-auto mb-8 max-w-md rounded-md border border-dashed border-primary/50 bg-primary/10 px-4 py-2 text-center text-xs text-primary">
      Mockup · all data is fake · for product-team review
    </div>
  );
}
