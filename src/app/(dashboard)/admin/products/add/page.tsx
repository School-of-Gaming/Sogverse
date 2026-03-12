"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCreateProduct, useProduct } from "@/services/products";
import { ProductForm, type ProductFormValues } from "@/components/admin/product-form";

export default function AddProductPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cloneId = searchParams.get("clone");
  const { data: cloneSource, isLoading: cloneLoading } = useProduct(cloneId ?? "");

  const createProduct = useCreateProduct();
  const [isNavigating, startTransition] = useTransition();

  const handleSubmit = async (values: ProductFormValues) => {
    const created = await createProduct.mutateAsync(values);
    startTransition(() => router.push(`/admin/products/${created.id}`));
  };

  if (cloneId && cloneLoading) {
    return (
      <div className="mx-auto max-w-lg space-y-6">
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
        image_url: cloneSource.image_url,
        padlet_url: cloneSource.padlet_url,
        game_id: cloneSource.game_id,
        day_of_week: cloneSource.day_of_week,
        start_time: cloneSource.start_time,
        duration_minutes: cloneSource.duration_minutes,
        min_age: cloneSource.min_age,
        max_age: cloneSource.max_age,
      }
    : undefined;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/products">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">
            {cloneSource ? "Clone Product" : "Add a Product"}
          </h1>
          <p className="text-muted-foreground">
            {cloneSource
              ? `Cloning from "${cloneSource.name}"`
              : "Create a new recurring event product"}
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
              <CardTitle>New Product</CardTitle>
              <CardDescription>
                Fill in the details for your new product
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <ProductForm
          initialValues={initialValues}
          onSubmit={handleSubmit}
          isPending={createProduct.isPending || isNavigating}
          submitLabel="Create Product"
          pendingLabel="Creating..."
        />
      </Card>
    </div>
  );
}
