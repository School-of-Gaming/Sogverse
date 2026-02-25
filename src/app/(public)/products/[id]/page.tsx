"use client";

import { useParams, usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Calendar, Clock, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useProduct } from "@/services/products";
import { useCurrency } from "@/hooks/use-currency";
import { tokensToCurrencyDisplay } from "@/lib/constants/tokens";
import { formatScheduleLocal } from "@/lib/utils";
import { useAuth } from "@/providers";
import { EnrollmentWizard } from "@/components/enrollment";
import { ROUTES } from "@/lib/constants";

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { data: product, isLoading } = useProduct(id);
  const { currency } = useCurrency();
  const { user, profile } = useAuth();
  const pathname = usePathname();
  const redirectParam = `?redirect=${encodeURIComponent(pathname)}`;

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="h-8 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-6 grid gap-8 lg:grid-cols-2">
          <div>
            <div className="aspect-video animate-pulse rounded-lg bg-muted" />
            <div className="mt-6 h-8 w-3/4 animate-pulse rounded bg-muted" />
            <div className="mt-2 h-4 w-full animate-pulse rounded bg-muted" />
            <div className="mt-6 h-24 animate-pulse rounded-lg bg-muted" />
          </div>
          <div className="h-64 animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="container mx-auto px-4 py-12">
        <Link href={ROUTES.products}>
          <Button variant="ghost" className="mb-6">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Products
          </Button>
        </Link>
        <Card className="mx-auto max-w-md">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <h3 className="text-lg font-medium">Product Not Found</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              This product may no longer be available.
            </p>
            <Link href={ROUTES.products} className="mt-4">
              <Button>Browse Products</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const schedule = formatScheduleLocal(
    product.day_of_week,
    product.start_time,
    product.timezone,
  );
  const isCustomer = profile?.role === "customer";

  return (
    <div className="container mx-auto px-4 py-12">
      <Link href={ROUTES.products}>
        <Button variant="ghost" className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Products
        </Button>
      </Link>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Left: Product info */}
        <div>
          <div className="relative aspect-video overflow-hidden rounded-lg bg-muted">
            <Image
              src={product.image_url}
              alt={product.name}
              fill
              unoptimized
              priority
              className="object-cover"
            />
            {product.games?.name && (
              <Badge className="absolute right-2 top-2">
                {product.games.name}
              </Badge>
            )}
          </div>

          <h1 className="mt-6 text-3xl font-bold">{product.name}</h1>
          <p className="mt-2 text-muted-foreground">{product.description}</p>

          {/* Schedule details */}
          <Card className="mt-6">
            <CardContent className="grid grid-cols-2 gap-4 py-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Every {schedule.localDay}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  {schedule.localTime} {schedule.tzAbbrev}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  {product.duration_minutes} minutes
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  Ages {product.min_age}–{product.max_age}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Token cost */}
          <div className="mt-4">
            <span className="text-2xl font-bold text-primary">
              {product.token_cost} Sorgs
            </span>
            <span className="text-sm text-muted-foreground"> per session</span>
            <p className="text-xs text-muted-foreground">
              ≈ {tokensToCurrencyDisplay(product.token_cost, currency)}
            </p>
          </div>
        </div>

        {/* Right: Enrollment */}
        <div>
          {isCustomer && user ? (
            <EnrollmentWizard product={product} />
          ) : user ? (
            <Card>
              <CardHeader>
                <CardTitle>Enrollment</CardTitle>
              </CardHeader>
              <CardContent className="text-center">
                <p className="text-sm text-muted-foreground">
                  Only customer accounts can enroll gamers in products.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Ready to Enroll?</CardTitle>
                <CardDescription>
                  Log in or create an account to enroll your child in this
                  product.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-3">
                <Link href={`${ROUTES.login}${redirectParam}`} className="w-full">
                  <Button className="w-full">Log In to Enroll</Button>
                </Link>
                <Link href={`${ROUTES.register}${redirectParam}`} className="w-full">
                  <Button variant="outline" className="w-full">
                    Create Account
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
