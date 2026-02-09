"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Package, Check } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCreateProduct } from "@/services/products";

const createProductSchema = z.object({
  name: z
    .string()
    .min(1, "Product name is required")
    .max(100, "Product name must be at most 100 characters"),
  description: z.string().optional(),
  price: z
    .number({ invalid_type_error: "Price must be a number" })
    .min(0, "Price must be 0 or greater"),
  imageUrl: z
    .string()
    .url("Must be a valid URL")
    .optional()
    .or(z.literal("")),
  category: z.string().optional(),
});

export default function AddProductPage() {
  const createProduct = useCreateProduct();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const validatedData = createProductSchema.parse({
        name,
        description: description || undefined,
        price: price === "" ? undefined : Number(price),
        imageUrl: imageUrl || undefined,
        category: category || undefined,
      });

      await createProduct.mutateAsync({
        name: validatedData.name,
        description: validatedData.description ?? null,
        price: validatedData.price,
        image_url: validatedData.imageUrl || null,
        metadata: validatedData.category ? { category: validatedData.category } : {},
      });

      setSuccess(true);
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.errors[0].message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else if (typeof err === "object" && err !== null && "message" in err) {
        setError((err as { message: string }).message);
      } else {
        setError("An unexpected error occurred");
      }
    }
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
              <strong>{name}</strong> has been added to your product catalog.
            </p>
            <div className="mt-6 flex gap-4">
              <Link href="/admin/products">
                <Button variant="outline">View All Products</Button>
              </Link>
              <Button onClick={() => {
                setSuccess(false);
                setName("");
                setDescription("");
                setPrice("");
                setImageUrl("");
                setCategory("");
              }}>
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
            Create a new product in your catalog
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
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Product name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={createProduct.isPending}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <textarea
                id="description"
                placeholder="Describe your product"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={createProduct.isPending}
                rows={3}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="price">Price</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                disabled={createProduct.isPending}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="imageUrl">Image URL (Optional)</Label>
              <Input
                id="imageUrl"
                type="url"
                placeholder="https://example.com/image.png"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                disabled={createProduct.isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category (Optional)</Label>
              <Input
                id="category"
                type="text"
                placeholder="e.g. Games, Accessories"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={createProduct.isPending}
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={createProduct.isPending}
            >
              {createProduct.isPending ? "Creating..." : "Create Product"}
            </Button>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}
