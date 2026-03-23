"use client";

import { useEffect, useRef, useState } from "react";
import {
  Plus,
  Pencil,
  Trash,
  Search,
  Users,
  Package,
  TrendingUp,
  DollarSign,
  Check,
  AlertCircle,
  AlertTriangle,
  Info,
  Coins,
} from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ROLE_BADGES } from "@/lib/constants";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Identicon } from "@/components/ui/identicon";
import { VoiceAvatar } from "@/components/voice/VoiceAvatar";
import { ParticipantRow } from "@/components/voice/ParticipantRow";
import { TokenBalanceCard } from "@/components/customer";
import { SwitchToGamerDialog } from "@/components/customer/SwitchToGamerDialog";
import { ProductRow } from "@/components/admin/product-row";
import { UserRow } from "@/components/admin/user-row";
import { GamerCard } from "@/components/customer/gamer-card";
import { LoungeCard } from "@/components/ui/lounge-card";
import { GroupCard } from "@/components/ui/group-card";
import { formatScheduleLocal } from "@/lib/utils";
import { useAuth } from "@/providers";
import { useCurrency } from "@/hooks/use-currency";
import { useTokenRates } from "@/providers/token-rate-provider";
import { TokenPurchaseSection } from "@/components/tokens";
import type { StripePackage } from "@/types";
import { AVATAR_SIZE } from "@/lib/constants/spatial";
import { computeGlowStyle } from "@/lib/constants/spatial.config";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-bold">{title}</h2>
      <div className="rounded-lg border p-6 space-y-6">{children}</div>
    </section>
  );
}

function SubSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Swatch({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className={`h-12 w-12 rounded-lg border ${className}`} />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Voice Room Avatar Demo                                             */
/* ------------------------------------------------------------------ */

function VoiceAvatarDemo() {
  const { user, profile } = useAuth();
  const [level, setLevel] = useState(0);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (cameraOn) {
      navigator.mediaDevices
        .getUserMedia({ video: true })
        .then((stream) => {
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        })
        .catch(() => setCameraOn(false));
    } else {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    }
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [cameraOn]);

  const effectiveLevel = micOn ? level : 0;
  const glowStyle = computeGlowStyle(effectiveLevel);

  return (
    <div className="flex items-center gap-8">
      <div style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}>
        <VoiceAvatar
          userId={profile?.id || user?.id || "demo"}
          userName={profile?.display_name ?? "You"}
          audioOn={micOn}
          videoOn={cameraOn}
          isLocal
          glowStyle={glowStyle}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
          />
        </VoiceAvatar>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="mic-level" className="text-xs">
            Mic level: {Math.round(level * 100)}%
          </Label>
          <input
            id="mic-level"
            type="range"
            min="0"
            max="100"
            value={Math.round(level * 100)}
            onChange={(e) => setLevel(Number(e.target.value) / 100)}
            className="w-48 accent-primary"
          />
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={micOn}
              onChange={(e) => setMicOn(e.target.checked)}
              className="accent-primary"
            />
            Mic on
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={cameraOn}
              onChange={(e) => setCameraOn(e.target.checked)}
              className="accent-primary"
            />
            Camera on
          </label>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Dialog Demo                                                        */
/* ------------------------------------------------------------------ */

function SwitchToGamerDialogDemo() {
  const [open, setOpen] = useState(false);

  return (
    <Section title="Switch to Gamer Dialog">
      <SubSection title="Parent → Gamer session switch">
        <p className="text-sm text-muted-foreground mb-3">
          Shown when a parent clicks &ldquo;Join&rdquo; on a voice session. Uses info color to signal
          an attention-worthy auth action. Confirm button triggers session swap then full page navigation.
        </p>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Open Switch Dialog
        </Button>
        <SwitchToGamerDialog
          open={open}
          onOpenChange={setOpen}
          gamerId="demo-gamer-id"
          gamerDisplayName="JääKarhu"
          redirectUrl="#"
        />
      </SubSection>
    </Section>
  );
}

function DialogDemo() {
  const [openDialog, setOpenDialog] = useState<"confirm" | "destructive" | "info" | null>(null);

  return (
    <Section title="Dialog">
      <SubSection title="Trigger Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => setOpenDialog("confirm")}>
            Confirmation Dialog
          </Button>
          <Button variant="destructive" onClick={() => setOpenDialog("destructive")}>
            Destructive Dialog
          </Button>
          <Button variant="secondary" onClick={() => setOpenDialog("info")}>
            Info Dialog
          </Button>
        </div>
      </SubSection>

      <Dialog open={openDialog === "confirm"} onOpenChange={(open) => !open && setOpenDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hide Product</DialogTitle>
            <DialogDescription>
              Are you sure you want to hide &ldquo;Sogverse Pro&rdquo;? It will no longer be visible to parents.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(null)}>Cancel</Button>
            <Button onClick={() => setOpenDialog(null)}>Hide</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openDialog === "destructive"} onOpenChange={(open) => !open && setOpenDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Product
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;Starter Pack&rdquo;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => setOpenDialog(null)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openDialog === "info"} onOpenChange={(open) => !open && setOpenDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>About Dialogs</DialogTitle>
            <DialogDescription>
              Dialogs use a portal to render above all content with a backdrop overlay. They dismiss on Escape key or clicking the backdrop.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setOpenDialog(null)}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  Participant Card Demo                                              */
/* ------------------------------------------------------------------ */

const DEMO_PARTICIPANTS = [
  {
    userId: "4babfc78-d197-496e-860d-48f1207f5bc6",
    userName: "ShadowFox99",
    isLocal: true,
    isOwner: true,
    audioOn: true,
    videoOn: false,
  },
  {
    userId: "1a54d62e-828f-4a42-89f1-cc36185351b0",
    userName: "JääKarhu",
    isLocal: false,
    isOwner: false,
    audioOn: true,
    videoOn: true,
  },
  {
    userId: "19ffd6e5-2e78-4742-a65f-6ed40b2b8b47",
    userName: "NovaBlitz",
    isLocal: false,
    isOwner: false,
    audioOn: false,
    videoOn: false,
  },
  {
    userId: "a3b7c912-45de-4f01-b8a2-9c6d3e7f1234",
    userName: "xXx_DarkPhoenixRising_Legend_xXx",
    isLocal: false,
    isOwner: true,
    audioOn: true,
    videoOn: true,
  },
  {
    userId: "d5e8f234-67ab-4c12-9d3e-a1b2c3d4e5f6",
    userName: "TheUltimateGalaxyDestroyer9000",
    isLocal: false,
    isOwner: false,
    audioOn: true,
    videoOn: false,
  },
];

/** Simulate speaking glow on a ref using a sine wave. Different phase offsets
 *  per participant so they don't pulse in sync. */
function useSimulatedGlow(
  ref: React.RefObject<HTMLDivElement | null>,
  audioOn: boolean,
  phaseOffset: number,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !audioOn) {
      if (el) {
        el.style.boxShadow = "";
        el.style.borderColor = "";
      }
      return;
    }

    let rafId = 0;
    const tick = () => {
      // Simulate speech-like bursts: fast sine modulated by a slower envelope
      const t = performance.now() / 1000;
      const envelope = Math.max(0, Math.sin(t * 1.2 + phaseOffset));
      const burst = Math.abs(Math.sin(t * 5 + phaseOffset));
      const level = envelope * burst;
      const glow = computeGlowStyle(level);
      el.style.boxShadow = glow.boxShadow ?? "";
      el.style.borderColor = glow.borderColor ?? "";
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [ref, audioOn, phaseOffset]);
}

function ParticipantCardDemo() {
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const [locks, setLocks] = useState<Record<string, { audio: boolean; video: boolean }>>({
    "19ffd6e5-2e78-4742-a65f-6ed40b2b8b47": { audio: true, video: false },
  });

  // Refs for simulated speaking glow (one per participant)
  const ref0 = useRef<HTMLDivElement>(null);
  const ref1 = useRef<HTMLDivElement>(null);
  const ref2 = useRef<HTMLDivElement>(null);
  const ref3 = useRef<HTMLDivElement>(null);
  const ref4 = useRef<HTMLDivElement>(null);
  const avatarRefs = [ref0, ref1, ref2, ref3, ref4];

  useSimulatedGlow(ref0, DEMO_PARTICIPANTS[0].audioOn, 0);
  useSimulatedGlow(ref1, DEMO_PARTICIPANTS[1].audioOn, 2.1);
  useSimulatedGlow(ref2, DEMO_PARTICIPANTS[2].audioOn, 4.2);
  useSimulatedGlow(ref3, DEMO_PARTICIPANTS[3].audioOn, 6.3);
  useSimulatedGlow(ref4, DEMO_PARTICIPANTS[4].audioOn, 1.4);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">
          Participants ({DEMO_PARTICIPANTS.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {DEMO_PARTICIPANTS.map((p, i) => {
          const volume = volumes[p.userId] ?? 1.0;
          const lockState = locks[p.userId] ?? { audio: false, video: false };
          return (
            <ParticipantRow
              key={p.userId}
              participant={p}
              volume={volume}
              lockState={lockState}
              isModView
              avatarRef={avatarRefs[i]}
              onVolumeChange={(vol) =>
                setVolumes((prev) => ({ ...prev, [p.userId]: vol }))
              }
              onLock={(track, locked) =>
                setLocks((prev) => ({
                  ...prev,
                  [p.userId]: { ...lockState, [track]: locked },
                }))
              }
            />
          );
        })}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Product Row Demo                                                   */
/* ------------------------------------------------------------------ */

const DEMO_PRODUCTS = [
  {
    id: "prod-1",
    name: "Sogverse Pro",
    description: "Weekly game-based social skills sessions with a certified educator",
    image_url: "https://upload.wikimedia.org/wikipedia/en/thumb/b/b6/Minecraft_2024_cover_art.png/250px-Minecraft_2024_cover_art.png",
    is_visible: true,
    token_cost: 50,
    day_of_week: 3,
    start_time: "15:00",
    timezone: "America/New_York",
    duration_minutes: 60,
    min_age: 8,
    max_age: 14,
    game_id: "game-1",
    created_by: "admin",
    padlet_url: null,
    created_at: null,
    updated_at: null,
    games: { name: "Minecraft" },
  },
  {
    id: "prod-2",
    name: "Starter Pack",
    description: "Intro sessions for younger gamers — small group, shorter format",
    image_url: "https://upload.wikimedia.org/wikipedia/en/thumb/a/ae/Fortnite_Save_The_World.jpg/250px-Fortnite_Save_The_World.jpg",
    is_visible: false,
    token_cost: 25,
    day_of_week: 6,
    start_time: "10:00",
    timezone: "America/New_York",
    duration_minutes: 45,
    min_age: 6,
    max_age: 10,
    game_id: "game-2",
    created_by: "admin",
    padlet_url: null,
    created_at: null,
    updated_at: null,
    games: { name: "Roblox" },
  },
] as const;

// Demo products: day_of_week (0=Mon–6=Sun), start_time, timezone (IANA)
const DEMO_GROUPS = [
  { name: "Thursday Minecraft Club", gedu: "Rachel Morgan", gamers: 4, day: 3, time: "17:30", tz: "Europe/Helsinki", image: "https://placehold.co/80x96" },
  { name: "Friday Creative Lab",     gedu: "Morgan Ellis",  gamers: 3, day: 4, time: "16:00", tz: "America/New_York", image: "https://placehold.co/200x96" },
  { name: "Weekend Warriors",        gedu: "Taylor Kim",    gamers: 2, day: 6, time: "15:00", tz: "America/New_York", image: "https://placehold.co/96x96" },
  { name: "Saturday Adventure Club", gedu: "Jordan Lee",    gamers: 6, day: 5, time: "10:00", tz: "America/New_York", image: "https://placehold.co/80x200" },
  { name: "Wednesday Roblox Group",  gedu: "Sam Rivera",    gamers: 5, day: 2, time: "17:00", tz: "America/New_York", image: "https://placehold.co/160x90" },
  { name: "Monday Builders",         gedu: "Alex Chen",     gamers: 3, day: 0, time: "16:00", tz: "America/New_York", image: "https://placehold.co/80x96" },
] as const;

/** Defers time-dependent values to after mount so SSR and client render match. */
function GroupCardDemo() {
  const { locale } = useCurrency();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;
  // eslint-disable-next-line react-hooks/purity -- demo-only; called once after mount guard
  const now = Date.now();
  const HOUR = 60 * 60_000;
  const MIN = 60_000;

  // [voiceIsOpen, countdown offset] per demo card
  // Negative offset = session started in the past → shows "Session in progress"
  const states: [boolean, number][] = [
    [true,  -30 * MIN],           // Live — session in progress (started 30 min ago)
    [true,  3 * MIN],             // Live — in buffer window, starts in 3 min
    [false, 12 * MIN],            // < 1 hour (warning)
    [false, 1 * HOUR + 30 * MIN], // 1–2 hours (warning)
    [false, 5 * HOUR],            // Hours away (muted)
    [false, 2 * 24 * HOUR],       // Days away (muted)
  ];

  return (
    <div className="space-y-3">
      {DEMO_GROUPS.map((g, i) => {
        const [live, offset] = states[i];
        return (
          <GroupCard
            key={g.name}
            productName={g.name}
            productImageUrl={g.image}
            geduName={g.gedu}
            gamerCount={g.gamers}
            schedule={formatScheduleLocal(g.day, g.time, g.tz, locale)}
            voiceIsOpen={live}
            voiceNextSessionStart={new Date(now + offset)}
            onJoinClick={() => {}}
            detailHref="#"
          />
        );
      })}
    </div>
  );
}

function ProductRowDemo() {
  const { currency, locale } = useCurrency();
  const { tokensToCurrencyDisplay } = useTokenRates();
  return (
    <div className="space-y-2">
      {DEMO_PRODUCTS.map((product) => (
        <ProductRow key={product.id} product={product} currency={currency} locale={locale} tokensToCurrencyDisplay={tokensToCurrencyDisplay} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Package Card Demo                                                  */
/* ------------------------------------------------------------------ */

const DEMO_ONE_TIME_PACKAGES: StripePackage[] = [
  {
    stripeProductId: "prod_demo_starter",
    name: "Sogverse Starter Pack",
    description: "5 Sorgs to get started",
    tokenAmount: 5,
    prices: {
      usd: { priceId: "price_demo_starter_usd", unitAmount: 1500 },
      gbp: { priceId: "price_demo_starter_gbp", unitAmount: 1200 },
      eur: { priceId: "price_demo_starter_eur", unitAmount: 1400 },
    },
    type: "one_time",
  },
  {
    stripeProductId: "prod_demo_value",
    name: "Sogverse Value Pack",
    description: "15 Sorgs at a great price",
    tokenAmount: 15,
    prices: {
      usd: { priceId: "price_demo_value_usd", unitAmount: 4000 },
      gbp: { priceId: "price_demo_value_gbp", unitAmount: 3200 },
      eur: { priceId: "price_demo_value_eur", unitAmount: 3700 },
    },
    type: "one_time",
  },
  {
    stripeProductId: "prod_demo_mega",
    name: "Sogverse Mega Pack",
    description: "40 Sorgs — best value one-time pack",
    tokenAmount: 40,
    prices: {
      usd: { priceId: "price_demo_mega_usd", unitAmount: 10000 },
      gbp: { priceId: "price_demo_mega_gbp", unitAmount: 8000 },
      eur: { priceId: "price_demo_mega_eur", unitAmount: 9200 },
    },
    type: "one_time",
  },
];

const DEMO_SUB_PACKAGES: StripePackage[] = [
  {
    stripeProductId: "prod_demo_basic",
    name: "Sogverse Basic",
    description: "10 Sorgs every month",
    tokenAmount: 10,
    prices: {
      usd: { priceId: "price_demo_basic_usd", unitAmount: 2500 },
      gbp: { priceId: "price_demo_basic_gbp", unitAmount: 2000 },
      eur: { priceId: "price_demo_basic_eur", unitAmount: 2300 },
    },
    type: "subscription",
  },
  {
    stripeProductId: "prod_demo_standard",
    name: "Sogverse Standard",
    description: "25 Sorgs every month",
    tokenAmount: 25,
    prices: {
      usd: { priceId: "price_demo_standard_usd", unitAmount: 5000 },
      gbp: { priceId: "price_demo_standard_gbp", unitAmount: 4000 },
      eur: { priceId: "price_demo_standard_eur", unitAmount: 4600 },
    },
    type: "subscription",
  },
  {
    stripeProductId: "prod_demo_premium",
    name: "Sogverse Premium",
    description: "50 Sorgs every month — best monthly value",
    tokenAmount: 50,
    prices: {
      usd: { priceId: "price_demo_premium_usd", unitAmount: 8500 },
      gbp: { priceId: "price_demo_premium_gbp", unitAmount: 6800 },
      eur: { priceId: "price_demo_premium_eur", unitAmount: 7800 },
    },
    type: "subscription",
  },
];

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function AdminUIComponentsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">UI Components</h1>
        <p className="text-muted-foreground">
          Living style guide &mdash; every component variant, composite pattern,
          and color token used across the app.
        </p>
      </div>

      {/* ============================================================ */}
      {/* Section 1: Color Palette                                      */}
      {/* ============================================================ */}
      <Section title="Color Palette">
        <SubSection title="Brand Colors">
          <div className="flex flex-wrap gap-4">
            <Swatch label="Primary" className="bg-primary" />
            <Swatch label="Secondary" className="bg-secondary" />
            <Swatch label="Destructive" className="bg-destructive" />
            <Swatch label="Success" className="bg-success" />
            <Swatch label="Info" className="bg-info" />
            <Swatch label="Warning" className="bg-warning" />
            <Swatch label="Accent" className="bg-accent" />
          </div>
        </SubSection>

        <SubSection title="Surface Colors">
          <div className="flex flex-wrap gap-4">
            <Swatch label="Background" className="bg-background" />
            <Swatch label="Card" className="bg-card" />
            <Swatch label="Muted" className="bg-muted" />
            <Swatch label="Border" className="bg-border" />
            <Swatch label="Ring" className="bg-ring" />
          </div>
        </SubSection>

        <SubSection title="Text Colors">
          <div className="flex flex-wrap gap-6">
            <span className="text-sm font-medium text-foreground">
              Foreground
            </span>
            <span className="text-sm font-medium text-muted-foreground">
              Muted Foreground
            </span>
            <span className="text-sm font-medium text-primary">Primary</span>
            <span className="text-sm font-medium text-secondary">
              Secondary
            </span>
            <span className="text-sm font-medium text-destructive">
              Destructive
            </span>
            <span className="text-sm font-medium text-success">
              Success
            </span>
            <span className="text-sm font-medium text-info">Info</span>
            <span className="text-sm font-medium text-warning">Warning</span>
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/* Section 2: Buttons                                            */}
      {/* ============================================================ */}
      <Section title="Button">
        <SubSection title="Variants">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="default">Default</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
          </div>
        </SubSection>

        <SubSection title="Sizes">
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button size="default">Default</Button>
            <Button size="lg">Large</Button>
            <Button size="icon">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </SubSection>

        <SubSection title="Disabled">
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled>Default</Button>
            <Button variant="destructive" disabled>
              Destructive
            </Button>
            <Button variant="outline" disabled>
              Outline
            </Button>
            <Button variant="secondary" disabled>
              Secondary
            </Button>
          </div>
        </SubSection>

        <SubSection title="With Icons">
          <div className="flex flex-wrap items-center gap-3">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add
            </Button>
            <Button variant="secondary">
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
            <Button variant="destructive">
              <Trash className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/* Section 3: Badge                                              */}
      {/* ============================================================ */}
      <Section title="Badge">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="default">Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="destructive">Destructive</Badge>
          <Badge variant="outline">Outline</Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-4 mb-2">Role badges</p>
        <div className="flex flex-wrap items-center gap-3">
          {Object.values(ROLE_BADGES).map(({ label, className }) => (
            <Badge key={label} className={className}>{label}</Badge>
          ))}
        </div>

        <p className="text-sm text-muted-foreground mt-4 mb-2">Sorg balance badge (header)</p>
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex flex-col items-center gap-1.5">
            <span className="flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-sm font-medium">
              <Coins className="h-4 w-4 text-primary" />
              <span>125</span>
            </span>
            <span className="text-xs text-muted-foreground">Default</span>
          </div>
        </div>
      </Section>

      {/* ============================================================ */}
      {/* Section 4: Input & Label                                      */}
      {/* ============================================================ */}
      <Section title="Input & Label">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="demo-default">Default</Label>
            <Input id="demo-default" placeholder="Placeholder text..." />
          </div>

          <div className="space-y-2">
            <Label htmlFor="demo-value">With Value</Label>
            <Input id="demo-value" defaultValue="Hello world" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="demo-disabled">Disabled</Label>
            <Input id="demo-disabled" disabled placeholder="Cannot edit" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="demo-file">File Input</Label>
            <Input id="demo-file" type="file" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="demo-search">With Search Icon</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="demo-search"
                placeholder="Search..."
                className="pl-10"
              />
            </div>
          </div>
        </div>
      </Section>

      {/* ============================================================ */}
      {/* Section 6: Avatar & Identicon                                 */}
      {/* ============================================================ */}
      <Section title="Avatar & Identicon">
        <SubSection title="Identicons (different IDs)">
          <div className="flex flex-wrap items-center gap-4">
            {[
              { id: "4babfc78-d197-496e-860d-48f1207f5bc6", name: "ShadowFox99" },
              { id: "1a54d62e-828f-4a42-89f1-cc36185351b0", name: "JääKarhu" },
              { id: "19ffd6e5-2e78-4742-a65f-6ed40b2b8b47", name: "NovaBlitz" },
              { id: "ff42551b-933b-4c37-9971-7fdbbeed0385", name: "TuliKettu42" },
              { id: "1d589613-5fb0-4692-bcf1-029f8fc16b99", name: "PixelRogue" },
            ].map(({ id, name }) => (
              <div key={id} className="flex flex-col items-center gap-1.5">
                <Avatar>
                  <Identicon id={id} />
                </Avatar>
                <span className="text-xs text-muted-foreground">{name}</span>
              </div>
            ))}
          </div>
        </SubSection>

        <SubSection title="Size Comparison">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col items-center gap-1.5">
              <Avatar>
                <Identicon id="e3248221-170c-472f-ab56-eb60f1261966" />
              </Avatar>
              <span className="text-xs text-muted-foreground">
                Default (40px)
              </span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <Avatar className="h-12 w-12">
                <Identicon id="e3248221-170c-472f-ab56-eb60f1261966" size={48} />
              </Avatar>
              <span className="text-xs text-muted-foreground">48px</span>
            </div>
          </div>
        </SubSection>

        <SubSection title="Voice Room Avatar (speaking glow)">
          <VoiceAvatarDemo />
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/* Section 7: Alert                                              */}
      {/* ============================================================ */}
      <Section title="Alert">
        <SubSection title="Variants">
          <div className="space-y-3 max-w-lg">
            <Alert>
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <AlertTitle>Default</AlertTitle>
                <AlertDescription>
                  A neutral informational alert for general messages.
                </AlertDescription>
              </div>
            </Alert>
            <Alert variant="success">
              <Check className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <AlertTitle>Success</AlertTitle>
                <AlertDescription>
                  Profile updated successfully!
                </AlertDescription>
              </div>
            </Alert>
            <Alert variant="destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <AlertTitle>Destructive</AlertTitle>
                <AlertDescription>
                  Something went wrong. Please try again.
                </AlertDescription>
              </div>
            </Alert>
            <Alert variant="info">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <AlertTitle>Info</AlertTitle>
                <AlertDescription>
                  Your session will expire in 5 minutes.
                </AlertDescription>
              </div>
            </Alert>
            <Alert variant="warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <AlertTitle>Warning</AlertTitle>
                <AlertDescription>
                  Tokens have monetary value. Double-check before adjusting.
                </AlertDescription>
              </div>
            </Alert>
          </div>
        </SubSection>

        <SubSection title="Without Title">
          <div className="space-y-3 max-w-lg">
            <Alert variant="success">
              <Check className="mt-0.5 h-4 w-4 shrink-0" />
              <AlertDescription>Profile updated successfully!</AlertDescription>
            </Alert>
            <Alert variant="destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <AlertDescription>Something went wrong. Please try again.</AlertDescription>
            </Alert>
          </div>
        </SubSection>

        <SubSection title="Centered (banners)">
          <div className="space-y-3 max-w-lg">
            <Alert variant="success" align="center">
              <Check className="h-4 w-4 shrink-0" />
              <AlertDescription>Purchase successful!</AlertDescription>
            </Alert>
            <Alert variant="warning" align="center">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <AlertDescription>Purchase canceled. No charges were made.</AlertDescription>
            </Alert>
            <Alert variant="destructive" align="center">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <AlertDescription>Something went wrong starting checkout. Please try again.</AlertDescription>
            </Alert>
          </div>
        </SubSection>

        <SubSection title="Icon Circles">
          <div className="flex flex-wrap gap-6">
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
                <Check className="h-8 w-8 text-success" />
              </div>
              <span className="text-xs text-muted-foreground">
                bg-success/10 + text-success
              </span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                <AlertCircle className="h-8 w-8 text-destructive" />
              </div>
              <span className="text-xs text-muted-foreground">
                bg-destructive/10 + text-destructive
              </span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-info/10">
                <Info className="h-8 w-8 text-info" />
              </div>
              <span className="text-xs text-muted-foreground">
                bg-info/10 + text-info
              </span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-warning/10">
                <AlertTriangle className="h-8 w-8 text-warning" />
              </div>
              <span className="text-xs text-muted-foreground">
                bg-warning/10 + text-warning
              </span>
            </div>
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/* Section 8: Dialog                                              */}
      {/* ============================================================ */}
      <DialogDemo />

      {/* ============================================================ */}
      {/* Section 8b: Switch to Gamer Dialog                            */}
      {/* ============================================================ */}
      <SwitchToGamerDialogDemo />

      {/* ============================================================ */}
      {/* Section 9: Participant Card                                   */}
      {/* ============================================================ */}
      <Section title="Participant Card">
        <SubSection title="Voice Room Participant List">
          <p className="text-sm text-muted-foreground mb-3">
            Shows avatar, name, volume slider, moderator controls (for non-owner remote participants), and status indicators.
            Lock buttons toggle between ghost/destructive variants. Used in voice room sidebar.
          </p>
          <ParticipantCardDemo />
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/* Section 10: Composite Patterns                                */}
      {/* ============================================================ */}
      <Section title="Composite Patterns">
        {/* -- Product Row (admin/products) -- */}
        <SubSection title="Product Row (admin/products)">
          <p className="text-sm text-muted-foreground mb-3">
            Reusable product list row with image, schedule, price, and metadata. ChevronRight signals clickability. Used in admin/products.
          </p>
          <ProductRowDemo />
        </SubSection>

        {/* -- Gamer Card (customer/gamers) -- */}
        <SubSection title="Gamer Card (customer/gamers)">
          <p className="text-sm text-muted-foreground mb-3">
            Card shown to parents on their gamers list. Wrap in a Link for navigation. Used in customer/gamers.
          </p>
          <div className="space-y-4">
            <GamerCard
              id="8e86d931-500c-49ed-889d-c2cd10879a28"
              displayName="MyrskySusi"
              username="myrskysusi"
              subtitle="Joined 3 days ago"
            />
            <GamerCard
              id="5aec0f5a-5398-46d7-a150-3554cf701beb"
              displayName="CrimsonArrow"
              username="crimsonarrow"
              subtitle="Joined 2 weeks ago"
            />
          </div>
        </SubSection>

        {/* -- User Row (admin/users) -- */}
        <SubSection title="User Row (admin/users)">
          <p className="text-sm text-muted-foreground mb-3">
            Row showing a user with role badge, optional nested gamers. Used in admin/users.
          </p>
          <div className="space-y-4">
            <UserRow
              user={{ id: "a1b2c3d4-0000-0000-0000-000000000001", display_name: "Jane Parent", username: "janeparent", email: "jane@example.com", role: "customer" }}
              linkedGamers={[
                { id: "8e86d931-500c-49ed-889d-c2cd10879a28", display_name: "MyrskySusi", username: "myrskysusi", email: null, role: "gamer" },
                { id: "5aec0f5a-5398-46d7-a150-3554cf701beb", display_name: "CrimsonArrow", username: "crimsonarrow", email: null, role: "gamer" },
              ]}
            />
            <UserRow
              user={{ id: "a1b2c3d4-0000-0000-0000-000000000002", display_name: "Sam Gedu", username: "samgedu", email: "sam@example.com", role: "gedu" }}
            />
          </div>
        </SubSection>

        {/* -- Stat Card (admin dashboard) -- */}
        <SubSection title="Stat Card (admin dashboard)">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                title: "Total Users",
                value: "128",
                description: "Active accounts",
                icon: Users,
              },
              {
                title: "Products",
                value: "24",
                description: "Active products",
                icon: Package,
              },
              {
                title: "Revenue",
                value: "$4,320",
                description: "This month",
                icon: DollarSign,
              },
              {
                title: "Growth",
                value: "+12%",
                description: "From last month",
                icon: TrendingUp,
              },
            ].map((stat) => (
              <Card
                key={stat.title}
                className="group transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {stat.title}
                  </CardTitle>
                  <stat.icon className="h-4 w-4 text-muted-foreground group-hover:text-accent-foreground/70" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <p className="text-xs text-muted-foreground group-hover:text-accent-foreground/70">
                    {stat.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </SubSection>

        {/* -- Token Balance Card -- */}
        <SubSection title="Token Balance Card (customer/sorg)">
          <TokenBalanceCard />
        </SubSection>

        {/* -- Package Cards (Sorg purchase) -- */}
        <SubSection title="Package Cards (sorg purchase)">
          <p className="text-sm text-muted-foreground mb-3">
            Dynamically rendered from Stripe Products. Two sections: one-time packs and monthly subscriptions, sorted cheapest to most expensive. Cards show savings badge, tier switching for subscribers, and resume action for canceling subscriptions. No icons — keeps the UI clean for any number of dynamic packages.
          </p>
          <TokenPurchaseSection
            oneTimePackages={DEMO_ONE_TIME_PACKAGES}
            subscriptionPackages={DEMO_SUB_PACKAGES}
          />
        </SubSection>

        {/* -- Lounge Card -- */}
        <SubSection title="Lounge Card (shared)">
          <p className="text-sm text-muted-foreground mb-3">
            Banner card for always-open voice lounges. Used on gedu and admin group pages. The join button shows a loading spinner when the href is not yet available.
          </p>
          <div className="space-y-3">
            <LoungeCard
              name="Gedu Lounge"
              description="Connect with other educators anytime"
              joinHref="#"
            />
            <LoungeCard
              name="Admin Lounge"
              description="Private admin voice channel"
              joinHref={null}
            />
          </div>
        </SubSection>

        {/* -- Group Card -- */}
        <SubSection title="Group Card (shared)">
          <p className="text-sm text-muted-foreground mb-3">
            Shared group card used across all roles. Shows product name, gamer count, schedule, and voice status. Self-updating countdown ticks every 60s. Clicking the card navigates to a detail page; the Join button navigates to the voice session.
          </p>
          <GroupCardDemo />
        </SubSection>

        {/* -- Loading Skeleton -- */}
        <SubSection title="Loading Skeleton">
          <div className="space-y-4">
            {[1, 2].map((i) => (
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
        </SubSection>
      </Section>

    </div>
  );
}
