"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import {
  ArrowLeft,
  CalendarClock,
  Clock,
  Globe,
  MapPin,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  LANGUAGE_NAMES,
  getProductBySlug,
  getProductState,
  getProductTypeDef,
  getTag,
  getTopic,
  priceLabel,
  type Product,
} from "../_mock/data";
import { useNow } from "../_mock/use-now";
import { MockupRibbon } from "../_components/mockup-ribbon";
import { TYPE_ICON } from "../_components/type-icon";

export default function ProductDetailPage() {
  const params = useParams<{ productSlug: string }>();
  const product = useMemo(
    () => getProductBySlug(params.productSlug),
    [params.productSlug],
  );

  if (!product) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">Product not found.</p>
        <Button asChild variant="ghost" className="mt-4">
          <Link href="/browse-mockup">← Back to browse</Link>
        </Button>
      </div>
    );
  }

  const typeDef = getProductTypeDef(product.type);
  const Icon = TYPE_ICON[product.type];

  return (
    <div className="container mx-auto px-4 py-8 sm:py-12">
      <MockupRibbon />

      <div className="mx-auto max-w-5xl">
        <Link
          href="/browse-mockup"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All clubs, camps, and events
        </Link>

        <div className="mt-6 flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {typeDef.name}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              {product.name}
            </h1>
            <p className="mt-1 text-muted-foreground">{product.tagline}</p>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
          <MainColumn product={product} />
          <SidebarColumn product={product} />
        </div>
      </div>
    </div>
  );
}

