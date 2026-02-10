"use client";

import Image from "next/image";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useActiveProducts } from "@/services/products";
import { formatCurrency } from "@/lib/utils";

export default function ProductsPage() {
  const { data: products, isLoading } = useActiveProducts();

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Our Products
        </h1>
        <p className="mt-4 text-muted-foreground">
          Explore our collection of educational gaming products designed for
          learning and fun.
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
              const metadata = product.metadata as Record<string, unknown>;
              const category = metadata?.category as string | undefined;

              return (
                <Card key={product.id} className="flex flex-col">
                  <div className="relative aspect-video overflow-hidden rounded-t-lg bg-muted">
                    {product.image_url ? (
                      <Image
                        src={product.image_url}
                        alt={product.name}
                        fill
                        unoptimized
                        priority={index === 0}
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-4xl">
                        🎮
                      </div>
                    )}
                    {category && (
                      <Badge className="absolute right-2 top-2 capitalize">
                        {category}
                      </Badge>
                    )}
                  </div>
                  <CardHeader className="flex-1">
                    <CardTitle>{product.name}</CardTitle>
                    <CardDescription className="line-clamp-2">
                      {product.description || "No description available"}
                    </CardDescription>
                  </CardHeader>
                  <CardFooter className="flex items-center justify-between">
                    <span className="text-xl font-bold text-primary">
                      {formatCurrency(product.price, product.currency)}
                    </span>
                    <Button>
                      <ShoppingCart className="mr-2 h-4 w-4" />
                      Add to Cart
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="mx-auto max-w-md">
            <CardContent className="flex flex-col items-center py-12 text-center">
              <div className="text-5xl">📦</div>
              <h3 className="mt-4 text-lg font-medium">No Products Available</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Check back soon for exciting educational gaming products!
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Info Section */}
      <div className="mx-auto mt-16 max-w-2xl text-center">
        <Card className="bg-muted/30">
          <CardContent className="py-8">
            <h3 className="text-lg font-semibold">Need Help Choosing?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Not sure which product is right for your family? Contact us for
              personalized recommendations based on your children&apos;s ages and
              interests.
            </p>
            <Link href="/about">
              <Button variant="outline" className="mt-4">
                Learn More About Us
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
