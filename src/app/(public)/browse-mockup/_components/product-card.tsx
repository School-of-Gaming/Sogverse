"use client";

import Link from "next/link";
import { ArrowRight, Clock, Globe, ImageIcon, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  LANGUAGE_NAMES,
  getLocationLabel,
  getProductState,
  getProductTypeDef,
  priceLabel,
  productDetailPath,
  type Product,
} from "../_mock/data";
import { useNow } from "../_mock/use-now";
import { TYPE_ICON } from "./type-icon";

export function ProductCard({ product }: { product: Product }) {
  const now = useNow();
  const typeDef = getProductTypeDef(product.type);
  const Icon = TYPE_ICON[product.type];

  const state = getProductState(product, now ?? 0);

  return (
    <Link
      href={productDetailPath(product)}
      className="group block h-full"
    >
      <Card className="flex h-full flex-col overflow-hidden transition-colors group-hover:bg-accent group-hover:text-accent-foreground">
        <ImagePlaceholder product={product} />
        <CardContent className="flex h-full flex-col p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {typeDef.name}
              </p>
              <h3 className="mt-0.5 truncate font-semibold">{product.name}</h3>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </div>

          <p className="mt-3 text-sm text-muted-foreground line-clamp-2">
            {product.tagline}
          </p>

          <dl className="mt-4 space-y-1.5 text-xs text-muted-foreground">
            <Row icon={Clock}>
              {product.scheduleSummary}
              {product.dateRange ? <span> · {product.dateRange}</span> : null}
            </Row>
            <Row icon={product.isOnline ? Globe : MapPin}>
              {getLocationLabel(product)}
            </Row>
            <Row label="Ages">
              {product.minAge}–{product.maxAge}
            </Row>
            <Row label="Language">
              {product.languages.map((l) => LANGUAGE_NAMES[l]).join(" · ")}
            </Row>
          </dl>

          <div className="mt-auto flex items-end justify-between gap-3 pt-5">
            <p className="text-sm font-medium">{priceLabel(product.price)}</p>
            <SeatBadge
              product={product}
              state={state}
              nowAvailable={now !== null}
            />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function ImagePlaceholder({ product }: { product: Product }) {
  const Icon = TYPE_ICON[product.type];
  return (
    <div
      className={cn(
        "relative flex aspect-[16/9] w-full items-center justify-center overflow-hidden border-b border-border bg-gradient-to-br",
        product.type === "consumer-club" && "from-primary/10 to-primary/5",
        product.type === "municipality-club" && "from-secondary/15 to-secondary/5",
        product.type === "camp" && "from-primary/10 via-secondary/10 to-secondary/5",
        product.type === "event" && "from-muted to-muted/40",
      )}
      aria-hidden
    >
      <Icon className="h-10 w-10 text-muted-foreground" />
      <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground backdrop-blur-sm">
        <ImageIcon className="h-3 w-3" />
        Photo
      </span>
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  children,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
      {label && (
        <span className="shrink-0 font-medium text-foreground/70">
          {label}:
        </span>
      )}
      <span className="truncate">{children}</span>
    </div>
  );
}

function SeatBadge({
  product,
  state,
  nowAvailable,
}: {
  product: Product;
  state: ReturnType<typeof getProductState>;
  nowAvailable: boolean;
}) {
  // Keep the badge layout stable before the clock hydrates — a blank
  // placeholder with the same height avoids shifting the card body.
  if (!nowAvailable) {
    return <SeatPill variant="neutral">&nbsp;</SeatPill>;
  }

  // Threshold-pending products get their own label — the seat count isn't
  // the interesting number yet, the threshold progress is.
  if (product.status === "pending" && product.signupThreshold) {
    return (
      <SeatPill variant="threshold">
        {product.seatsTaken} of {product.signupThreshold} signed up
      </SeatPill>
    );
  }

  if (state.registration === "not_open" && state.opensAt) {
    return <SeatPill variant="pending">Opens soon</SeatPill>;
  }

  if (state.registration === "full") {
    return (
      <SeatPill variant="full">
        Full{product.waitlistCount > 0 ? ` · ${product.waitlistCount} waiting` : ""}
      </SeatPill>
    );
  }

  if (state.seatsRemaining === null) {
    return <SeatPill variant="open">All welcome</SeatPill>;
  }

  if (state.registration === "almost_full") {
    return (
      <SeatPill variant="warning">
        {state.seatsRemaining} {state.seatsRemaining === 1 ? "seat" : "seats"}{" "}
        left
      </SeatPill>
    );
  }

  return (
    <SeatPill variant="open">
      {state.seatsRemaining} {state.seatsRemaining === 1 ? "seat" : "seats"}{" "}
      open
    </SeatPill>
  );
}

function SeatPill({
  variant,
  children,
}: {
  variant: "open" | "warning" | "full" | "pending" | "threshold" | "neutral";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium",
        variant === "open" && "bg-primary/10 text-primary",
        variant === "warning" && "bg-destructive/10 text-destructive",
        variant === "full" && "bg-muted text-muted-foreground",
        variant === "pending" && "bg-secondary/15 text-secondary",
        variant === "threshold" && "bg-secondary/15 text-secondary",
        variant === "neutral" && "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}
