"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { ROUTES } from "@/lib/constants";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useAllProducts } from "@/services/products";
import { useCurrency } from "@/hooks/use-currency";
import { useTokenRates } from "@/providers/token-rate-provider";
import { ProductRow } from "@/components/admin/product-row";

export default function AdminProductsPage() {
  const t = useTranslations('admin.products');
  const [searchQuery, setSearchQuery] = useState("");
  const { data: products, isLoading } = useAllProducts();
  const { currency } = useCurrency();
  const locale = useLocale();
  const { tokensToCurrencyDisplay } = useTokenRates();

  const filteredProducts = products?.filter(
    (product) =>
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground">
            {t('manageCatalog')}
          </p>
        </div>
        <Link href={ROUTES.admin.productsAdd} className={buttonVariants()}>
          <Plus className="mr-2 h-4 w-4" />
          {t('addProduct')}
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t('searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 rounded-lg border p-4 animate-pulse"
                >
                  <div className="h-16 w-16 rounded bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 rounded bg-muted" />
                    <div className="h-3 w-48 rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredProducts && filteredProducts.length > 0 ? (
            <div className="grid gap-3">
              {filteredProducts.map((product) => (
                <Link
                  key={product.id}
                  href={ROUTES.admin.product(product.id)}
                >
                  <ProductRow product={product} currency={currency} locale={locale} tokensToCurrencyDisplay={tokensToCurrencyDisplay} />
                </Link>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              {searchQuery
                ? t('noSearchResults')
                : t('noProducts')}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
