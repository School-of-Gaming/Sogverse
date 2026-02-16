"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Package, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCreateProduct } from "@/services/products";
import { ProductForm, type ProductFormValues } from "@/components/admin/product-form";

export default function AddProductPage() {
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

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/products">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Add a Product</h1>
          <p className="text-muted-foreground">
            Create a new recurring event product
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
          onSubmit={handleSubmit}
          isPending={createProduct.isPending}
          submitLabel="Create Product"
          pendingLabel="Creating..."
        />
      </Card>
    </div>
  );
}
