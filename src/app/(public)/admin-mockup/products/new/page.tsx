"use client";

import Link from "next/link";
import { ArrowRight, CalendarClock, CalendarRange, PartyPopper, Repeat } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PRODUCT_TYPES, type ProductType } from "./_mock/data";

const ICON_FOR_TYPE: Record<ProductType, React.ComponentType<{ className?: string }>> = {
  "consumer-club": Repeat,
  "municipality-club": CalendarRange,
  camp: CalendarClock,
  event: PartyPopper,
};

export default function ProductTypePickerPage() {
  return (
    <div className="container mx-auto px-4 py-12">
      <MockupRibbon />

      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Admin · new product
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            What are you creating?
          </h1>
          <p className="mt-3 text-muted-foreground sm:text-base">
            Pick the product type that best fits what you&apos;re setting up. You
            can still change most details later — this just changes what the
            form asks for next.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {PRODUCT_TYPES.map((type) => {
            const Icon = ICON_FOR_TYPE[type.slug];
            return (
              <Link
                key={type.slug}
                href={`/admin-mockup/products/new/${type.slug}`}
                className="group block"
              >
                <Card className="h-full transition-colors group-hover:border-primary group-hover:bg-primary/5">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <h2 className="font-semibold">{type.name}</h2>
                          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {type.tagline}
                        </p>
                        <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
                          {type.traits.map((trait) => (
                            <li key={trait} className="flex gap-2">
                              <span className="text-primary">·</span>
                              <span>{trait}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>

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
