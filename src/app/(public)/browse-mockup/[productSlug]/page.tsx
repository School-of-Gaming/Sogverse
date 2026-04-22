"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarX,
  Clock,
  Globe,
  MapPin,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  LANGUAGE_NAMES,
  MOCK_GAMERS,
  getLocationLabel,
  getProductBySlug,
  getProductState,
  getProductTypeDef,
  getTag,
  getTopic,
  priceLabel,
  productDetailPath,
  type Product,
  type ProductRuntimeState,
} from "../_mock/data";
import { useNow } from "../_mock/use-now";
import {
  buildCountdown,
  formatIsoDate,
  formatServerClock,
  formatWhen,
  pad2,
} from "../_mock/format";
import { TYPE_ICON } from "../_components/type-icon";

// Kept identical across the load→ready and pre-open→open transitions so the
// paragraph under the submit button doesn't pop in and push the button.
const PRE_OPEN_HELPER_TEXT =
  "Pick your child and agree to the rules for a one-click signup when it opens.";

export default function ProductDetailPage() {
  const params = useParams<{ productSlug: string }>();
  const product = useMemo(
    () => getProductBySlug(params.productSlug),
    [params.productSlug],
  );

  if (!product) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">Not found.</p>
        <Link href="/browse-mockup" className="mt-4 inline-block">
          <Button variant="ghost">← Back to browse</Button>
        </Link>
      </div>
    );
  }

  const typeDef = getProductTypeDef(product.type);
  const Icon = TYPE_ICON[product.type];

  // Send the parent back to the entry point they came from. Municipality
  // clubs live on /registration; everything else lives on /browse-mockup.
  const isMuni = product.type === "municipality-club";
  const backHref = isMuni ? "/registration" : "/browse-mockup";
  const backLabel = isMuni
    ? "All municipality clubs"
    : "All clubs, camps, and events";

  return (
    <div className="container mx-auto px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-start justify-between gap-4">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {backLabel}
          </Link>
          <ServerClock />
        </div>

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

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
          <MainColumn product={product} />
          <div className="lg:sticky lg:top-6 lg:self-start">
            <SignupPanel product={product} />
            <p className="mt-3 px-2 text-center text-[11px] text-muted-foreground">
              Mockup · the {typeDef.signupVerb.toLowerCase()} button doesn&apos;t
              do anything yet.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Main column (product description, schedule, tags, Gedu) ----------

function MainColumn({ product }: { product: Product }) {
  const typeDef = getProductTypeDef(product.type);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-5 sm:p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            About this {typeDef.name.toLowerCase()}
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
              {getLocationLabel(product)}
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

      {product.skipped && product.skipped.length > 0 && (
        <Card>
          <CardContent className="p-5 sm:p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              No session on these dates
            </h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {product.skipped.map((s) => (
                <li
                  key={s.date}
                  className="flex items-center gap-2 rounded-md border border-dashed border-border p-2.5 text-sm"
                >
                  <CalendarX className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <span className="font-medium">{formatIsoDate(s.date)}</span>
                    <span className="ml-1.5 text-muted-foreground">· {s.reason}</span>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

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
              {product.assistantGeduName && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Assistant: {product.assistantGeduName}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
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

function ServerClock() {
  const now = useNow();
  return (
    <div className="text-right text-xs text-muted-foreground">
      <div className="font-medium text-foreground/80">Our clock</div>
      <div className="tabular-nums">
        {now === null ? "--:--:-- ---" : formatServerClock(new Date(now))}
      </div>
    </div>
  );
}

// ---------- Signup panel ----------
//
// The panel's *shape* is determined by the product's stable fields (offset,
// seatCount, signupThreshold) — NOT by live state. This matters because:
//  1. We render a skeleton that matches the final panel shape before the
//     clock hydrates, so load→ready doesn't shift the layout.
//  2. The pre-open → open transition reuses the same panel component
//     instance (PreOpenPanel), so the form keeps its selected gamer + checked
//     rules checkbox across the countdown flip.
// Swapping components here would unmount the form and reset it.

function SignupPanel({ product }: { product: Product }) {
  const now = useNow();
  const state = now !== null ? getProductState(product, now) : null;
  const isThresholdPending =
    product.status === "pending" && product.signupThreshold;

  // Threshold-pending products have their own shape: "reserve a spot while it
  // fills up." Seat count exists but isn't the interesting number.
  if (isThresholdPending) {
    return <ThresholdPanel product={product} state={state} />;
  }

  // Pre-open: countdown flips to open without remounting.
  if (
    product.registrationOpensOffsetMs !== undefined &&
    product.registrationOpensOffsetMs > 0
  ) {
    return <PreOpenPanel product={product} state={state} />;
  }

  // Product is already "open" (or was never gated). If full, go straight to
  // waitlist; otherwise the normal signup form.
  if (product.seatCount !== null && product.seatsTaken >= product.seatCount) {
    return <WaitlistPanel product={product} />;
  }

  return <OpenPanel product={product} state={state} />;
}

function PanelShell({
  banner,
  tone,
  children,
}: {
  banner: string;
  tone: "primary" | "warning" | "destructive" | "muted" | "secondary";
  children: React.ReactNode;
}) {
  return (
    <Card
      className={cn(
        "overflow-hidden",
        tone === "primary" && "border-primary/40",
        tone === "warning" && "border-warning/60",
        tone === "destructive" && "border-destructive/60",
        tone === "secondary" && "border-secondary/40",
      )}
    >
      <div
        className={cn(
          "px-5 py-2.5 text-center text-sm font-semibold",
          tone === "primary" && "bg-primary text-primary-foreground",
          tone === "warning" && "bg-warning text-warning-foreground",
          tone === "destructive" && "bg-destructive text-destructive-foreground",
          tone === "muted" && "bg-muted text-muted-foreground",
          tone === "secondary" && "bg-secondary text-secondary-foreground",
        )}
      >
        {banner}
      </div>
      <CardContent className="space-y-5 p-5 sm:p-6">{children}</CardContent>
    </Card>
  );
}

function PreOpenPanel({
  product,
  state,
}: {
  product: Product;
  state: ProductRuntimeState | null;
}) {
  const router = useRouter();
  const now = useNow();
  // Treat opensAt as stable — derived from product.registrationOpensOffsetMs
  // + module load time, so it doesn't change across ticks.
  const opensAt = state?.opensAt ?? null;
  const cd = opensAt && now !== null ? buildCountdown(opensAt, now) : null;
  const isOpen = cd?.done ?? false;
  const typeDef = getProductTypeDef(product.type);

  const banner = isOpen
    ? `${typeDef.signupVerb} is open`
    : `${typeDef.signupVerb} opens in`;
  const tone = isOpen ? "primary" : "muted";

  function handleSubmit(gamer: string) {
    const q = new URLSearchParams({ status: "signed_up", gamer });
    router.push(`${productDetailPath(product)}/confirmed?${q.toString()}`);
  }

  return (
    <PanelShell banner={banner} tone={tone}>
      <CountdownClock countdown={cd} />
      <p className="text-center text-xs text-muted-foreground">
        {opensAt ? formatWhen(opensAt) : "\u00a0"}
      </p>
      <PriceBlock product={product} />
      <SignupForm
        product={product}
        canSubmit={isOpen}
        idleLabel={isOpen ? `${typeDef.signupVerb} now →` : `${typeDef.signupVerb} — not yet open`}
        readyLabel={
          isOpen ? `${typeDef.signupVerb} now →` : `Ready — waiting for open`
        }
        helperText={PRE_OPEN_HELPER_TEXT}
        onSubmit={handleSubmit}
      />
      {product.seatCount !== null && (
        <SeatCounter
          seatCount={product.seatCount}
          seatsRemaining={
            state?.seatsRemaining ??
            Math.max(0, product.seatCount - product.seatsTaken)
          }
          nowAvailable={now !== null}
        />
      )}
    </PanelShell>
  );
}

function OpenPanel({
  product,
  state,
}: {
  product: Product;
  state: ProductRuntimeState | null;
}) {
  const router = useRouter();
  const now = useNow();
  const typeDef = getProductTypeDef(product.type);
  const urgent = state?.registration === "almost_full";

  function handleSubmit(gamer: string) {
    const q = new URLSearchParams({ status: "signed_up", gamer });
    router.push(`${productDetailPath(product)}/confirmed?${q.toString()}`);
  }

  return (
    <PanelShell
      banner={
        urgent
          ? "Going fast — only a few seats left"
          : `${typeDef.signupVerb} is open`
      }
      tone={urgent ? "warning" : "primary"}
    >
      {product.seatCount !== null ? (
        <SeatCounter
          seatCount={product.seatCount}
          seatsRemaining={
            state?.seatsRemaining ??
            Math.max(0, product.seatCount - product.seatsTaken)
          }
          nowAvailable={now !== null}
          large
        />
      ) : (
        <div className="text-center">
          <p className="text-3xl font-bold tabular-nums">{product.seatsTaken}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            already signed up · all welcome
          </p>
        </div>
      )}
      <PriceBlock product={product} />
      <SignupForm
        product={product}
        canSubmit={true}
        idleLabel={`${typeDef.signupVerb} now →`}
        readyLabel={`${typeDef.signupVerb} now →`}
        onSubmit={handleSubmit}
      />
    </PanelShell>
  );
}

function WaitlistPanel({ product }: { product: Product }) {
  const router = useRouter();

  function handleJoin(gamer: string) {
    const q = new URLSearchParams({
      status: "waitlisted",
      gamer,
      position: String(product.waitlistCount + 1),
    });
    router.push(`${productDetailPath(product)}/confirmed?${q.toString()}`);
  }

  return (
    <PanelShell banner="Fully booked right now" tone="destructive">
      <div className="text-center">
        <div className="text-4xl font-bold tabular-nums">
          {product.waitlistCount}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          families on the waitlist · you&apos;d be #
          {product.waitlistCount + 1}
        </p>
      </div>
      <PriceBlock product={product} />
      <SignupForm
        product={product}
        canSubmit={true}
        idleLabel="Join the waitlist"
        readyLabel="Join the waitlist"
        variant="secondary"
        onSubmit={handleJoin}
      />
      <div className="space-y-2 rounded-md border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
        <p className="font-semibold text-foreground">How the waitlist works:</p>
        <ul className="list-disc space-y-1 pl-4">
          <li>You keep your spot in line for the whole term.</li>
          <li>
            If a family cancels, the next person gets a short window to accept
            by email and WhatsApp.
          </li>
          <li>You can leave the waitlist anytime from your account.</li>
        </ul>
      </div>
    </PanelShell>
  );
}

function ThresholdPanel({
  product,
  state,
}: {
  product: Product;
  state: ProductRuntimeState | null;
}) {
  const router = useRouter();
  const typeDef = getProductTypeDef(product.type);
  const threshold = product.signupThreshold!;
  const current = product.seatsTaken;
  const pct = Math.min(100, (current / threshold) * 100);
  const remaining = Math.max(0, threshold - current);

  function handleReserve(gamer: string) {
    const q = new URLSearchParams({
      status: "reserved",
      gamer,
      threshold: String(threshold),
    });
    router.push(`${productDetailPath(product)}/confirmed?${q.toString()}`);
  }

  const canSubmit = state !== null; // always true once clock ticks

  return (
    <PanelShell banner="Starts when it fills up" tone="secondary">
      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-bold tabular-nums">
            {current} of {threshold}
          </span>
          <span className="text-xs text-muted-foreground">
            {remaining} more to start
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-secondary"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        We&apos;ll start this{" "}
        {typeDef.name.toLowerCase()} once{" "}
        <strong className="text-foreground">{threshold} kids</strong> have
        signed up. Reserve a spot now and we&apos;ll let you know the moment we
        have enough.
      </p>
      <PriceBlock product={product} />
      <SignupForm
        product={product}
        canSubmit={canSubmit}
        idleLabel={`Reserve a spot`}
        readyLabel={`Reserve a spot`}
        onSubmit={handleReserve}
      />
    </PanelShell>
  );
}

// ---------- Reusable sub-blocks inside panels ----------

function PriceBlock({ product }: { product: Product }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Price
      </p>
      <p className="mt-1 text-base font-bold">{priceLabel(product.price)}</p>
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
      {product.price.mode === "external_contract" && (
        <p className="mt-1 text-xs text-muted-foreground">
          No credit card needed.
        </p>
      )}
    </div>
  );
}

function CountdownClock({
  countdown,
}: {
  countdown: ReturnType<typeof buildCountdown> | null;
}) {
  // Render the shape even when null (pre-hydration) so the panel layout
  // matches between the skeleton and the live clock.
  const cd = countdown ?? {
    done: false,
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    totalMs: Infinity,
  };
  const visible = countdown !== null;
  return (
    <div
      className={cn(
        "grid grid-cols-4 gap-1.5 text-center",
        !visible && "invisible",
      )}
      aria-hidden={!visible}
    >
      <TimeCell value={cd.days} label="days" />
      <TimeCell value={cd.hours} label="hrs" />
      <TimeCell value={cd.minutes} label="min" />
      <TimeCell value={cd.seconds} label="sec" />
    </div>
  );
}

function TimeCell({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 py-2">
      <p className="text-xl font-bold tabular-nums sm:text-2xl">{pad2(value)}</p>
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

function SeatCounter({
  seatCount,
  seatsRemaining,
  nowAvailable,
  large = false,
}: {
  seatCount: number;
  seatsRemaining: number;
  nowAvailable: boolean;
  large?: boolean;
}) {
  const pct = Math.max(
    0,
    Math.min(100, (seatsRemaining / seatCount) * 100),
  );
  const barColor =
    seatsRemaining === 0
      ? "bg-destructive"
      : seatsRemaining <= Math.ceil(seatCount * 0.2)
        ? "bg-warning"
        : "bg-success";

  return (
    <div className={cn(!nowAvailable && "invisible")} aria-hidden={!nowAvailable}>
      <div className="flex items-baseline justify-between">
        <span
          className={cn(
            "font-bold tabular-nums",
            large ? "text-3xl" : "text-xl",
          )}
        >
          {seatsRemaining}
        </span>
        <span className="text-xs text-muted-foreground">
          of {seatCount} seats remaining
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full transition-[width] duration-500", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ---------- Signup form ----------

function SignupForm({
  product,
  canSubmit,
  idleLabel,
  readyLabel,
  helperText,
  variant = "default",
  onSubmit,
}: {
  product: Product;
  canSubmit: boolean;
  idleLabel: string;
  readyLabel: string;
  helperText?: string;
  variant?: "default" | "secondary";
  onSubmit: (gamerName: string) => void;
}) {
  const [gamerId, setGamerId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAge, setNewAge] = useState("");
  const [agreed, setAgreed] = useState(false);

  const hasGamer =
    (gamerId !== null && !addingNew) ||
    (addingNew && newName.trim().length > 0);
  const formReady = hasGamer && agreed;
  const clickable = formReady && canSubmit;

  function handleClick() {
    if (!clickable) return;
    const name = addingNew
      ? newName.trim()
      : (MOCK_GAMERS.find((g) => g.id === gamerId)?.name ?? "your child");
    onSubmit(name);
  }

  const rulesCopy =
    product.type === "event"
      ? "I've read the event details and understand my child may need a parent or guardian present depending on age."
      : product.type === "camp"
        ? "I agree to the camp's code of conduct and understand the cancellation window above."
        : "I agree to the club's code of conduct and understand that repeated unexcused absences may open my child's seat for the next family on the waitlist.";

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-muted/30 p-4">
        <h3 className="text-sm font-semibold">Who are you signing up?</h3>
        {helperText && (
          <p className="mt-1 text-xs text-muted-foreground">{helperText}</p>
        )}
        <div className="mt-3 space-y-2">
          {MOCK_GAMERS.map((g) => {
            const selected = gamerId === g.id && !addingNew;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => {
                  setGamerId(g.id);
                  setAddingNew(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors",
                  selected
                    ? "border-primary bg-primary/10"
                    : "border-input hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <span>
                  <span className="font-medium">{g.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    Age {g.age}
                  </span>
                </span>
                {selected && (
                  <span className="text-xs font-semibold text-primary">
                    Selected
                  </span>
                )}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setAddingNew((v) => !v);
              setGamerId(null);
            }}
            className={cn(
              "w-full rounded-md border px-3 py-2 text-left text-sm transition-colors",
              addingNew
                ? "border-primary bg-primary/10"
                : "border-dashed border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            + Add another child
          </button>
        </div>
        {addingNew && (
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_80px]">
            <div className="space-y-1">
              <Label htmlFor="new-name" className="text-xs">
                Name
              </Label>
              <Input
                id="new-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-age" className="text-xs">
                Age
              </Label>
              <Input
                id="new-age"
                type="number"
                min={product.minAge}
                max={product.maxAge}
                value={newAge}
                onChange={(e) => setNewAge(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      <label className="flex items-start gap-2 text-xs">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
        />
        <span className="text-muted-foreground">{rulesCopy}</span>
      </label>

      <Button
        size="lg"
        variant={variant}
        className="w-full text-base"
        disabled={!clickable}
        onClick={handleClick}
      >
        {formReady ? readyLabel : idleLabel}
      </Button>
    </div>
  );
}

