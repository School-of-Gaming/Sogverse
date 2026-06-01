"use client";

import { useTranslations } from "next-intl";
import { CalendarClock, CalendarRange, PartyPopper, Repeat } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PRODUCT_TYPE_CONFIG } from "./product-type-config";
import type { ProductType } from "@/types";

// Trait keys are "1".."4" — declared as a literal tuple so next-intl's typed
// message lookup recognises them as valid namespaced keys.
const TRAIT_KEYS = ["1", "2", "3", "4"] as const;

const ICON_FOR_TYPE: Record<
  ProductType,
  React.ComponentType<{ className?: string }>
> = {
  consumer_club: Repeat,
  municipality_club: CalendarRange,
  camp: CalendarClock,
  event: PartyPopper,
};

interface ProductTypeInfoCardProps {
  productType: ProductType;
}

export function ProductTypeInfoCard({ productType }: ProductTypeInfoCardProps) {
  const config = PRODUCT_TYPE_CONFIG[productType];
  const t = useTranslations("admin.products");
  const Icon = ICON_FOR_TYPE[productType];

  const label = t(`types.${config.i18nKey}.label`);
  const tagline = t(`types.${config.i18nKey}.tagline`);
  const blurb = t(`types.${config.i18nKey}.blurb`);
  const traits = TRAIT_KEYS.map((key) =>
    t(`types.${config.i18nKey}.traits.${key}`)
  );

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">{label}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{tagline}</p>
            <p className="mt-3 text-sm">{blurb}</p>
            <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
              {traits.map((trait, i) => (
                <li key={i} className="flex gap-2">
                  {/* eslint-disable-next-line i18next/no-literal-string -- decorative bullet, not user copy */}
                  <span className="text-primary">·</span>
                  <span>{trait}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
