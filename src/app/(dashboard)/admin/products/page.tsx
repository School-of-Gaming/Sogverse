"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Plus, Search, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAllProducts } from "@/services/products";
import { formatScheduleLocal } from "@/lib/utils";

export default function AdminProductsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const { data: products, isLoading } = useAllProducts();

  const filteredProducts = products?.filter(
    (product) =>
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
              {filteredProducts.map((product) => {
                const schedule = formatScheduleLocal(
                  product.day_of_week,
                  product.start_time,
                  product.timezone,
                );
                const gameName = product.games?.name;

                return (
                  <Link
                    key={product.id}
                    href={`/admin/products/${product.id}`}
                    className="group flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <div className="flex items-center gap-4">
                      <div className="relative flex h-16 w-16 items-center justify-center rounded-lg bg-muted">
                        <Image
                          src={product.image_url}
                          alt={product.name}
                          fill
                          unoptimized
                          className="rounded-lg object-cover"
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{product.name}</p>
                          {!product.is_visible && (
                            <Badge variant="outline" className="text-muted-foreground group-hover:text-accent-foreground/70">
                              Hidden
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground group-hover:text-accent-foreground/70 line-clamp-1">
                          {product.description}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground group-hover:text-accent-foreground/70">
                          <span className="font-semibold text-primary group-hover:text-secondary">XX Sorgs</span>
                          <span>
                            Every {schedule.localDay} at {schedule.localTime} {schedule.tzAbbrev}
                          </span>
                          <span>{product.duration_minutes} min</span>
                          {gameName && <span>{gameName}</span>}
                          <span>Ages {product.min_age}–{product.max_age}</span>
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-accent-foreground" />
                  </Link>
                );
              })}
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
