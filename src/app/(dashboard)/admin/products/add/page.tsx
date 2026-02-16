"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Package, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCreateProduct, useProduct } from "@/services/products";
import { ProductForm, type ProductFormValues } from "@/components/admin/product-form";

export default function AddProductPage() {
  const searchParams = useSearchParams();
  const cloneId = searchParams.get("clone");
  const { data: cloneSource, isLoading: cloneLoading } = useProduct(cloneId ?? "");

  const createProduct = useCreateProduct();
  const [success, setSuccess] = useState(false);
  const [createdName, setCreatedName] = useState("");

  const handleSubmit = async (values: ProductFormValues) => {
    await createProduct.mutateAsync(values);
    setCreatedName(values.name);
    setSuccess(true);
  };

  if (success) {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
              <Check className="h-8 w-8 text-success" />
            </div>
            <h3 className="mt-4 text-lg font-medium">Product Created!</h3>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              <strong>{createdName}</strong> has been added to your product catalog.
            </p>
            <div className="mt-6 flex gap-4">
              <Link href="/admin/products">
                <Button variant="outline">View All Products</Button>
              </Link>
              <Button onClick={() => setSuccess(false)}>
                Add Another Product
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

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
        price: cloneSource.price,
        image_url: cloneSource.image_url,
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
          isPending={createProduct.isPending}
          submitLabel="Create Product"
          pendingLabel="Creating..."
        />
      </Card>
    </div>
  );
}
