"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Plus, Search, Pencil, Trash, Eye, EyeOff, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAllProducts, useToggleProductStatus, useDeleteProduct } from "@/services/products";
import { formatScheduleLocal } from "@/lib/utils";

type ConfirmAction =
  | { type: "toggle"; id: string; name: string; currentStatus: boolean }
  | { type: "delete"; id: string; name: string };

export default function AdminProductsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const { data: products, isLoading } = useAllProducts();
  const toggleStatus = useToggleProductStatus();
  const deleteProduct = useDeleteProduct();

  const filteredProducts = products?.filter(
    (product) =>
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleConfirm = () => {
    if (!confirmAction) return;
    if (confirmAction.type === "toggle") {
      toggleStatus.mutate({ id: confirmAction.id, isActive: !confirmAction.currentStatus });
    } else {
      deleteProduct.mutate(confirmAction.id);
    }
    setConfirmAction(null);
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
              {filteredProducts.map((product) => {
                const schedule = formatScheduleLocal(
                  product.day_of_week,
                  product.start_time,
                  product.timezone,
                );
                const gameName = product.games?.name;

                return (
                  <div
                    key={product.id}
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
                          {!product.is_active && (
                            <Badge variant="outline" className="text-muted-foreground group-hover:text-accent-foreground/70">
                              Inactive
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
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="group-hover:bg-secondary group-hover:text-secondary-foreground hover:!bg-secondary/80 hover:!text-secondary-foreground"
                        onClick={() => setConfirmAction({
                          type: "toggle",
                          id: product.id,
                          name: product.name,
                          currentStatus: product.is_active ?? true,
                        })}
                        title={product.is_active ? "Deactivate" : "Activate"}
                      >
                        {product.is_active ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                      <Link href={`/admin/products/${product.id}/edit`}>
                        <Button variant="ghost" size="icon" className="group-hover:bg-secondary group-hover:text-secondary-foreground hover:!bg-secondary/80 hover:!text-secondary-foreground" title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Link href={`/admin/products/add?clone=${product.id}`}>
                        <Button variant="ghost" size="icon" className="group-hover:bg-secondary group-hover:text-secondary-foreground hover:!bg-secondary/80 hover:!text-secondary-foreground" title="Clone">
                          <Copy className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive group-hover:bg-destructive group-hover:text-destructive-foreground hover:!bg-destructive/80 hover:!text-destructive-foreground"
                        onClick={() => setConfirmAction({
                          type: "delete",
                          id: product.id,
                          name: product.name,
                        })}
                        title="Delete"
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
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

      <Dialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmAction?.type === "delete"
                ? "Delete Product"
                : confirmAction?.type === "toggle" && confirmAction.currentStatus
                  ? "Deactivate Product"
                  : "Activate Product"}
            </DialogTitle>
            <DialogDescription>
              {confirmAction?.type === "delete"
                ? `Are you sure you want to delete "${confirmAction.name}"? This action cannot be undone.`
                : confirmAction?.type === "toggle" && confirmAction.currentStatus
                  ? `Are you sure you want to deactivate "${confirmAction.name}"? It will no longer be visible to customers.`
                  : `Are you sure you want to activate "${confirmAction?.name}"? It will become visible to customers.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAction(null)}>
              Cancel
            </Button>
            <Button
              variant={confirmAction?.type === "delete" ? "destructive" : "default"}
              onClick={handleConfirm}
            >
              {confirmAction?.type === "delete"
                ? "Delete"
                : confirmAction?.type === "toggle" && confirmAction.currentStatus
                  ? "Deactivate"
                  : "Activate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
