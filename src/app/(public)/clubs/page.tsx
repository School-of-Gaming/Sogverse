"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from 'next-intl';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useVisibleProducts } from "@/services/products";
import { useCurrency } from "@/hooks/use-currency";
import { useTokenRates } from "@/providers/token-rate-provider";
import { formatScheduleLocal } from "@/lib/utils";

export default function ProductsPage() {
  const { data: products, isLoading } = useVisibleProducts();
  const { currency, locale } = useCurrency();
  const { tokensToCurrencyDisplay } = useTokenRates();
  const t = useTranslations('clubs');
  const c = useTranslations('common');

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {t('listing.heading')}
        </h1>
        <p className="mt-4 text-muted-foreground">
          {t('listing.subheading')}
        </p>
      </div>

      <div className="mx-auto mt-12 max-w-6xl">
        {isLoading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="animate-pulse">
                <div className="aspect-video bg-muted" />
                <CardHeader>
                  <div className="h-5 w-3/4 rounded bg-muted" />
                  <div className="h-4 w-full rounded bg-muted" />
                </CardHeader>
                <CardFooter>
                  <div className="h-10 w-full rounded bg-muted" />
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : products && products.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product, index) => {
              const schedule = formatScheduleLocal(
                product.day_of_week,
                product.start_time,
                product.timezone,
                locale,
              );
              const gameName = product.games?.name;

              return (
                <Card key={product.id} className="flex flex-col">
                  <div className="relative aspect-video overflow-hidden rounded-t-lg bg-muted">
                    <Image
                      src={product.image_url}
                      alt={product.name}
                      fill
                      unoptimized
                      priority={index === 0}
                      className="object-cover"
                    />
                    {gameName && (
                      <Badge className="absolute right-2 top-2">
                        {gameName}
                      </Badge>
                    )}
                  </div>
                  <CardHeader className="flex-1">
                    <CardTitle>{product.name}</CardTitle>
                    <CardDescription className="line-clamp-2">
                      {product.description}
                    </CardDescription>
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      <p>
                        {c('schedule', { day: schedule.localDay, time: schedule.localTime, tz: schedule.tzAbbrev })}
                      </p>
                      <p>{c('duration', { minutes: product.duration_minutes })}</p>
                      <p>{c('ages', { min: product.min_age, max: product.max_age })}</p>
                    </div>
                  </CardHeader>
                  <CardFooter className="flex items-center justify-between">
                    <div>
                      <span className="text-xl font-bold text-primary">{t('tokenCost', { cost: product.token_cost })}</span>
                      {/* eslint-disable-next-line i18next/no-literal-string -- approx symbol */}
                      <p className="text-xs text-muted-foreground">
                        ≈ {tokensToCurrencyDisplay(product.token_cost, currency, locale)} {c('perSession')}
                      </p>
                    </div>
                    <Link href={`/clubs/${product.id}`}>
                      <Button>{c('viewDetails')}</Button>
                    </Link>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="mx-auto max-w-md">
            <CardContent className="flex flex-col items-center py-12 text-center">
              <h3 className="mt-4 text-lg font-medium">{t('listing.noClubs')}</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {t('listing.checkBackSoon')}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Info Section */}
      <div className="mx-auto mt-16 max-w-2xl text-center">
        <Card className="bg-muted/30">
          <CardContent className="py-8">
            <h3 className="text-lg font-semibold">{t('listing.needHelp')}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('listing.needHelpDescription')}
            </p>
            <Link href="/about">
              <Button variant="outline" className="mt-4">
                {t('listing.learnMoreAboutUs')}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
