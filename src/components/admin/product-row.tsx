import Image from "next/image";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatScheduleLocal } from "@/lib/utils";
import { tokensToCurrencyDisplay } from "@/lib/constants/tokens";
import type { ProductWithGame } from "@/services/products";
import type { SupportedCurrency } from "@/lib/constants/currency";

interface ProductRowProps {
  product: ProductWithGame;
  currency: SupportedCurrency;
}

export function ProductRow({ product, currency }: ProductRowProps) {
  const schedule = formatScheduleLocal(
    product.day_of_week,
    product.start_time,
    product.timezone,
  );
  const gameName = product.games?.name;

  return (
    <div className="group flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-accent hover:text-accent-foreground">
      <div className="flex items-center gap-4">
        <div className="relative flex h-16 w-16 items-center justify-center rounded-lg bg-muted">
          <Image
            src={product.image_url}
            alt={product.name}
            fill
            unoptimized
            className="rounded-lg object-cover"
          />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium">{product.name}</p>
            {!product.is_visible && (
              <Badge
                variant="outline"
                className="text-muted-foreground group-hover:text-accent-foreground/70"
              >
                Hidden
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground group-hover:text-accent-foreground/70 line-clamp-1">
            {product.description}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground group-hover:text-accent-foreground/70">
            <span className="font-semibold text-primary group-hover:text-secondary">
              {product.token_cost} Sorgs ({tokensToCurrencyDisplay(product.token_cost, currency)})
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
      <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-accent-foreground" />
    </div>
  );
}
