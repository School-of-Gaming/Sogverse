import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { NavChevron } from "@/components/ui/nav-chevron";
import { formatScheduleLocal } from "@/lib/utils";
import type { ProductWithGame } from "@/services/products";
import type { SupportedCurrency } from "@/lib/constants/currency";

interface ProductRowProps {
  product: ProductWithGame;
  currency: SupportedCurrency;
  locale: string;
  tokensToCurrencyDisplay: (tokens: number, currency: SupportedCurrency, locale: string) => string;
}

export function ProductRow({ product, currency, locale, tokensToCurrencyDisplay }: ProductRowProps) {
  const schedule = formatScheduleLocal(
    product.day_of_week,
    product.start_time,
    product.timezone,
    locale,
  );
  const gameName = product.games?.name;

  return (
    <div className="group flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center">
          <Image
            src={product.image_url}
            alt={product.name}
            width={64}
            height={64}
            unoptimized
            className="h-auto w-auto max-h-full max-w-full rounded-md"
          />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium">{product.name}</p>
            {!product.is_visible && (
              <Badge
                variant="outline"
                className="text-muted-foreground"
              >
                Hidden
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground line-clamp-1">
            {product.description}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="font-semibold text-primary">
              {product.token_cost} Sorgs ({tokensToCurrencyDisplay(product.token_cost, currency, locale)})
            </span>
            <span>
              Every {schedule.localDay} at {schedule.localTime} {schedule.tzAbbrev}
            </span>
            <span>{product.duration_minutes} min</span>
            {gameName && <span>{gameName}</span>}
            <span>Ages {product.min_age}–{product.max_age}</span>
          </div>
        </div>
      </div>
      <NavChevron />
    </div>
  );
}
