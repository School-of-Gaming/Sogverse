import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { NavChevron } from "@/components/ui/nav-chevron";
import { formatScheduleLocal } from "@/lib/utils";
import { ProductThumbnail } from "@/components/ui/product-thumbnail";
import type { ProductWithGame } from "@/services/products";

interface ProductRowProps {
  product: ProductWithGame;
  locale: string;
}

export function ProductRow({ product, locale }: ProductRowProps) {
  const t = useTranslations('admin.products');
  const c = useTranslations('common');
  const schedule = formatScheduleLocal(
    product.day_of_week,
    product.start_time,
    product.timezone,
    locale,
  );
  const gameName = product.games?.name;

  return (
    <div className="group flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-accent hover:text-accent-foreground">
      <div className="flex items-center gap-4">
        <ProductThumbnail
          imagePath={product.image_path}
          alt={product.name}
          size="h-16 w-16"
        />
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium">{product.name}</p>
            {!product.is_visible && (
              <Badge
                variant="outline"
                className="text-muted-foreground"
              >
                {t('hidden')}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground line-clamp-1">
            {product.description}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>
              {c('schedule', { day: schedule.localDay, time: schedule.localTime, tz: schedule.tzAbbrev })}
            </span>
            <span>{product.duration_minutes} {c('minutes')}</span>
            {gameName && <span>{gameName}</span>}
            <span>{c('ages', { min: product.min_age, max: product.max_age })}</span>
          </div>
        </div>
      </div>
      <NavChevron />
    </div>
  );
}
