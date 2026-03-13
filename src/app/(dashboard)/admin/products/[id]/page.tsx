"use client";

import { use, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Pencil,
  Copy,
  Trash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PadletLink } from "@/components/ui/padlet-link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useProduct, useToggleProductVisibility, useDeleteProduct } from "@/services/products";
import { useProductGroups } from "@/services/groups";
import { GeduGroupsCard, VisibilityWarningBanner } from "@/components/admin/gedu-groups-card";
import { useCurrency } from "@/hooks/use-currency";
import { tokensToCurrencyDisplay } from "@/lib/constants/tokens";
import { formatScheduleLocal, formatDate } from "@/lib/utils";

export default function ManageProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: product, isLoading } = useProduct(id);
  const { data: groups = [] } = useProductGroups(id);
  const { currency, locale } = useCurrency();
  const toggleVisibility = useToggleProductVisibility();
  const deleteProduct = useDeleteProduct();
  const [isNavigating, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmVisibility, setConfirmVisibility] = useState(false);
  const [visibilityError, setVisibilityError] = useState("");

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="h-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-32 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="space-y-6">
        <Link
          href="/admin/products"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Products
        </Link>
        <p className="text-muted-foreground">Product not found.</p>
      </div>
    );
  }

  const schedule = formatScheduleLocal(
    product.day_of_week,
    product.start_time,
    product.timezone,
    locale,
  );
  const gameName = product.games?.name;
  const isVisible = product.is_visible ?? true;

  const handleToggleVisibility = () => {
    if (!isVisible && groups.length === 0) {
      setVisibilityError("Add at least one group before making this product visible.");
      setConfirmVisibility(false);
      return;
    }
    toggleVisibility.mutate({ id: product.id, isVisible: !isVisible });
    setConfirmVisibility(false);
  };

  const handleDelete = () => {
    deleteProduct.mutate(product.id, {
      onSuccess: () => startTransition(() => router.push("/admin/products")),
    });
    setConfirmDelete(false);
  };

  return (
    <div className="space-y-6">
      <Link
        href="/admin/products"
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Products
      </Link>

      <VisibilityWarningBanner isVisible={isVisible} groupCount={groups.length} />

      {/* Product Summary */}
      <Card>
        <CardContent className="flex items-start gap-6 pt-6">
          <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
            <Image
              src={product.image_url}
              alt={product.name}
              fill
              unoptimized
              className="object-cover"
            />
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{product.name}</h1>
              {!isVisible && (
                <Badge variant="outline" className="text-muted-foreground">
                  Hidden
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {product.description}
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {gameName && <span>{gameName}</span>}
              <span>
                Every {schedule.localDay} at {schedule.localTime}{" "}
                {schedule.tzAbbrev}
              </span>
              <span>{product.duration_minutes} min</span>
              <span>Ages {product.min_age}–{product.max_age}</span>
              <span className="font-semibold text-primary">{product.token_cost} Sorgs ({tokensToCurrencyDisplay(product.token_cost, currency, locale)})/session</span>
            </div>
            {product.padlet_url && (
              <PadletLink href={product.padlet_url} />
            )}
            <p className="text-xs text-muted-foreground">
              Created{" "}
              {product.created_at
                ? formatDate(product.created_at, locale)
                : "Unknown"}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {/* Fixed width prevents layout shift when label toggles between Hide/Show */}
          <Button
            variant="outline"
            className="w-[148px]"
            onClick={() => setConfirmVisibility(true)}
          >
            {isVisible ? (
              <EyeOff className="mr-2 h-4 w-4" />
            ) : (
              <Eye className="mr-2 h-4 w-4" />
            )}
            {isVisible ? "Hide Product" : "Show Product"}
          </Button>
          <Link href={`/admin/products/${product.id}/edit`}>
            <Button variant="outline">
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
          </Link>
          <Link href={`/admin/products/add?clone=${product.id}`}>
            <Button variant="outline">
              <Copy className="mr-2 h-4 w-4" />
              Clone
            </Button>
          </Link>
          <Button
            variant="destructive"
            onClick={() => setConfirmDelete(true)}
            disabled={deleteProduct.isPending || isNavigating}
          >
            <Trash className="mr-2 h-4 w-4" />
            {deleteProduct.isPending || isNavigating ? "Deleting..." : "Delete"}
          </Button>
        </CardContent>
      </Card>

      {/* Gedu Groups */}
      <GeduGroupsCard productId={id} />

      {/* Visibility Confirmation Dialog */}
      <Dialog open={confirmVisibility} onOpenChange={setConfirmVisibility}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isVisible ? "Hide Product" : "Show Product"}
            </DialogTitle>
            <DialogDescription>
              {isVisible
                ? `Are you sure you want to hide "${product.name}"? It will no longer be visible to customers.`
                : `Are you sure you want to show "${product.name}"? It will become visible to customers.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmVisibility(false)}>
              Cancel
            </Button>
            <Button onClick={handleToggleVisibility}>
              {isVisible ? "Hide" : "Show"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Visibility Error Dialog */}
      <Dialog open={!!visibilityError} onOpenChange={() => setVisibilityError("")}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cannot Show Product</DialogTitle>
            <DialogDescription>{visibilityError}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setVisibilityError("")}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Product</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{product.name}&rdquo;? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
