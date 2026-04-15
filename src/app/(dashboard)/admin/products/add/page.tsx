"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ROUTES } from "@/lib/constants";
import { ArrowLeft, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCreateProduct, useProduct } from "@/services/products";
import { ProductForm, type ProductFormValues } from "@/components/admin/product-form";

export default function AddProductPage() {
  const t = useTranslations('admin.products');
  const router = useRouter();
  const searchParams = useSearchParams();
  const cloneId = searchParams.get("clone");
  const { data: cloneSource, isLoading: cloneLoading } = useProduct(cloneId ?? "");

  const createProduct = useCreateProduct();
  const [isNavigating, startTransition] = useTransition();

  const handleSubmit = async (values: ProductFormValues) => {
    const created = await createProduct.mutateAsync(values);
    startTransition(() => router.push(ROUTES.admin.product(created.id)));
  };

  if (cloneId && cloneLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded bg-muted animate-pulse" />
          <div className="space-y-2">
            <div className="h-6 w-48 rounded bg-muted animate-pulse" />
            <div className="h-4 w-64 rounded bg-muted animate-pulse" />
          </div>
        </div>
        <Card className="animate-pulse">
          <CardHeader>
            <div className="h-12 w-full rounded bg-muted" />
          </CardHeader>
          <div className="p-6 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-10 w-full rounded bg-muted" />
            ))}
          </div>
        </Card>
      </div>
    );
  }

  const initialValues = cloneSource
    ? {
        name: `${cloneSource.name} (Copy)`,
        description: cloneSource.description,
        token_cost: cloneSource.token_cost,
        image_path: cloneSource.image_path,
        padlet_url: cloneSource.padlet_url,
        game_id: cloneSource.game_id,
        day_of_week: cloneSource.day_of_week,
        start_time: cloneSource.start_time,
        duration_minutes: cloneSource.duration_minutes,
        min_age: cloneSource.min_age,
        max_age: cloneSource.max_age,
        is_remote: cloneSource.is_remote,
        location_id: cloneSource.location_id,
        spoken_language_code: cloneSource.spoken_language_code,
      }
    : undefined;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href={ROUTES.admin.products}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">
            {cloneSource ? t('cloneProduct') : t('addAProduct')}
          </h1>
          <p className="text-muted-foreground">
            {cloneSource
              ? t('cloningFrom', { name: cloneSource.name })
              : t('createNewProduct')}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
              <Package className="h-6 w-6 text-secondary-foreground" />
            </div>
            <div>
              <CardTitle>{t('newProduct')}</CardTitle>
              <CardDescription>
                {t('fillDetails')}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <ProductForm
          initialValues={initialValues}
          onSubmit={handleSubmit}
          isPending={createProduct.isPending || isNavigating}
          submitLabel={t('createProduct')}
          pendingLabel={t('creating')}
        />
      </Card>
    </div>
  );
}