function MainColumn({ product }: { product: Product }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-5 sm:p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            About this {getProductTypeDef(product.type).name.toLowerCase()}
          </h2>
          <p className="mt-3 leading-relaxed">{product.description}</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 sm:p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            When &amp; where
          </h2>
          <dl className="mt-3 space-y-3 text-sm">
            <DetailRow icon={Clock} label="Schedule">
              <ul className="space-y-0.5">
                {product.scheduleDetail.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </DetailRow>
            <DetailRow
              icon={product.isOnline ? Globe : MapPin}
              label={product.isOnline ? "Format" : "Where"}
            >
              {product.locationLabel}
            </DetailRow>
            <DetailRow icon={Users} label="Age range">
              {product.minAge}–{product.maxAge} years
            </DetailRow>
            <DetailRow icon={Sparkles} label="Language">
              {product.languages.map((l) => LANGUAGE_NAMES[l]).join(" · ")}
            </DetailRow>
          </dl>
        </CardContent>
      </Card>

      {(product.topicIds.length > 0 || product.tagIds.length > 0) && (
        <Card>
          <CardContent className="p-5 sm:p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              What to expect
            </h2>
            {product.topicIds.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-muted-foreground">Focus</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {product.topicIds.map((id) => {
                    const topic = getTopic(id);
                    if (!topic) return null;
                    return (
                      <span
                        key={id}
                        className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                      >
                        {topic.name}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
            {product.tagIds.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-muted-foreground">Vibe</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {product.tagIds.map((id) => {
                    const tag = getTag(id);
                    if (!tag) return null;
                    return (
                      <span
                        key={id}
                        className="rounded-full border border-input px-2.5 py-1 text-xs"
                        title={tag.description}
                      >
                        {tag.name}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-5 sm:p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Who runs it
          </h2>
          <div className="mt-3 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-secondary/15 text-secondary">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="font-medium">{product.primaryGeduName}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {product.primaryGeduBio}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SidebarColumn({ product }: { product: Product }) {
  const now = useNow();
  const state = getProductState(product, now ?? 0);
  const isThresholdPending =
    product.status === "pending" && product.signupThreshold;

  return (
    <div className="lg:sticky lg:top-6 lg:self-start">
      <Card className="border-primary/30">
        <CardContent className="space-y-5 p-5 sm:p-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Price
            </p>
            <p className="mt-1 text-xl font-bold">{priceLabel(product.price)}</p>
            {product.price.mode === "upfront" && (
              <p className="mt-1 text-xs text-muted-foreground">
                Refundable up to one week before the start date.
              </p>
            )}
            {product.price.mode === "per_session" && (
              <p className="mt-1 text-xs text-muted-foreground">
                Only charged for sessions your child actually joins.
              </p>
            )}
          </div>

          <div className="border-t border-border pt-4">
            <SeatStateBlock
              product={product}
              state={state}
              nowAvailable={now !== null}
            />
          </div>

          {isThresholdPending && (
            <ThresholdBlock
              current={product.seatsTaken}
              threshold={product.signupThreshold!}
            />
          )}

          <RegisterCta
            product={product}
            state={state}
            nowAvailable={now !== null}
          />
        </CardContent>
      </Card>

      <p className="mt-3 px-2 text-center text-[11px] text-muted-foreground">
        This is a mockup — the register button doesn&apos;t do anything yet.
      </p>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="mt-0.5">{children}</dd>
      </div>
    </div>
  );
}

function SeatStateBlock({
  product,
  state,
  nowAvailable,
}: {
  product: Product;
  state: ReturnType<typeof getProductState>;
  nowAvailable: boolean;
}) {
  if (!nowAvailable) {
    // Reserve the layout until the clock is ready. Same rule as the existing
    // registration mockup — don't let elements shift when state flips in.
    return <div className="h-8" aria-hidden />;
  }

  if (state.registration === "not_open" && state.opensAt) {
    return <Countdown opensAt={state.opensAt} />;
  }

  if (state.registration === "full") {
    return (
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Status
        </p>
        <p className="mt-1 font-semibold">Full right now</p>
        {product.waitlistCount > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            {product.waitlistCount}{" "}
            {product.waitlistCount === 1 ? "person" : "people"} on the waitlist.
          </p>
        )}
      </div>
    );
  }

  if (product.seatCount === null) {
    return (
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Status
        </p>
        <p className="mt-1 font-semibold">Open — no seat limit</p>
        {product.seatsTaken > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            {product.seatsTaken} already signed up.
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Seats
      </p>
      <p className="mt-1 font-semibold">
        {state.seatsRemaining} of {product.seatCount} left
      </p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full",
            state.registration === "almost_full"
              ? "bg-destructive"
              : "bg-primary",
          )}
          style={{
            width: `${Math.min(100, ((product.seatCount - (state.seatsRemaining ?? 0)) / product.seatCount) * 100)}%`,
          }}
        />
      </div>
    </div>
  );
}

function Countdown({ opensAt }: { opensAt: Date }) {
  const now = useNow() ?? 0;
  const totalMs = Math.max(0, opensAt.getTime() - now);
  const totalSec = Math.floor(totalMs / 1000);
  const days = Math.floor(totalSec / 86_400);
  const hours = Math.floor((totalSec % 86_400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Registration opens in
      </p>
      <div className="mt-2 grid grid-cols-4 gap-1.5 text-center">
        <TimeCell value={days} label="days" />
        <TimeCell value={hours} label="hrs" />
        <TimeCell value={minutes} label="min" />
        <TimeCell value={seconds} label="sec" />
      </div>
      <p className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
        <CalendarClock className="h-3 w-3" />
        Server time: {opensAt.toLocaleString("en-GB")}
      </p>
    </div>
  );
}

function TimeCell({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 py-2">
      <p className="text-lg font-bold tabular-nums">
        {value.toString().padStart(2, "0")}
      </p>
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

function ThresholdBlock({
  current,
  threshold,
}: {
  current: number;
  threshold: number;
}) {
  const pct = Math.min(100, (current / threshold) * 100);
  const remaining = Math.max(0, threshold - current);

  return (
    <div className="rounded-md border border-secondary/30 bg-secondary/10 p-3">
      <p className="text-xs font-semibold text-secondary">Starts when it fills up</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {current} of {threshold} signed up — {remaining} more to go before we
        begin. Sign up now and we&apos;ll keep you posted.
      </p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-secondary"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function RegisterCta({
  product,
  state,
  nowAvailable,
}: {
  product: Product;
  state: ReturnType<typeof getProductState>;
  nowAvailable: boolean;
}) {
  // Keep the CTA stable before hydration. Render a disabled placeholder so the
  // primary action doesn't move when the real state lands.
  if (!nowAvailable) {
    return (
      <Button disabled className="w-full">
        Loading…
      </Button>
    );
  }

  if (state.registration === "not_open") {
    return (
      <Button disabled className="w-full">
        Sign up opens soon
      </Button>
    );
  }

  if (state.registration === "full") {
    return (
      <Button variant="outline" className="w-full">
        Join the waitlist
      </Button>
    );
  }

  if (product.status === "pending") {
    return (
      <Button className="w-full">Sign up · reserve a spot</Button>
    );
  }

  return <Button className="w-full">Sign up</Button>;
}
