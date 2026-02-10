"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Plus, Search, Pencil, Trash, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAllProducts, useToggleProductStatus, useDeleteProduct } from "@/services/products";
import { formatCurrency } from "@/lib/utils";

export default function AdminProductsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const { data: products, isLoading } = useAllProducts();
  const toggleStatus = useToggleProductStatus();
  const deleteProduct = useDeleteProduct();

  const filteredProducts = products?.filter(
    (product) =>
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleToggleStatus = (id: string, currentStatus: boolean) => {
    toggleStatus.mutate({ id, isActive: !currentStatus });
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this product?")) {
      deleteProduct.mutate(id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Products</h1>
          <p className="text-muted-foreground">
            Manage your product catalog
          </p>
        </div>
        <Link href="/admin/products/add">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Product
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search products..."
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
            <div className="space-y-4">
              {filteredProducts.map((product) => (
                <div
                  key={product.id}
                  className="group flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <div className="flex items-center gap-4">
                    <div className="relative flex h-16 w-16 items-center justify-center rounded-lg bg-muted">
                      {product.image_url ? (
                        <Image
                          src={product.image_url}
                          alt={product.name}
                          fill
                          unoptimized
                          className="rounded-lg object-cover"
                        />
                      ) : (
                        <span className="text-2xl">📦</span>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{product.name}</p>
                        {!product.is_active && (
                          <Badge variant="outline" className="text-muted-foreground group-hover:text-accent-foreground/70">
                            Inactive
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground group-hover:text-accent-foreground/70 line-clamp-1">
                        {product.description || "No description"}
                      </p>
                      <p className="text-sm font-semibold text-primary group-hover:text-secondary">
                        {formatCurrency(product.price, product.currency)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="group-hover:bg-secondary group-hover:text-secondary-foreground hover:!bg-secondary/80 hover:!text-secondary-foreground"
                      onClick={() => handleToggleStatus(product.id, product.is_active)}
                      title={product.is_active ? "Deactivate" : "Activate"}
                    >
                      {product.is_active ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                    <Button variant="ghost" size="icon" className="group-hover:bg-secondary group-hover:text-secondary-foreground hover:!bg-secondary/80 hover:!text-secondary-foreground" title="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive group-hover:bg-destructive group-hover:text-destructive-foreground hover:!bg-destructive/80 hover:!text-destructive-foreground"
                      onClick={() => handleDelete(product.id)}
                      title="Delete"
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              {searchQuery
                ? "No products found matching your search."
                : "No products found. Add your first product to get started."}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
