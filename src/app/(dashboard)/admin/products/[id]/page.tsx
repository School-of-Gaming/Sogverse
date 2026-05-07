"use client";

import { use, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { ROUTES } from "@/lib/constants";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Pencil,
  Copy,
  Trash,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { useTokenRates } from "@/providers/token-rate-provider";
import { formatScheduleLocal, formatDate } from "@/lib/utils";
import { ProductThumbnail } from "@/components/ui/product-thumbnail";

export default function ManageProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('admin.products');
  const c = useTranslations('common');
  const router = useRouter();
  const { data: product, isLoading } = useProduct(id);
  const { data: groups = [] } = useProductGroups(id);
  const { currency } = useCurrency();
  const locale = useLocale();
  const { tokensToCurrencyDisplay } = useTokenRates();
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
          href={ROUTES.admin.products}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {t('backToProducts')}
        </Link>
        <p className="text-muted-foreground">{t('productNotFound')}</p>
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
      setVisibilityError(t('addGroupBeforeVisible'));
      setConfirmVisibility(false);
      return;
    }
    toggleVisibility.mutate({ id: product.id, isVisible: !isVisible });
    setConfirmVisibility(false);
  };

  const handleDelete = () => {
    deleteProduct.mutate(product.id, {
      onSuccess: () => startTransition(() => router.push(ROUTES.admin.products)),
    });
    setConfirmDelete(false);
  };

  return (
    <div className="space-y-6">
      <Link
        href={ROUTES.admin.products}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t('backToProducts')}
      </Link>

      <VisibilityWarningBanner isVisible={isVisible} groupCount={groups.length} />

      {/* Product Summary */}
      <Card>
        <CardContent className="flex items-center gap-6 pt-6">
          <ProductThumbnail
            imagePath={product.image_path}
            alt={product.name}
            size="h-24 w-24"
          />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{product.name}</h1>
              {!isVisible && (
                <Badge variant="outline" className="text-muted-foreground">
                  {t('hidden')}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {product.description}
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {gameName && <span>{gameName}</span>}
              <span>
                {c('schedule', { day: schedule.localDay, time: schedule.localTime, tz: schedule.tzAbbrev })}
              </span>
              <span>{product.duration_minutes} {c('minutes')}</span>
              <span>{c('ages', { min: product.min_age, max: product.max_age })}</span>
              <span className="font-semibold text-primary">{product.token_cost} {c('sorgs')} ({tokensToCurrencyDisplay(product.token_cost, currency, locale)})/{c('perSession')}</span>
            </div>
            {product.padlet_url && (
              <PadletLink href={product.padlet_url} />
            )}
            <p className="text-xs text-muted-foreground">
              {t('created')}{" "}
              {product.created_at
                ? formatDate(product.created_at, locale)
                : t('unknown')}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle>{t('actions')}</CardTitle>
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
            {isVisible ? t('hideProduct') : t('showProduct')}
          </Button>
          <Link
            href={ROUTES.admin.productEdit(product.id)}
            className={buttonVariants({ variant: "outline" })}
          >
            <Pencil className="mr-2 h-4 w-4" />
            {c('edit')}
          </Link>
          <Link
            href={ROUTES.admin.productClone(product.id)}
            className={buttonVariants({ variant: "outline" })}
          >
            <Copy className="mr-2 h-4 w-4" />
            {t('clone')}
          </Link>
          <Button
            variant="destructive"
            onClick={() => setConfirmDelete(true)}
            disabled={deleteProduct.isPending || isNavigating}
          >
            <Trash className="mr-2 h-4 w-4" />
            {deleteProduct.isPending || isNavigating ? t('deleting') : c('delete')}
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
              {isVisible ? t('hideProduct') : t('showProduct')}
            </DialogTitle>
            <DialogDescription>
              {isVisible
                ? t('hideConfirm', { name: product.name })
                : t('showConfirm', { name: product.name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmVisibility(false)}>
              {c('cancel')}
            </Button>
            <Button onClick={handleToggleVisibility}>
              {isVisible ? t('hide') : t('show')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Visibility Error Dialog */}
      <Dialog open={!!visibilityError} onOpenChange={() => setVisibilityError("")}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('cannotShowProduct')}</DialogTitle>
            <DialogDescription>{visibilityError}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setVisibilityError("")}>{t('ok')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('deleteProduct')}</DialogTitle>
            <DialogDescription>
              {t('deleteConfirm', { name: product.name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              {c('cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              {c('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
