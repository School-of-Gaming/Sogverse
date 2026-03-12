"use client";

import { use, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useProduct, useUpdateProduct } from "@/services/products";
import { ProductForm, type ProductFormValues } from "@/components/admin/product-form";

export default function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: product, isLoading } = useProduct(id);
  const updateProduct = useUpdateProduct();
  const [isNavigating, startTransition] = useTransition();

  const handleSubmit = async (values: ProductFormValues) => {
    await updateProduct.mutateAsync({ id, updates: values });
    startTransition(() => router.push(`/admin/products/${id}`));
  };

  if (isLoading) {
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

  if (!product) {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <div className="flex items-center gap-4">
          <Link href={`/admin/products/${id}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Product Not Found</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/admin/products/${id}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Edit Product</h1>
          <p className="text-muted-foreground">
            Update the details for this product
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
              <CardTitle>{product.name}</CardTitle>
              <CardDescription>
                Edit the product details below
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <ProductForm
          initialValues={{
            name: product.name,
            description: product.description,
            token_cost: product.token_cost,
            image_url: product.image_url,
            padlet_url: product.padlet_url,
            game_id: product.game_id,
            day_of_week: product.day_of_week,
            start_time: product.start_time,
            duration_minutes: product.duration_minutes,
            min_age: product.min_age,
            max_age: product.max_age,
          }}
          onSubmit={handleSubmit}
          isPending={updateProduct.isPending || isNavigating}
          submitLabel="Save Changes"
          pendingLabel="Saving..."
        />
      </Card>
    </div>
  );
}
