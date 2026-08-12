/* eslint-disable i18next/no-literal-string -- internal admin-only style guide; all content is copy-paste component examples, not user-facing text that ships in any locale */
"use client";

import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Plus,
  Pencil,
  Trash,
  Users,
  Package,
  TrendingUp,
  DollarSign,
  Check,
  AlertCircle,
  AlertTriangle,
  Info,
} from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ROLE_BADGE_STYLES, ROUTES } from "@/lib/constants";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/ui/field";
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
import { MaterialLink } from "@/components/ui/material-link";
import {
  PersonChip,
  PersonChipList,
  type PersonChipListPerson,
} from "@/components/ui/person-chip";
import { VoiceAvatar } from "@/components/voice/VoiceAvatar";
import { ParticipantRow, type ParticipantRowData } from "@/components/voice/ParticipantRow";
import { SwitchProfileDialog } from "@/components/family/SwitchProfileDialog";
import { UserRow } from "@/components/admin/user-row";
import { EnrollmentCard } from "@/components/family/EnrollmentCard";
import {
  FIXTURE_TIMEZONE,
  buildEnrollmentFixture,
  type EnrollmentFixtureSpec,
  type FixtureClock,
} from "@/components/family/mock-enrollment-fixtures";
import { futureSlot, liveNowSlot } from "@/components/preview/fixture-clock";
import { SESSION_FEED_ADULT_ID } from "@/components/gedu/session-feed/mock-fixtures";
import { useAuth, useNow, useTimezone } from "@/providers";
import { useLocale } from "next-intl";
import { resolveLocale } from "@/lib/constants/locales";
import { computeGlowStyle } from "@/lib/voice/glow";
import { composeZones } from "@/lib/voice/zone-composition";
import { ZoneList } from "@/components/voice/ZoneList";
import { VoiceRoomContext } from "@/components/voice/VoiceRoomProvider";
import type {
  VoiceRoomContextValue,
  VoiceParticipant,
} from "@/components/voice/hooks/types";
import type { VoiceZone } from "@/types";
import {
  LocationPickerPanel,
  type LocationChainSummary,
  type LocationPick,
  type LocationSummary,
} from "@/components/locations/location-picker-panel";
import { HomeLocationField } from "@/components/locations/home-location-field";
import { ProductBrowseCardView } from "@/components/public/products/product-browse-card-view";
import { useBrowseCardViewProps } from "@/components/public/products/product-browse-card";
import { SeatAvailabilityBar } from "@/components/public/products/seat-availability-bar";
import {
  buildBrowseCounts,
  buildScenarioFixture,
  PREVIEW_SCENARIOS,
  type PreviewScenario,
} from "@/components/public/products/mock-detail-fixtures";
import {
  ManageBillingCardView,
  type BillingAccountSummary,
} from "@/components/billing";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import {
  GAME_PLATFORMS,
  GameUsernameEditableRow,
  GameUsernameRow,
  type GameFigure,
  type GamePlatform,
} from "@/components/game-account";
import { useRobloxProfile } from "@/services/roblox";
import { ParticipantChip } from "@/components/admin/products/groups/participant-chip";
import { DndContext } from "@dnd-kit/core";
import { AddGamerFormCard } from "@/components/family";
import { cn } from "@/lib/utils";

/**
 * Chip demo people. Real generated UUIDv4s, hardcoded: an identicon is hashed
 * out of the id's hex bytes, so a readable stand-in renders an empty square and
 * a generated one gives the same person a different face on every reload.
 */
const PERSON_CHIP_PEOPLE: readonly PersonChipListPerson[] = [
  { id: "8f6f0242-a296-4f05-a046-c7a6f26c8962", name: "Sanna" },
  { id: "65884374-5a68-4b8c-83bb-dbeb60fe39c2", name: "Petra" },
  { id: "5a880b4d-b6a7-46b3-afcc-49e445c650e4", name: "Joonas" },
  { id: "60e43688-3e84-43a3-9e57-1be908284716", name: "Markus" },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Lets SubSection prefix its anchor id with the parent Section's slug, so
// duplicated subsection titles (e.g. "Variants" under both Button and Badge)
// don't collide.
const SectionSlugContext = createContext<string | null>(null);

function AnchorHeading({
  as,
  id,
  className,
  children,
}: {
  as: "h2" | "h3";
  id: string;
  className: string;
  children: React.ReactNode;
}) {
  const Tag = as;
  return (
    <Tag id={id} className={`group scroll-mt-[calc(var(--header-height)+1rem)] ${className}`}>
      <a
        href={`#${id}`}
        className="inline-flex items-center gap-2 hover:underline"
      >
        {children}
        <span
          aria-hidden
          className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
        >
          #
        </span>
      </a>
    </Tag>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const slug = slugify(title);
  return (
    <SectionSlugContext.Provider value={slug}>
      <section className="space-y-4">
        <AnchorHeading as="h2" id={slug} className="text-2xl font-bold">
          {title}
        </AnchorHeading>
        <div className="rounded-lg border p-6 space-y-6">{children}</div>
      </section>
    </SectionSlugContext.Provider>
  );
}

function SubSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const parentSlug = useContext(SectionSlugContext);
  const slug = parentSlug ? `${parentSlug}-${slugify(title)}` : slugify(title);
  return (
    <div className="space-y-3">
      <AnchorHeading
        as="h3"
        id={slug}
        className="text-sm font-semibold text-muted-foreground uppercase tracking-wider"
      >
        {title}
      </AnchorHeading>
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
      <VoiceAvatar
        userId={profile?.id || user?.id || "demo"}
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
            <Checkbox
              checked={micOn}
              onChange={(e) => setMicOn(e.target.checked)}
            />
            Mic on
          </label>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={cameraOn}
              onChange={(e) => setCameraOn(e.target.checked)}
            />
            Camera on
          </label>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Checkbox Demo                                                      */
/* ------------------------------------------------------------------ */

function CheckboxDemo() {
  const [agreed, setAgreed] = useState(true);
  const [newsletter, setNewsletter] = useState(false);
  const [boxed, setBoxed] = useState(true);

  return (
    <>
      <SubSection title="States">
        <div className="flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={newsletter}
              onChange={(e) => setNewsletter(e.target.checked)}
            />
            Unchecked / checked (toggle me)
          </label>
          <label className="flex items-center gap-2 text-sm cursor-not-allowed opacity-60">
            <Checkbox checked={false} disabled />
            Disabled
          </label>
          <label className="flex items-center gap-2 text-sm cursor-not-allowed opacity-60">
            <Checkbox checked disabled />
            Disabled (checked)
          </label>
        </div>
      </SubSection>

      <SubSection title="Multi-line label — top-aligned with mt-0.5">
        <label className="flex max-w-md items-start gap-2 text-xs cursor-pointer">
          <Checkbox
            className="mt-0.5"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          <span className="text-muted-foreground">
            By registering I agree to the program rules and the cancellation
            policy. This label wraps onto multiple lines, so the box pins to the
            first line rather than centering on the whole block.
          </span>
        </label>
      </SubSection>

      <SubSection title="Boxed gate — reacts to checked state (signup panel pattern)">
        <label
          className={`flex max-w-md cursor-pointer items-start gap-3 rounded-md border p-3 text-xs transition-colors ${
            boxed
              ? "border-primary bg-primary/5"
              : "border-input hover:bg-accent/50"
          }`}
        >
          <Checkbox
            className="mt-0.5"
            checked={boxed}
            onChange={(e) => setBoxed(e.target.checked)}
          />
          <span className="text-muted-foreground">
            The container border lights to primary once checked, giving the
            required agreement visible weight instead of reading as fine print.
          </span>
        </label>
      </SubSection>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Dialog Demo                                                        */
/* ------------------------------------------------------------------ */

function SwitchProfileDialogDemo() {
  const [open, setOpen] = useState(false);

  return (
    <Section title="Switch Profile Dialog">
      <SubSection title="Confirm an account switch (parent ↔ gamer)">
        <p className="text-sm text-muted-foreground mb-3">
          Shown when a parent clicks &ldquo;Join&rdquo; on a voice session, or a gamer clicks
          &ldquo;Add Gamer.&rdquo; Uses info color to signal an attention-worthy auth action. The
          avatar tile is the CTA — clicking it swaps the session then full-page navigates.
        </p>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Open Switch Dialog
        </Button>
        <SwitchProfileDialog
          open={open}
          onOpenChange={setOpen}
          target={{ id: "7d0cf9eb-2567-4ec8-a883-2e67b9138a98", role: "gamer", first_name: "Aino" }}
          redirectUrl="#"
          title="Switch to Aino's profile to join Minecraft Club?"
          oneWayWarning="You'll be signed out of your parent account."
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

// Roles + Minecraft fields exercise every identity state: gedu/gamer rows show
// the compact identity row (verified / unverified / "(Unknown)"), while
// non-gedu/gamer rows (and rows with `minecraftUsername === undefined`) show
// none. Five of them, because the point of the compact figure is density —
// one row cannot show whether a list breathes.
const DEMO_PARTICIPANTS = [
  {
    userId: "4babfc78-d197-496e-860d-48f1207f5bc6",
    userName: "Emma",
    role: "gedu",
    // Verified — username + uuid.
    minecraftUsername: "ShadowFox99",
    minecraftUuid: "8f3a1c92-77de-4b01-9c2e-a1b2c3d4e5f6",
    isLocal: true,
    isOwner: true,
    audioOn: true,
    videoOn: false,
  },
  {
    userId: "1a54d62e-828f-4a42-89f1-cc36185351b0",
    userName: "Aino",
    role: "gamer",
    // Entered but unverified — username only.
    minecraftUsername: "JaaKarhu",
    minecraftUuid: null,
    isLocal: false,
    isOwner: false,
    audioOn: true,
    videoOn: true,
  },
  {
    userId: "19ffd6e5-2e78-4742-a65f-6ed40b2b8b47",
    userName: "Oliver",
    role: "gamer",
    // Linked-but-unset — renders the muted "(Unknown)" badge.
    minecraftUsername: null,
    minecraftUuid: null,
    isLocal: false,
    isOwner: false,
    audioOn: false,
    videoOn: false,
  },
  {
    userId: "8661f882-c470-4225-934d-b7330e6867d1",
    userName: "Väinö",
    role: "gedu",
    minecraftUsername: "DarkPhoenixRising",
    minecraftUuid: "2b7c4d1e-90ab-4f56-8c3d-e1f2a3b4c5d6",
    isLocal: false,
    isOwner: true,
    audioOn: true,
    videoOn: true,
  },
  {
    userId: "6f6a6faf-f556-43cd-8ffe-87a0573e68b5",
    userName: "Sofia",
    role: "gamer",
    minecraftUsername: "GalaxyDestroyer9000",
    minecraftUuid: "5e8f2349-67ab-4c12-9d3e-a1b2c3d4e5f6",
    isLocal: false,
    isOwner: false,
    audioOn: true,
    videoOn: false,
  },
  {
    // A parent on their own seat — the imported id IS the gedu roster
    // fixtures' Marja, so she wears one face everywhere by construction
    // rather than by a copied literal. Her identity slot carries the shared
    // Parent badge where a child's row shows the Minecraft identity — the
    // adult-variant grammar the rosters established, decided by the owner
    // after judging the unbadged treatment in this very demo. No game
    // identity: parents cannot link game accounts, by scope decision.
    userId: SESSION_FEED_ADULT_ID,
    userName: "Marja",
    role: "customer",
    minecraftUsername: null,
    minecraftUuid: null,
    isLocal: false,
    isOwner: false,
    audioOn: true,
    videoOn: false,
  },
] satisfies ParticipantRowData[];

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

// Mock provider context driving the discrete-zone voice UI with fixtures — no
// live Daily call. Because the voice components are pure consumers of
// VoiceRoomContext, this drives them identically to the real provider.
function VoiceZonesDemo() {
  const customZones: VoiceZone[] = [
    {
      id: "demo-strategy",
      group_id: "demo",
      name: "Strategy corner",
      icon: "rocket",
      color: "teal",
      is_locked: false,
      sort_order: 0,
      created_by: "demo",
      created_at: "2026-06-16T10:00:00Z",
      updated_at: "2026-06-16T10:00:00Z",
    },
    {
      id: "demo-quiet",
      group_id: "demo",
      name: "Quiet room",
      icon: "ghost",
      color: "indigo",
      is_locked: true,
      sort_order: 1,
      created_by: "demo",
      created_at: "2026-06-16T10:00:00Z",
      updated_at: "2026-06-16T10:00:00Z",
    },
    {
      // Unnamed zone — identified by icon + color alone (name is optional).
      id: "demo-unnamed",
      group_id: "demo",
      name: null,
      icon: "flame",
      color: "orange",
      is_locked: false,
      sort_order: 2,
      created_by: "demo",
      created_at: "2026-06-16T10:00:00Z",
      updated_at: "2026-06-16T10:00:00Z",
    },
  ];
  const zones = composeZones(customZones, "demo");

  const member = (
    over: Pick<VoiceParticipant, "sessionId" | "userId" | "userName" | "zoneId"> &
      Partial<VoiceParticipant>,
  ): VoiceParticipant => ({
    role: "gamer",
    audioOn: true,
    videoOn: false,
    screenShareOn: false,
    isLocal: false,
    isOwner: false,
    isSpeaking: false,
    isBroadcasting: false,
    ...over,
  });

  // Real random UUIDs: the identicon hashes the id, so placeholder ids like
  // "u1" render degenerate avatars that don't represent the real UI.
  const participants: VoiceParticipant[] = [
    member({ sessionId: "s1", userId: "1fc70377-0a73-4c36-b6c3-5cad0643748c", userName: "You", zoneId: "lobby", isLocal: true, role: "admin", isOwner: true }),
    member({ sessionId: "s2", userId: "fea034bc-7e25-4b75-976a-0e567b993279", userName: "Aino", zoneId: "lobby" }),
    member({ sessionId: "s3", userId: "6ee45509-c687-4d8b-88a8-e933929555e8", userName: "Eero", zoneId: "yty-glow", isSpeaking: true }),
    member({ sessionId: "s4", userId: "82d61f2c-636f-4cfb-bcd3-9f35b366229e", userName: "Liisa", zoneId: "demo-strategy" }),
    // A very crowded zone (25) so the horizontal scroll, chevron scroll buttons,
    // and edge fade are all exercised. Mixed English/Finnish names, with a few
    // long ones (Maximilian, Aleksanteri, …) to show label truncation.
    // Six muted members in Valor so the mic-off badge is visible in the demo.
    member({ sessionId: "s5", userId: "6421f24d-01b3-47eb-a229-38b29c438715", userName: "Aino", zoneId: "yty-valor", audioOn: false }),
    member({ sessionId: "s6", userId: "c4d53024-4d40-4c2a-9bad-44909fdc333b", userName: "Oliver", zoneId: "yty-valor", audioOn: false }),
    member({ sessionId: "s7", userId: "a1df031a-f181-49f3-a964-4039d8546ee4", userName: "Väinö", zoneId: "yty-valor", isSpeaking: true }),
    member({ sessionId: "s8", userId: "9c6f8a84-daa0-424f-a0a8-dd1af4fc3fbd", userName: "Charlotte", zoneId: "yty-valor", audioOn: false }),
    member({ sessionId: "s9", userId: "10b01f6c-e047-4d61-b5f0-bb80f4ec4a55", userName: "Onni", zoneId: "yty-valor", audioOn: false }),
    member({ sessionId: "s10", userId: "1620ec58-cc23-4a3f-b3ea-3880b12d19bf", userName: "James", zoneId: "yty-valor", audioOn: false }),
    member({ sessionId: "s11", userId: "b4af1059-f201-4718-8a1b-fa81e51c48d6", userName: "Helmi", zoneId: "yty-valor", audioOn: false }),
    member({ sessionId: "s12", userId: "c7d3368f-75bd-4841-bb1f-0ccd7b01d365", userName: "Maximilian", zoneId: "yty-valor" }),
    member({ sessionId: "s13", userId: "85b79539-938a-4787-96b6-40d85b53c923", userName: "Veera", zoneId: "yty-valor" }),
    member({ sessionId: "s14", userId: "3f323fe9-a59f-4444-8a2b-77a6ec310153", userName: "Benjamin", zoneId: "yty-valor" }),
    member({ sessionId: "s15", userId: "a75793f5-b793-44f0-a85e-3f91d19523c3", userName: "Aarni", zoneId: "yty-valor" }),
    member({ sessionId: "s16", userId: "1941c285-0589-4d4d-b23d-a7b1b9aa01f0", userName: "Sophia", zoneId: "yty-valor" }),
    member({ sessionId: "s17", userId: "dc3a240c-0397-4300-bbbe-23c56f0287b3", userName: "Niilo", zoneId: "yty-valor" }),
    member({ sessionId: "s18", userId: "147929ab-93ab-4a24-9d31-8786e14fe771", userName: "Alexandra", zoneId: "yty-valor" }),
    member({ sessionId: "s19", userId: "2fbddcc4-f8e0-4bf9-b59c-9ac975e54086", userName: "Iiro", zoneId: "yty-valor" }),
    member({ sessionId: "s20", userId: "3ee04404-1425-4af8-a027-9cfa925f6273", userName: "William", zoneId: "yty-valor" }),
    member({ sessionId: "s21", userId: "859834f2-89b4-4902-8ae9-ae3d3dbfd3e0", userName: "Eveliina", zoneId: "yty-valor" }),
    member({ sessionId: "s22", userId: "b039e677-6e77-4cf3-af9d-bd5e5c2fabbc", userName: "Liam", zoneId: "yty-valor" }),
    member({ sessionId: "s23", userId: "bc17a11c-48f3-46c7-90dd-f1d01da20456", userName: "Aleksanteri", zoneId: "yty-valor" }),
    member({ sessionId: "s24", userId: "bc5b1c08-6b0d-4265-af42-cf42e12d98da", userName: "Isabella", zoneId: "yty-valor" }),
    member({ sessionId: "s25", userId: "2330764b-f7e5-483a-875d-691532be11e5", userName: "Pinja", zoneId: "yty-valor" }),
    member({ sessionId: "s26", userId: "156922f3-8a32-48d6-b7ea-7c8de8b07440", userName: "Matias", zoneId: "yty-valor" }),
    member({ sessionId: "s27", userId: "a094598f-8ab8-4787-83ff-849e0653a58a", userName: "Tuuli", zoneId: "yty-valor" }),
    member({ sessionId: "s28", userId: "720504a5-4d6f-496b-b2a1-038fc5c6bc45", userName: "Kaarina", zoneId: "yty-valor" }),
    member({ sessionId: "s29", userId: "35d24824-26c7-417b-9b6b-32798e1bfe57", userName: "Theodore", zoneId: "yty-valor" }),
    // Two confined to the private zone. In the real app their media is
    // SFU-blocked for outsiders (canReceive) — here they're just members of the
    // locked zone, rendered blurred behind the PrivacyScreen for an outsider.
    member({ sessionId: "s30", userId: "791c29d1-e2c0-4a9f-bcc8-9d888bf72610", userName: "Onni", zoneId: "demo-quiet" }),
    member({ sessionId: "s31", userId: "86592793-36ad-4247-a942-f2386cd27b43", userName: "Venla", zoneId: "demo-quiet" }),
  ];

  const participantsByZone = new Map<string, VoiceParticipant[]>();
  for (const z of zones) participantsByZone.set(z.id, []);
  for (const p of participants) participantsByZone.get(p.zoneId)?.push(p);

  const noop = () => {};
  const asyncNoop = async () => {};

  const value: VoiceRoomContextValue = {
    joined: true,
    joining: false,
    callObject: null,
    localSessionId: "s1",
    localRole: "admin",
    isModerator: true,
    groupId: "demo",
    participants,
    zones,
    customZones,
    currentZoneId: "lobby",
    participantsByZone,
    moveSelfToZone: noop,
    moveParticipantToZone: noop,
    createZone: asyncNoop,
    updateZone: asyncNoop,
    deleteZone: asyncNoop,
    micOn: true,
    cameraOn: false,
    cameraAllowed: true,
    toggleMic: noop,
    toggleCamera: noop,
    screenSharerSessionId: null,
    canScreenShare: true,
    isScreenSharing: false,
    startScreenShare: asyncNoop,
    stopScreenShare: noop,
    isBroadcasting: false,
    toggleBroadcast: noop,
    isDeafened: false,
    toggleDeafen: noop,
    audioInputs: [],
    currentAudioInputId: null,
    setAudioInput: asyncNoop,
    mediaError: null,
    localLocks: { audio: false, video: false },
    lockStates: new Map(),
    muteParticipant: noop,
    lockParticipant: noop,
    getAnalyser: () => null,
    messages: [],
    sendChatMessage: noop,
    join: asyncNoop,
    leave: asyncNoop,
  };

  return (
    <VoiceRoomContext.Provider value={value}>
      <div className="max-w-sm">
        <ZoneList />
      </div>
    </VoiceRoomContext.Provider>
  );
}

function ParticipantCardDemo() {
  const [locks, setLocks] = useState<Record<string, { audio: boolean; video: boolean }>>({
    "19ffd6e5-2e78-4742-a65f-6ed40b2b8b47": { audio: true, video: false },
  });

  // Refs for simulated speaking glow — one per participant, and the count is
  // load-bearing: hooks can't loop, so a fixture row without its ref + glow
  // call silently renders audio-on with no pulse (which is how the parent row
  // shipped glow-less for a day).
  const ref0 = useRef<HTMLDivElement>(null);
  const ref1 = useRef<HTMLDivElement>(null);
  const ref2 = useRef<HTMLDivElement>(null);
  const ref3 = useRef<HTMLDivElement>(null);
  const ref4 = useRef<HTMLDivElement>(null);
  const ref5 = useRef<HTMLDivElement>(null);
  const avatarRefs = [ref0, ref1, ref2, ref3, ref4, ref5];

  useSimulatedGlow(ref0, DEMO_PARTICIPANTS[0].audioOn, 0);
  useSimulatedGlow(ref1, DEMO_PARTICIPANTS[1].audioOn, 2.1);
  useSimulatedGlow(ref2, DEMO_PARTICIPANTS[2].audioOn, 4.2);
  useSimulatedGlow(ref3, DEMO_PARTICIPANTS[3].audioOn, 6.3);
  useSimulatedGlow(ref4, DEMO_PARTICIPANTS[4].audioOn, 1.4);
  useSimulatedGlow(ref5, DEMO_PARTICIPANTS[5].audioOn, 3.6);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">
          Participants ({DEMO_PARTICIPANTS.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {DEMO_PARTICIPANTS.map((p, i) => {
          const lockState = locks[p.userId] ?? { audio: false, video: false };
          return (
            <ParticipantRow
              key={p.userId}
              participant={p}
              lockState={lockState}
              isModView
              avatarRef={avatarRefs[i]}
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
/*  Family — Enrollment Card                                            */
/* ------------------------------------------------------------------ */

/**
 * Every state the enrollment card can be in, side by side.
 *
 * It earns a style-guide section rather than a preview scene because it is the
 * one component both family dashboards are built out of: no single page owns
 * it, and no page shows more than a few of its states at once. The two
 * dashboards' own scenes are still where it gets judged *in place* — this is
 * where the states get judged against each other.
 *
 * **Three audiences, and that is the second reason this section exists.** Two
 * of the footers on this card have three wordings — a parent reading about
 * their child, the child reading about themselves, and a parent reading about a
 * seat of their own — and a page can only ever be one of the three. Stacked
 * here they can be read one after another, which is the only way to tell
 * whether the three actually say the same thing.
 *
 * The fixtures go through `buildEnrollmentFixture`, the same builder the two
 * dashboard scenes use, so the schedule sentence and the next session are the
 * real derivations rather than authored prose: the live card's Join is lit
 * because its slot genuinely started twenty-five minutes ago, and the locked
 * one's label names a time the shared clock will actually reach.
 */
const ENROLLMENT_DEMO_SITE = "Kirjasto Oodi, Helsinki";

function EnrollmentCardDemo() {
  const now = useNow();
  const locale = resolveLocale(useLocale());
  const timeZone = useTimezone();

  // Built once from the first tick, for the reason the dashboard scenes hold
  // theirs: re-deriving every slot from a new `now` every thirty seconds would
  // walk the schedule text forward under whoever is reading it. What still
  // follows the clock is what each card derives from `useNow()` itself — the
  // Live badge and the voice window, which is the half that should.
  const [cards] = useState(() => {
    const clock: FixtureClock = { now, locale, timeZone };
    const build = (spec: EnrollmentFixtureSpec) =>
      buildEnrollmentFixture(clock, spec);
    const remoteClub = {
      productType: "consumer_club",
      isRemote: true,
      startedDaysAgo: 42,
      endsInDays: null,
    } as const;

    return {
      live: build({
        ...remoteClub,
        participationId: "demo-enrollment-live",
        productName: "Minecraft Explorers Club",
        slots: [liveNowSlot(now, 90, FIXTURE_TIMEZONE)],
      }),
      locked: build({
        ...remoteClub,
        participationId: "demo-enrollment-locked",
        productName: "Rocket League Club",
        slots: [futureSlot(now, 3, "17:00", 90, FIXTURE_TIMEZONE)],
      }),
      badged: build({
        ...remoteClub,
        participationId: "demo-enrollment-badged",
        productName: "Roblox Studio Club",
        slots: [futureSlot(now, 2, "16:30", 90, FIXTURE_TIMEZONE)],
        paymentProblem: true,
      }),
      cancelled: build({
        ...remoteClub,
        participationId: "demo-enrollment-cancelled",
        productName: "Stardew Valley Co-op Club",
        slots: [futureSlot(now, 4, "16:00", 90, FIXTURE_TIMEZONE)],
        cancelledAccessInDays: 12,
      }),
      // The same state a few days later, once the window has no session left
      // in it. Its own demo because the line renders differently rather than
      // just later: the card is not entitled to name a session it could only
      // have projected backwards, so it states when access ends instead.
      cancelledNoDate: build({
        ...remoteClub,
        participationId: "demo-enrollment-cancelled-no-date",
        productName: "Stardew Valley Co-op Club",
        slots: [futureSlot(now, 4, "16:00", 90, FIXTURE_TIMEZONE)],
        cancelledAccessInDays: 5,
        cancelledWithNoSessionLeft: true,
      }),
      awaiting: build({
        ...remoteClub,
        participationId: "demo-enrollment-awaiting",
        productName: "Terraria Builders Club",
        slots: [futureSlot(now, 5, "18:00", 90, FIXTURE_TIMEZONE)],
        startedDaysAgo: 1,
        awaiting: true,
      }),
      waitlisted: build({
        ...remoteClub,
        participationId: "demo-enrollment-waitlisted",
        productName: "Valheim Survival Club",
        slots: [futureSlot(now, 6, "15:00", 90, FIXTURE_TIMEZONE)],
        waitlistPosition: 3,
      }),
      inPerson: build({
        participationId: "demo-enrollment-in-person",
        productName: "Cosmic Builders Camp",
        productType: "camp",
        isRemote: false,
        slots: [futureSlot(now, 2, "10:00", 300, FIXTURE_TIMEZONE)],
        startedDaysAgo: 1,
        endsInDays: 4,
        siteName: ENROLLMENT_DEMO_SITE,
      }),
      finished: build({
        participationId: "demo-enrollment-finished",
        productName: "Summer Speedrun Camp",
        productType: "camp",
        isRemote: true,
        slots: [futureSlot(now, 2, "10:00", 300, FIXTURE_TIMEZONE)],
        startedDaysAgo: 70,
        endsInDays: -35,
      }),
    };
  });

  // A no-op rather than an omitted prop: absent, the leave affordance is not
  // drawn at all, and the demo's whole job on that card is showing that it is.
  // The confirm dialog in front of it is pure UI and works.
  const inert = () => {};

  return (
    <div className="space-y-6">
      <SubSection title="Parent — every state">
        <div className="grid gap-8 lg:grid-cols-2">
          {(
            [
              ["Live — session in progress", cards.live],
              ["Locked — next session named", cards.locked],
              ["Failing card — corner badge", cards.badged],
              ["Cancelled — won't renew line", cards.cancelled],
              [
                "Cancelled, window used up — no date named",
                cards.cancelledNoDate,
              ],
              ["Awaiting placement — no seat yet", cards.awaiting],
              ["Waitlisted — place in line", cards.waitlisted],
              ["In person — venue, no Join", cards.inPerson],
              ["Finished — muted, ended on", cards.finished],
            ] as const
          ).map(([caption, enrollment]) => (
            <div key={enrollment.participationId} className="space-y-2">
              <DemoCaption>{caption}</DemoCaption>
              <EnrollmentCard
                enrollment={enrollment}
                audience="customer"
                gamerFirstName="Aino"
                onOpenPortal={inert}
                onJoinClick={inert}
                onLeaveWaitlist={inert}
              />
            </div>
          ))}
        </div>
      </SubSection>

      <SubSection title="Gamer — the same card, addressed to the child">
        <p className="max-w-prose text-sm text-muted-foreground">
          Only the two footers that speak <em>about</em> a child on the parent&rsquo;s
          page speak <em>to</em> them here, and money is gone entirely: no corner
          badge, no won&rsquo;t-renew line, and no way to give up a place in line
          &mdash; not hidden, but unreachable, because the card&rsquo;s props make
          the parent-only half unavailable to a <code>gamer</code> audience.
        </p>
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-2">
            <DemoCaption>Awaiting placement</DemoCaption>
            <EnrollmentCard enrollment={cards.awaiting} audience="gamer" />
          </div>
          <div className="space-y-2">
            <DemoCaption>Waitlisted</DemoCaption>
            <EnrollmentCard enrollment={cards.waitlisted} audience="gamer" />
          </div>
        </div>
      </SubSection>

      {/* The third audience, and the reason this section is worth having at all
          rather than leaving the card to the dashboard scenes: these two
          footers are the only strings in the product with three wordings, and
          no single page can show more than one of them. Here they sit under the
          other two. */}
      <SubSection title="The parent's own seat — the card about the reader">
        <p className="max-w-prose text-sm text-muted-foreground">
          A for-parents product puts the reader in the seat, so the two footers
          move into the second person again &mdash; and the leave dialog behind
          the waitlist card names nobody, because there is nobody but them to
          name. Money stays, since it is still their card being charged. The
          Join is the invisible difference: this arm has no{" "}
          <code>onJoinClick</code> at all, so it falls back to a plain link
          straight to the room rather than opening the switch-profile dialog a
          child&rsquo;s card opens.
        </p>
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-2">
            <DemoCaption>Live — Join goes straight to the room</DemoCaption>
            <EnrollmentCard
              enrollment={cards.live}
              audience="self"
              onOpenPortal={inert}
            />
          </div>
          <div className="space-y-2">
            <DemoCaption>Awaiting placement</DemoCaption>
            <EnrollmentCard
              enrollment={cards.awaiting}
              audience="self"
              onOpenPortal={inert}
            />
          </div>
          <div className="space-y-2">
            <DemoCaption>Waitlisted — the dialog names nobody</DemoCaption>
            <EnrollmentCard
              enrollment={cards.waitlisted}
              audience="self"
              onOpenPortal={inert}
              onLeaveWaitlist={inert}
            />
          </div>
          <div className="space-y-2">
            <DemoCaption>Failing card — corner badge, unchanged</DemoCaption>
            <EnrollmentCard
              enrollment={cards.badged}
              audience="self"
              onOpenPortal={inert}
            />
          </div>
        </div>
      </SubSection>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Products (browse + purchased cards)                                 */
/* ------------------------------------------------------------------ */

// Caption above each card in the demo grid. Uses the same uppercase
// micro-label treatment as the topic chip inside the card so it reads
// as meta information, not card content — keeps it from blending into
// the title and looking like overlap.
function DemoCaption({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

// Each example pins concrete seat numbers so the bar's fill + color + full
// state are all visible at a glance. The bar tracks seats *remaining*: full
// bar = empty club, empty bar = full club.
const SEAT_DEMO_CASES: {
  label: string;
  seatCount: number;
  seatsLeft: number;
  waitlistEnabled: boolean;
}[] = [
  {
    label: "Empty — 15 of 15",
    seatCount: 15,
    seatsLeft: 15,
    waitlistEnabled: false,
  },
  {
    label: "Filling — 7 of 15",
    seatCount: 15,
    seatsLeft: 7,
    waitlistEnabled: false,
  },
  {
    label: "Almost full — 2 of 15",
    seatCount: 15,
    seatsLeft: 2,
    waitlistEnabled: true,
  },
  {
    label: "Full, no waitlist — 0 of 15 (no chip; the label beside it says Full)",
    seatCount: 15,
    seatsLeft: 0,
    waitlistEnabled: false,
  },
  {
    label: "Full, waitlist — 0 of 15",
    seatCount: 15,
    seatsLeft: 0,
    waitlistEnabled: true,
  },
];

function SeatAvailabilityDemo() {
  return (
    <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
      {SEAT_DEMO_CASES.map((c) => (
        <div key={c.label} className="flex flex-col gap-2">
          <DemoCaption>{c.label}</DemoCaption>
          {/* w-80 mirrors the narrowest fixed real consumer (the groups panel
              caps the bar at w-80); the detail panel gives it more. Don't demo
              at an arbitrary tighter width — a fixture narrower than every real
              container reports fake overflow bugs. The genuinely tighter case
              (browse-card footer, flex-1 beside a CTA) is shown in the product
              card demos in real context. */}
          <div className="w-80 max-w-full rounded-md border p-3">
            <SeatAvailabilityBar
              seatCount={c.seatCount}
              seatsLeft={c.seatsLeft}
              waitlistEnabled={c.waitlistEnabled}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function ProductsDemo() {
  // Group scenarios into subsections by product type, preserving SCENARIO_ORDER
  // (the list is already laid out so each group is contiguous).
  type ScenarioEntry = (typeof PREVIEW_SCENARIOS)[number];
  const groups: { group: string; scenarios: ScenarioEntry[] }[] = [];
  for (const entry of PREVIEW_SCENARIOS) {
    const last = groups.at(-1);
    if (last?.group === entry.group) last.scenarios.push(entry);
    else groups.push({ group: entry.group, scenarios: [entry] });
  }

  return (
    <div className="space-y-8">
      {groups.map(({ group, scenarios }) => (
        <SubSection key={group} title={group}>
          <div className="grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {scenarios.map(({ slug, label }) => (
              <ScenarioBrowseCard key={slug} slug={slug} label={label} />
            ))}
          </div>
        </SubSection>
      ))}

      <SubSection title="Closed-state signup panel">
        <p className="max-w-prose text-sm text-muted-foreground">
          The shared &ldquo;registration closed&rdquo; panel (ended / already
          started / fully booked) has no browse-card link &mdash; a parent only
          reaches it through a stale link or bookmark. It is still previewable
          full-page: every scenario, closed ones included, is listed on the{" "}
          <a href={ROUTES.admin.uiPreviews} className="underline">
            UI Previews
          </a>{" "}
          page.
        </p>
      </SubSection>
    </div>
  );
}

// One demo card per scenario, rendered from that scenario's mocked product
// through the production adapter hook — the same row→props resolution the shop
// runs, not a restatement of it. The one thing the style guide authors is the
// registration `state`, overridden after the spread: `deriveRegistrationState`
// is intentionally bypassed so each demo shows exactly the state it exists to
// eyeball, and the counts fed to the hook are synthesized from that same
// authored state (`buildBrowseCounts`) so the muni seat bar agrees with it.
// A card whose state opens takes its whole surface to the matching full page
// at /preview/products/[slug]; a dead-end state stays inert — the card's own
// split, not the demo's.
//
// The tag and the picture are read off the row by the adapter, for the same
// reason the state is not hand-picked per card: a hand-picked tag would let a
// demo card disagree with that scenario's own detail scene, and the fixture
// has already decided it. All three tags and the untagged case appear on this
// grid because the scenarios carry them, not because this function chose them.
//
// `municipalityScoped` is true because muni clubs are only ever surfaced on
// the per-municipality page, which renders them scoped — an online muni club
// collapses its (redundant) city name to the generic "Online" label here
// exactly as it does there. The flag is inert for every other product type.
function ScenarioBrowseCard({
  slug,
  label,
}: {
  slug: PreviewScenario;
  label: string;
}) {
  const { product, state } = buildScenarioFixture(slug);
  const viewProps = useBrowseCardViewProps(
    product,
    buildBrowseCounts(slug, product.id),
    // Every scenario passes its href; the card decides whether to use it, from
    // the state, exactly as it does in the shop. Withholding it here used to
    // double as a way of saying "this one is inert", which was the style guide
    // second-guessing the component about the one thing the component owns.
    `/preview/products/${slug}`,
    true,
  );

  return (
    <div className="flex flex-col gap-2">
      <DemoCaption>{label}</DemoCaption>
      <ProductBrowseCardView {...viewProps} state={state} />
    </div>
  );
}

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
          </div>
        </SubSection>

        <SubSection title="Surface Colors">
          <div className="flex flex-wrap gap-4">
            <Swatch label="Background" className="bg-background" />
            <Swatch label="Card" className="bg-card" />
            <Swatch label="Muted" className="bg-muted" />
            <Swatch label="Accent" className="bg-accent" />
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
          {(["Gamer", "Parent", "Gedu", "Admin"] as const).map((label, i) => (
            <Badge key={label} className={Object.values(ROLE_BADGE_STYLES)[i]}>{label}</Badge>
          ))}
        </div>

      </Section>

      {/* ============================================================ */}
      {/* Section 4: Input & Label                                      */}
      {/* ============================================================ */}
      <Section title="Input & Label">
        <SubSection title="Field — the canonical labelled-field wrapper">
          <p className="text-sm text-muted-foreground mb-4">
            Use <code>&lt;Field&gt;</code> for every labelled input — it owns the
            label, the label→input spacing, and the optional hint. Do not
            hand-roll a <code>&lt;Label&gt;</code> + input group. House rule for
            required vs. optional: fields are <strong>required by default and
            carry no marker</strong>; genuinely optional fields get{" "}
            <code>optional</code>, which renders a muted <code>(optional)</code>{" "}
            suffix. We mark the exceptions, not the norm — never an asterisk on
            required fields.
          </p>
          {/*
            NOTE: autoComplete="off" here is demo-only — it stops the browser
            autofilling these throwaway fields (the unhinted phone input was
            offering a saved email). Real forms must NOT copy this: use the
            correct autocomplete token (given-name, family-name, tel,
            new-password, …) so autofill and accessibility work properly.
          */}
          {/*
            A <form> wrapper (submit prevented — this is a demo) so the password
            field has a form ancestor. Chrome warns on form-less password inputs
            because password managers anchor their save/fill UI to the form.
          */}
          <form
            className="grid gap-6 md:grid-cols-2 max-w-2xl"
            onSubmit={(e) => e.preventDefault()}
          >
            <Field label="First name" htmlFor="demo-field-required">
              <Input id="demo-field-required" placeholder="e.g. Jane" autoComplete="off" />
            </Field>
            <Field label="Phone number" htmlFor="demo-field-optional" optional>
              <Input id="demo-field-optional" type="tel" placeholder="+358 …" autoComplete="off" />
            </Field>
            <Field
              label="Password"
              htmlFor="demo-field-hint"
              hint="Must be at least 8 characters."
            >
              <Input id="demo-field-hint" type="password" autoComplete="new-password" />
            </Field>
          </form>
        </SubSection>

        <SubSection title="Textarea — the multi-line control">
          <p className="text-sm text-muted-foreground mb-4">
            <code>&lt;Textarea&gt;</code> is the multi-line sibling of{" "}
            <code>&lt;Input&gt;</code> — same border, padding, and the
            load-bearing <code>text-base</code> (anything under 16px makes iOS
            Safari auto-zoom and horizontal-scroll the page on focus). Size it
            with <code>rows</code>; add <code>resize-y</code> for a
            user-resizable box. Wrap it in a <code>&lt;Field&gt;</code> exactly
            like an input.
          </p>
          <div className="grid gap-6 md:grid-cols-2 max-w-2xl">
            <Field label="Short description" htmlFor="demo-textarea">
              <Textarea id="demo-textarea" rows={3} placeholder="A sentence or two…" />
            </Field>
            <Field
              label="Message"
              htmlFor="demo-textarea-resize"
              hint="Drag the corner to resize."
            >
              <Textarea
                id="demo-textarea-resize"
                rows={3}
                placeholder="Longer free text…"
                className="resize-y"
              />
            </Field>
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/* Section: Checkbox                                             */}
      {/* ============================================================ */}
      <Section title="Checkbox">
        <CheckboxDemo />
      </Section>

      {/* ============================================================ */}
      {/* Section 6: Avatar & Identicon                                 */}
      {/* ============================================================ */}
      <Section title="Avatar & Identicon">
        <SubSection title="Identicons (different IDs)">
          <div className="flex flex-wrap items-center gap-4">
            {[
              { id: "4babfc78-d197-496e-860d-48f1207f5bc6", name: "Emma" },
              { id: "1a54d62e-828f-4a42-89f1-cc36185351b0", name: "Aino" },
              { id: "19ffd6e5-2e78-4742-a65f-6ed40b2b8b47", name: "Oliver" },
              { id: "ff42551b-933b-4c37-9971-7fdbbeed0385", name: "Eero" },
              { id: "1d589613-5fb0-4692-bcf1-029f8fc16b99", name: "Liam" },
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

        <SubSection title="Person chip">
          <p className="max-w-prose text-sm text-muted-foreground">
            A person as a pill — identicon plus first name. The avatar box and
            the identicon&rsquo;s pixel size are paired inside the component, so
            a call site can&rsquo;t desync them. Use{" "}
            <code>compact</code> on a line that already carries something else
            (a rail row with a button beside the chips); the default size is for
            a row of chips on their own line.
          </p>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Default</p>
              <PersonChipList people={PERSON_CHIP_PEOPLE} />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Compact</p>
              <PersonChipList people={PERSON_CHIP_PEOPLE} size="compact" />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                Labelled, as the product page&rsquo;s rail does it — the row
                already shows a gamer count, so an unlabelled set of faces would
                read as children rather than as the Gedus teaching the group.
              </p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Gedus
                </span>
                <PersonChipList
                  people={PERSON_CHIP_PEOPLE.slice(0, 2)}
                  size="compact"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Single chip</p>
              <PersonChip
                id={PERSON_CHIP_PEOPLE[0].id}
                name={PERSON_CHIP_PEOPLE[0].name}
              />
            </div>
          </div>
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
                  Heads up — this action affects production data.
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
      {/* Section 8b: Switch Profile Dialog                             */}
      {/* ============================================================ */}
      <SwitchProfileDialogDemo />

      {/* ============================================================ */}
      {/* Section 9: Voice Room                                         */}
      {/* ============================================================ */}
      <Section title="Voice Room">
        <SubSection title="Zone list (mock data, moderator view)">
          <p className="text-sm text-muted-foreground mb-3">
            The discrete-zone room UI, fed a hand-built mock provider context
            (no live Daily call) — which is also the separation-of-concerns
            check: the components are pure consumers, so fixtures drive them
            identically. Resize the panel to feel the mobile layout. Live video
            and the audio-driven glow are inert under mock data (no real tracks);
            everything else — cards, custom + locked zones, the privacy-screen
            blur, current-zone emphasis, drag, and the moderator controls —
            renders from the fixture.
          </p>
          <VoiceZonesDemo />
        </SubSection>

        <SubSection title="Avatar (speaking glow)">
          <VoiceAvatarDemo />
        </SubSection>

        <SubSection title="Participant list">
          <p className="text-sm text-muted-foreground mb-3">
            Shows avatar, name, moderator controls (for non-owner remote participants), and status indicators.
            Lock buttons toggle between ghost/destructive variants. Used in the voice room sidebar.
          </p>
          <ParticipantCardDemo />
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/* Section 9b: Location Picker                                   */}
      {/* ============================================================ */}
      <Section title="Location Picker">
        <p className="text-sm text-muted-foreground">
          One panel, and every location control in the app is a configuration of
          it: it browses the hierarchy from the countries down, searches it from
          the first keystroke, and stops at whatever level the caller made
          pickable. It once had a second, &ldquo;set&rdquo; scope — a bounded,
          pre-fetched collection grouped under the place above each row — but
          every surface that used one (the flat every-venue list, the Finnish
          municipality list) now reaches the same rows through this tree, so the
          panel has one shape and the demos below show its states.
        </p>
        <p className="text-sm text-muted-foreground">
          Its consumers: gedu coverage, a parent&rsquo;s own location, and the
          product form&rsquo;s venue and municipality fields — the last two as
          dialogs, configured by <code>pickableTypes</code> (a venue pick stops
          at <code>site</code>, a municipality pick at{" "}
          <code>municipality</code>, seeded at Finland).
        </p>
        <p className="text-sm text-muted-foreground">
          In the real app a container above the panel owns the browse position,
          the debounced query and the two server reads behind them — one level
          of children by parent, or a ranked top-N from the search index. Here
          every scope is fed a fixture and fake handlers, no network at all: the
          panel takes rows and a <code>scope</code> config as props and owns
          nothing else, which is the separation-of-concerns check.
        </p>
        <p className="text-sm text-muted-foreground">
          Note what is <em>not</em> here: no country to choose first (a country
          is simply the top level of the tree) and no loading skeleton. Every
          read behind the real panel is a small indexed lookup, so the list box
          — which already has its final height — just fills in.
        </p>
        <SubSection title="Single mode (pick one place)">
          <p className="text-sm text-muted-foreground mb-3">
            The rows are real table rows, so confirming one hands the caller the
            row itself plus its ancestors — enough to write the foreign key and
            render the place with its path, with nothing left to resolve. A row
            of a pickable type is terminal: clicking it selects rather than
            descends, so the level a caller asked for is where browsing stops.
          </p>
          <p className="text-sm text-muted-foreground mb-3">
            Two things a caller can do are deliberately <em>not</em> visible
            here, because they belong to the data container rather than to this
            panel: opening the breadcrumb already inside a country, and
            restricting every row offered to one country. The product form&rsquo;s
            municipality field uses both — it opens on Finland&rsquo;s maakunnat
            and will not offer a French commune — and both are fed by the same
            browse and search reads this demo replaces with fixtures. What the
            panel does say about them has a demo of its own, below.
          </p>
          <LocationPickerDemo />
        </SubSection>
        <SubSection title="Multi mode (gedu coverage)">
          <p className="text-sm text-muted-foreground mb-3">
            Every level is tickable and each tick is an independent &ldquo;I
            cover this whole subtree&rdquo; claim, so ticking Hauts-de-France and
            then drilling into it shows Nord and Pas-de-Calais{" "}
            <em>unticked</em> — deliberately. Half-ticking them would say
            something the saved rows don&rsquo;t: one claim is one row, and
            matching walks the ancestor chain to find it.
          </p>
          <LocationCoverageDemo />
        </SubSection>
        <SubSection title="Searching">
          <p className="text-sm text-muted-foreground mb-3">
            The same panel, told it is showing search hits: each row carries the
            path that tells two identically-named communes apart, and the status
            line reports the true match count behind the rendered cap. In the
            real app the ranking, the cap and that count all come from the
            database — a prefix match beats an infix one however late in the
            table it sits.
          </p>
          <p className="text-sm text-muted-foreground mb-3">
            This one is configured the way the product form&rsquo;s venue dialog
            configures it: <code>municipality</code> and <code>site</code> are
            both pickable, so the venue &ldquo;Gymnase municipal de Nîmes&rdquo;
            is confirmable straight from a search. The caller reads the type to
            decide what the confirmation meant — a site is the answer, a
            municipality is the next question (&ldquo;show me the venues
            here&rdquo;, which is also the only screen that can offer to create
            one). That is why a site is confirmable but never browsable to:
            making a municipality terminal is exactly what stops the tree
            walking past the screen that carries creation.
          </p>
          <LocationSearchDemo />
        </SubSection>
        <SubSection title="Bound to one country">
          <p className="text-sm text-muted-foreground mb-3">
            The same panel, told which country its container has bound it to.
            The bound country is copy and nothing else — the filtering happens
            above, and the rows here are the same fixtures as everywhere else on
            this page — but two lines would otherwise claim more than the picker
            is doing. The breadcrumb starts <em>at</em> the country rather than
            behind an &ldquo;all countries&rdquo; crumb that opens a list holding
            only that country, and typing two characters says which country is
            being searched instead of &ldquo;everywhere&rdquo;.
          </p>
          <LocationBoundCountryDemo />
        </SubSection>
        <SubSection title="Home location field (parent profile)">
          <p className="text-sm text-muted-foreground mb-3">
            The parent&rsquo;s own place: one optional municipality, on the
            registration form and in settings. It asks single mode for the
            municipality level — Finland&rsquo;s kunta, France&rsquo;s commune,
            the one directly above a venue. Unlike the panels above, this demo
            opens the real dialog, so browsing and search here hit the database.
          </p>
          <p className="text-sm text-muted-foreground mb-3">
            The box <em>is</em> the picker rather than a display row over a
            &ldquo;choose&rdquo; button — one control, and no button caption
            that has to guess what the viewer&rsquo;s country calls this level.
            A confirmed pick is a row, so what comes back is a foreign key and a
            path, with nothing left to resolve.
          </p>
          <HomeLocationFieldDemo />
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/* Section 10: Composite Patterns                                */}
      {/* ============================================================ */}
      <Section title="Composite Patterns">
        {/* -- User Row (admin/users) -- */}
        <SubSection title="User Row (admin/users)">
          <p className="text-sm text-muted-foreground mb-3">
            Row showing a user with role badge, optional nested gamers. Used in admin/users.
          </p>
          <div className="space-y-4">
            <UserRow
              user={{ id: "a1b2c3d4-0000-0000-0000-000000000001", first_name: "Jane", last_name: "Doe", email: "jane@example.com", role: "customer" }}
              linkedGamers={[
                { id: "8e86d931-500c-49ed-889d-c2cd10879a28", first_name: "Venla", last_name: "Doe", email: null, role: "gamer" },
                { id: "5aec0f5a-5398-46d7-a150-3554cf701beb", first_name: "Lucas", last_name: "Doe", email: null, role: "gamer" },
              ]}
            />
            <UserRow
              user={{ id: "a1b2c3d4-0000-0000-0000-000000000002", first_name: "Sam", last_name: "Smith", email: "sam@example.com", role: "gedu" }}
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
                  <stat.icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <p className="text-xs text-muted-foreground">
                    {stat.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/* Section 11: Seat Availability Bar                             */}
      {/* ============================================================ */}
      <Section title="Seat Availability Bar">
        <p className="text-sm text-muted-foreground -mt-2">
          Shared seat-availability bar for product cards and the detail-page
          signup panel. The bar tracks seats <em>remaining</em> — an empty club
          starts full and drains as it fills — so it reads as &ldquo;room left,&rdquo;
          not &ldquo;how full.&rdquo; Color escalates with scarcity (green &rarr;
          yellow at &le;2 left); at zero there&rsquo;s no fill to color, so the
          full state is carried by text/badge, where the waiting list is surfaced.
        </p>
        <SeatAvailabilityDemo />
      </Section>

      {/* ============================================================ */}
      {/* Section 12: Products                                          */}
      {/* ============================================================ */}
      <Section title="Products">
        <p className="text-sm text-muted-foreground -mt-2">
          Parent-facing product surfaces, grouped by product type. Each card is
          one mocked product rendered as the browse card a parent sees in the
          shop (/shop). <strong>The whole card is the click target</strong> —
          clicking anywhere on one that carries a chevron opens that same
          mock&rsquo;s full detail page in the public layout — hero, long
          description, schedule calendar, and the registration signup panel —
          exactly as a parent would see it. The panel therefore needs no
          separate demo: it lives in the full-page view. The
          &ldquo;View&rdquo; hint in the footer is a label on that target
          rather than a separate one — it is not a link, and the card beneath
          it takes the click. <strong>Cards with no chevron are inert:</strong>{" "}
          full-and-closed, an already-started camp and an already-over event
          each state the reason as muted text where the hint would be, and a
          finished run drops the footer row for a note and desaturates. None of
          the four has a detail page, because a parent can&rsquo;t act there. Compare the two groups
          by hovering: only the openable ones lift, brighten and nudge their
          chevron. Between them the cards cover every registration state,
          including one a parent reaches only by leaving a tab open past
          midnight.
        </p>
        <p className="text-sm text-muted-foreground">
          <strong>No card carries seat information</strong> except the
          municipality seat-fill bar, which is the deliberate exception
          (schools are the known-scarce case) and reads counts that are not
          live. Caps and waitlists are legal on every type now, so the pairs to
          read against each other are the capped non-muni ones: the free club
          and the full-with-waitlist club both look like ordinary open cards,
          and the full-no-waitlist camp is inert &mdash; whether the card opens
          is the only difference a parent can see before clicking, and fullness
          is stated properly on the detail page behind it. The muni countdown
          scenarios are the only pre-open ones because registration timing is
          still a municipality-only setting.
        </p>
        <ProductsDemo />
      </Section>

      {/* ============================================================ */}
      {/* Section 13: Billing — Manage Billing Card                      */}
      {/* ============================================================ */}
      <Section title="Billing — Manage Billing Card">
        <p className="text-sm text-muted-foreground -mt-2">
          Shown in the Billing section of the parent dashboard. A single
          &ldquo;Manage billing&rdquo; button that opens Stripe&rsquo;s Customer
          Portal — payment methods, invoices, and subscriptions all live on
          Stripe. The &ldquo;opening&rdquo; state keeps the button disabled from
          the click through the full-page navigation, so a fast user can&rsquo;t
          open two portal sessions.
        </p>
        <ManageBillingCardDemo />
      </Section>

      {/* ============================================================ */}
      {/* Section 14: Family — Enrollment Card                          */}
      {/* ============================================================ */}
      <Section title="Family — Enrollment Card">
        <p className="text-sm text-muted-foreground -mt-2">
          One card per <em>enrollment</em> &mdash; a family&rsquo;s participation
          in one product &mdash; and the unit both family dashboards are built
          out of. It states the <strong>schedule</strong>, not the next session:
          the next session lives in the Join button&rsquo;s locked label and in
          the Live badge, so a weekly club is one card all term instead of one
          card per week. The type noun is the eyebrow, the schedule is the shared
          product-schedule formatter&rsquo;s sentence, and the footer answers the
          one remaining question in whichever way this enrollment can: the Join
          on a remote product, the venue on an in-person one, the place in line
          on a waitlisted one, the fact that a Gedu is being matched on a seat
          nobody has been placed in yet, or the day a finished run ended.
        </p>
        <p className="text-sm text-muted-foreground">
          <strong>Two states have nothing behind them</strong> &mdash; a queue
          place and an unplaced seat &mdash; and both drop the link, the chevron
          and the hover together, because nothing on a card may promise there is
          more inside when there is not. The corner is reserved for a genuine
          problem (a failing card), which is why a cancelled membership is a
          quiet line in the body instead: the parent chose it, so it is
          confirmation rather than an alarm. Leaving a waitlist is likewise a
          quiet text link under its own footer sentence.
        </p>
        <EnrollmentCardDemo />
      </Section>

      {/* ============================================================ */}
      {/* Section 15: Product links — the Gedu material link            */}
      {/* ============================================================ */}
      <Section title="Product links — the Gedu material link">
        <p className="text-sm text-muted-foreground -mt-2">
          The one outward link a product still carries, and it is{" "}
          <strong>Gedu-only</strong> &mdash; carried by a padlocked book glyph
          and a hover title. A product used to carry a family-facing link beside
          it as well; families read their sessions in the app now, so this is the
          only one left. The component renders whatever href it is given and
          knows nothing about who is looking:{" "}
          <em>
            only render it on a gedu- or admin-only surface. Never hide it with
            CSS on a page a parent can reach
          </em>{" "}
          &mdash; the URL would still be in the HTML.
        </p>
        <p className="text-sm text-muted-foreground">
          The material link has <strong>two weights</strong>, because it means two
          different things in two places. In a row of a product&rsquo;s links it
          is one entry among several and takes the quiet <code>chip</code> form.
          On a gedu&rsquo;s own workspace it is the thing they came for &mdash; a
          gedu opening the page before a session is going to fetch the material
          &mdash; so there it takes the <code>button</code> form and reads as an
          action rather than as metadata about the product. Both are the same
          component: two implementations would drift in glyph, label and, worst of
          all, in the staff-only warning that has to travel with the URL.
        </p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4 rounded-lg border p-4">
          <div className="flex flex-col items-start gap-2">
            <DemoCaption>Material chip (quiet)</DemoCaption>
            <MaterialLink href="https://drive.sog.gg/minecraft-monday-club/lesson-plans" />
          </div>
          <div className="flex flex-col items-start gap-2">
            <DemoCaption>Material button (prominent)</DemoCaption>
            <MaterialLink
              href="https://drive.sog.gg/minecraft-monday-club/lesson-plans"
              variant="button"
            />
          </div>
        </div>
      </Section>

      {/* ============================================================ */}
      {/* Section 16: Rich text editor — authoring and what it stores   */}
      {/* ============================================================ */}
      <Section title="Rich text editor — authoring and what it stores">
        <p className="text-sm text-muted-foreground -mt-2">
          The shared authoring control for anywhere a person writes prose the app
          stores. It round-trips <strong>markdown</strong> &mdash; the format that
          converts cleanly into email &mdash; behind a small fixed toolbar, so a
          writer never has to know what <code>##</code> does. The value below the
          editor is exactly what gets persisted.
        </p>
        <p className="text-sm text-muted-foreground">
          The toolbar produces a deliberately narrow subset: headings, paragraphs,
          bold, italics and lists. Whatever consumes the stored markdown is
          expected to enforce that same subset as a <em>whitelist</em> on the way
          out, unwrapping anything outside it to its text rather than dropping it,
          so a pasted table or a stray tag shows its words instead of silently
          deleting a paragraph of somebody&rsquo;s writing.
        </p>
        <RichTextEditorDemo />
      </Section>

      {/* ============================================================ */}
      {/* Section 17: Game account — one identity, any platform         */}
      {/* ============================================================ */}
      <Section title="Game account — one identity, any platform">
        <p className="text-sm text-muted-foreground -mt-2">
          One component set for a child&rsquo;s game identity, parameterised by{" "}
          <code>platform</code>; everything a platform does differently lives in a
          descriptor in <code>components/game-account/platforms.tsx</code>. Three
          ways it is ever shown, one height for all of them, and every one carries
          the skin.
        </p>
        <GameAccountDemo />
      </Section>

    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section 13: Manage Billing Card                                    */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Location Picker Demo                                               */
/* ------------------------------------------------------------------ */

// A miniature stand-in for the rows the browse query returns: same columns,
// three levels, five communes instead of 35,000. Nîmes and Béziers are here on
// purpose — they are what the real search's diacritic folding is for, and the
// search demo below shows them found from an unaccented needle.
const FR: LocationSummary = {
  id: "fr",
  name: "France",
  name_i18n: null,
  type: "country",
  country_code: "FR",
};

function fixtureRow(
  id: string,
  name: string,
  type: LocationSummary["type"],
): LocationSummary {
  return { id, name, name_i18n: null, type, country_code: "FR" };
}

const HDF = fixtureRow("32", "Hauts-de-France", "region");
const OCC = fixtureRow("76", "Occitanie", "region");
const NORD = fixtureRow("59", "Nord", "district");
const GARD = fixtureRow("30", "Gard", "district");

/** One level of the tree, keyed by the id of the node above it. */
const LEVELS: Record<string, LocationSummary[]> = {
  root: [FR],
  fr: [HDF, OCC],
  "32": [NORD, fixtureRow("62", "Pas-de-Calais", "district")],
  "76": [GARD, fixtureRow("34", "Hérault", "district")],
  "59": [fixtureRow("59350", "Lille", "municipality"), fixtureRow("59512", "Roubaix", "municipality")],
  "62": [fixtureRow("62041", "Arras", "municipality")],
  "30": [fixtureRow("30189", "Nîmes", "municipality")],
  "34": [fixtureRow("34032", "Béziers", "municipality")],
};

const NIMES = fixtureRow("30189", "Nîmes", "municipality");

/**
 * Fixture search hits for the needle "nimes", each with the path a real hit
 * carries. The third is a venue rather than a commune, and it is the whole
 * point of the search demo's configuration: the product form's venue dialog
 * makes `site` pickable alongside `municipality`, so an admin who knows the
 * building's name confirms it here in one step instead of walking down to its
 * commune first. Both types rank against the same needle.
 */
const HITS: LocationPick[] = [
  { location: NIMES, ancestors: [GARD, OCC, FR] },
  { location: fixtureRow("34032", "Béziers", "municipality"), ancestors: [fixtureRow("34", "Hérault", "district"), OCC, FR] },
  { location: fixtureRow("s-30189-1", "Gymnase municipal de Nîmes", "site"), ancestors: [NIMES, GARD, OCC, FR] },
];

/**
 * Drives the panel's browse half from the fixture tree above: the path is
 * component state, and the rows are whatever level that path points at.
 */
function useFixtureBrowse(initialPath: LocationChainSummary[] = []) {
  const [path, setPath] = useState<LocationChainSummary[]>(initialPath);
  const parentId = path.at(-1)?.id ?? "root";
  const ancestors = [...path].reverse();
  const rows = (LEVELS[parentId] ?? []).map((location) => ({ location, ancestors }));

  return {
    path,
    // The same rule the real browser uses: a row's path is its ancestors
    // reversed to root-first plus the row itself, which holds whether the row
    // was browsed to or searched for. Appending instead would look right here —
    // the fixture only browses — while being wrong in the app.
    onDrill: (pick: LocationPick) =>
      setPath([...[...pick.ancestors].reverse(), pick.location]),
    onOpenDepth: (depth: number) => setPath((current) => current.slice(0, depth)),
    browse: { rows, total: rows.length, hasMore: false, loading: false },
  };
}

const EMPTY_ROWS = { rows: [], total: 0, hasMore: false, loading: false };

function LocationPickerDemo() {
  const [query, setQuery] = useState("");
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const fixture = useFixtureBrowse();

  // Mirrors the real flow: on success the parent swaps this view away, which
  // is why the picker never has to re-enable its confirm button.
  if (confirmed) {
    return (
      <div className="space-y-3 rounded-md border border-input bg-card p-4">
        <p className="text-sm">
          Confirmed <span className="font-medium">{confirmed}</span> — the venue
          flow would now list the venues already in it, with that row as the
          parent of any new one.
        </p>
        <Button type="button" variant="outline" onClick={() => setConfirmed(null)}>
          Pick another
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl rounded-md border border-input bg-card p-4">
      <LocationPickerPanel
        query={query}
        onQueryChange={setQuery}
        scope={{
          path: fixture.path,
          onDrill: fixture.onDrill,
          onOpenDepth: fixture.onOpenDepth,
          minQueryLength: 2,
          browse: fixture.browse,
          search: EMPTY_ROWS,
          selection: {
            mode: "single",
            pickableTypes: ["municipality"],
            onConfirm: (pick) =>
              new Promise<void>((resolve) =>
                setTimeout(() => {
                  setConfirmed(pick.location.name);
                  resolve();
                }, 600),
              ),
            onCancel: () => setConfirmed(null),
          },
        }}
      />
    </div>
  );
}

function LocationCoverageDemo() {
  const [query, setQuery] = useState("");
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const fixture = useFixtureBrowse();

  return (
    <div className="space-y-2">
      <div className="max-w-2xl rounded-md border border-input bg-card p-4">
        <LocationPickerPanel
          query={query}
          onQueryChange={setQuery}
          scope={{
            path: fixture.path,
            onDrill: fixture.onDrill,
            onOpenDepth: fixture.onOpenDepth,
            minQueryLength: 2,
            browse: fixture.browse,
            search: EMPTY_ROWS,
            selection: {
              mode: "multi",
              selectedIds: ticked,
              onToggle: (pick) =>
                setTicked((prev) => {
                  const next = new Set(prev);
                  if (next.has(pick.location.id)) next.delete(pick.location.id);
                  else next.add(pick.location.id);
                  return next;
                }),
              onDone: () => setTicked(new Set()),
            },
          }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Ticked: {ticked.size === 0 ? "(none)" : [...ticked].join(", ")}{" "}
        &mdash; &ldquo;Done&rdquo; clears the demo&rsquo;s state; in the real app
        it closes the dialog and the caller&rsquo;s save commits the ticks.
      </p>
    </div>
  );
}

function LocationSearchDemo() {
  // Held above the minimum length so the panel stays in its search branch: the
  // point of this demo is the hit rows, not the transition into them.
  const [query, setQuery] = useState("nimes");

  return (
    <div className="max-w-2xl rounded-md border border-input bg-card p-4">
      <LocationPickerPanel
        query={query}
        onQueryChange={setQuery}
        scope={{
          path: [],
          onDrill: () => {},
          onOpenDepth: () => {},
          minQueryLength: 2,
          browse: EMPTY_ROWS,
          search: { rows: HITS, total: 47, hasMore: false, loading: false },
          selection: {
            mode: "single",
            // The venue dialog's own configuration: two confirmable types, and
            // the caller decides what each one meant — a site is the answer, a
            // municipality is "show me the venues here".
            pickableTypes: ["municipality", "site"],
            onConfirm: () => Promise.resolve(),
            onCancel: () => setQuery(""),
          },
        }}
      />
    </div>
  );
}

/**
 * The panel told it is bound to one country — the product form's municipality
 * field, whose container opens on Finland and filters every row to it.
 *
 * The bound country is copy and nothing else: the filtering lives in the
 * container this demo replaces, so the panel offers the same fixture rows
 * either way. What it changes is the two lines that would otherwise claim more
 * than the picker is doing — browsing starts the breadcrumb *at* the country,
 * with no root crumb to a list holding that one country, and typing says which
 * country it is searching instead of "everywhere". Both are here: the initial
 * view is the breadcrumb, and two characters in the box is the other.
 */
function LocationBoundCountryDemo() {
  const [query, setQuery] = useState("");
  const fixture = useFixtureBrowse([FR]);

  return (
    <div className="max-w-2xl rounded-md border border-input bg-card p-4">
      <LocationPickerPanel
        query={query}
        onQueryChange={setQuery}
        scope={{
          path: fixture.path,
          onDrill: fixture.onDrill,
          onOpenDepth: fixture.onOpenDepth,
          minQueryLength: 2,
          // France rather than Finland only because the fixture tree is French;
          // the real bound picker is Finland's.
          boundCountryName: "France",
          browse: fixture.browse,
          search: {
            rows: HITS,
            total: HITS.length,
            hasMore: false,
            loading: false,
          },
          selection: {
            mode: "single",
            pickableTypes: ["municipality"],
            onConfirm: () => Promise.resolve(),
            onCancel: () => setQuery(""),
          },
        }}
      />
    </div>
  );
}

function HomeLocationFieldDemo() {
  const [place, setPlace] = useState<LocationPick | null>(null);

  return (
    <div className="max-w-md space-y-4 rounded-md border border-input bg-card p-4">
      <div className="space-y-2">
        <HomeLocationField value={place} onChange={setPlace} />
        <p className="text-xs text-muted-foreground">
          Value:{" "}
          {place ? `${place.location.id} (${place.location.name})` : "(none)"}{" "}
          &mdash; a row id, so the caller has a foreign key to store and a path
          to render without a second read. It decides what committing means: a
          registration submit, or a settings save.
        </p>
      </div>

      {/* The third state, which is the reason the prop is not just
          `LocationPick | null`. It cannot be reached by clicking, because the
          read it represents lands in a frame or two — so it is pinned here as a
          fixture rather than demonstrated by waiting for one. */}
      <div className="space-y-2">
        <HomeLocationField value={undefined} onChange={() => {}} />
        <p className="text-xs text-muted-foreground">
          Value: <code>undefined</code> &mdash; a stored id whose row has not
          arrived yet, as settings mounts. The box is silent at its final height
          rather than showing the &ldquo;add your location&rdquo; prompt, which
          would tell someone who has chosen a place that they have not, and be
          clickable while it did so. Reading one row by id is an indexed lookup,
          so there is no skeleton and no spinner here by design.
        </p>
      </div>
    </div>
  );
}

// A Stripe billing-portal session covers exactly one customer. Almost every
// parent has one, and sees the single unlabelled button (the first two demos).
// Parents migrated from the old platform can own several — that platform made a
// customer per enrolment, and Stripe can neither move a subscription between
// customers nor merge them — so they get one labelled button each. The last
// account carries no subscriptions, which is the profile-bound customer holding
// only saved cards and invoice history.
const BILLING_ACCOUNTS_SPLIT: BillingAccountSummary[] = [
  { stripeCustomerId: "cus_demo_native", covers: ["Alex · Rocket League Club"] },
  {
    stripeCustomerId: "cus_demo_migrated",
    covers: ["Bobby · Cosmic Builders Club"],
  },
  { stripeCustomerId: "cus_demo_empty", covers: [] },
];

/* ------------------------------------------------------------------ */
/*  Rich text editor                                                   */
/* ------------------------------------------------------------------ */

/** Seeds the editor with every construct its toolbar produces. */
const DEMO_MARKDOWN = `# Mob-proofing night

We lit the paths, walled the gaps and got through a whole session without losing anybody to a creeper.`;

/**
 * The writer, with its own serialised output beside it.
 *
 * Showing the stored markdown next to the editor is the one thing worth being
 * able to see at a glance: a writer never meets the syntax, so this is the only
 * place to confirm the round trip is honest. Type a heading, watch the `#`
 * appear in the serialised output.
 *
 * How stored markdown *renders* is deliberately not demoed here — a renderer is
 * only meaningful inside the surface that owns it, at that surface's width and
 * clamping. Those live in the full-page preview scenes on `/admin/ui-previews`.
 */
function RichTextEditorDemo() {
  const [markdown, setMarkdown] = useState(DEMO_MARKDOWN);

  return (
    <div className="space-y-8">
      <SubSection title="The editor, and what it stores">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <DemoCaption>
              Rich editor — seven buttons, fixed toolbar height
            </DemoCaption>
            <RichTextEditor
              initialValue={DEMO_MARKDOWN}
              onChange={setMarkdown}
              ariaLabel="Session report"
              placeholder="What the group built, played or figured out."
            />
          </div>
          <div className="space-y-2">
            <DemoCaption>
              Serialised markdown — the value that is actually stored
            </DemoCaption>
            <pre className="min-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-input bg-muted/40 p-3 text-xs text-muted-foreground">
              {markdown}
            </pre>
          </div>
        </div>
      </SubSection>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Game account — one identity, any platform                          */
/* ------------------------------------------------------------------ */

/**
 * Both platforms in every demo. The components take one platform each — a
 * surface may end up showing only the identity that matters for the product in
 * front of the child — so showing two is the caller composing, which is exactly
 * how a real page would do it.
 */
const DEMO_PLATFORMS: readonly GamePlatform[] = ["minecraft", "roblox"];

/**
 * Real handles, so the live lookups below actually resolve and the Minecraft
 * rows draw real skins rather than the drawn stand-in.
 */
const DEMO_USERNAME: Readonly<Record<GamePlatform, string>> = {
  minecraft: "Notch",
  roblox: "builderman",
};

/**
 * The one grid all three demos are laid out on: a label column, then a column
 * per platform.
 *
 * Shared so the identity rows line up vertically down the whole section. The
 * three demos exist to be *compared* — they are three presentations of one row —
 * and three different container widths made that impossible.
 */
const GAME_DEMO_GRID =
  "grid max-w-4xl grid-cols-[9rem_minmax(0,1fr)_minmax(0,1fr)] gap-x-8 rounded-lg border p-4";

/** The header row every demo grid opens with. */
function GameDemoHeader() {
  return (
    <>
      <div />
      {DEMO_PLATFORMS.map((platform) => (
        <DemoCaption key={platform}>{GAME_PLATFORMS[platform].name}</DemoCaption>
      ))}
    </>
  );
}

/** One person's accounts, as a surface would hold them. */
type DemoAccount = { username: string | null; externalId: string | number | null };

const EMPTY_ACCOUNTS: Readonly<Record<GamePlatform, DemoAccount>> = {
  minecraft: { username: null, externalId: null },
  roblox: { username: null, externalId: null },
};

/**
 * First capture: the same row, opened straight into edit mode.
 *
 * A register form has nothing to view yet, so `autoEdit` puts the input where
 * the name will be. Live — both verify routes are public, and committing is what
 * runs the lookup.
 */
function GameFirstCaptureDemo() {
  const [accounts, setAccounts] =
    useState<Readonly<Record<GamePlatform, DemoAccount>>>(EMPTY_ACCOUNTS);

  return (
    <div className={cn(GAME_DEMO_GRID, "items-start gap-y-3")}>
      <GameDemoHeader />
      <DemoCaption>Nothing saved yet</DemoCaption>
      {DEMO_PLATFORMS.map((platform) => (
        <div key={platform} className="space-y-1.5">
          {/* The label is the surface's, not the row's — a roster wants no label
              at all, so the component does not carry one. */}
          <Label htmlFor={undefined}>
            {GAME_PLATFORMS[platform].name} username
          </Label>
          <GameUsernameEditableRow
            platform={platform}
            username={accounts[platform].username}
            externalId={accounts[platform].externalId}
            autoEdit
            onCommit={({ username, externalId }) =>
              setAccounts((prev) => ({
                ...prev,
                [platform]: { username, externalId },
              }))
            }
          />
          <p className="text-[11px] text-muted-foreground">
            committed:{" "}
            <code>
              {accounts[platform].username ?? "null"} /{" "}
              {String(accounts[platform].externalId ?? "null")}
            </code>
          </p>
        </div>
      ))}
    </div>
  );
}

/**
 * The three fixture rows for the read-only demo: one account we have confirmed,
 * one saved name nobody ever checked, one child who has never given a name. The
 * fourth state, `checking`, is not a fixture — it belongs to a lookup in flight,
 * so it is met by committing in the demos either side of this one.
 */
const VIEW_ONLY_ROWS: readonly {
  caption: string;
  named: boolean;
  externalId: Readonly<Record<GamePlatform, string | number | null>>;
}[] = [
  {
    caption: "Verified",
    named: true,
    externalId: {
      minecraft: "8f3a1c92-77de-4b01-9c2e-a1b2c3d4e5f6",
      roblox: 68306362,
    },
  },
  {
    caption: "Saved, never checked",
    named: true,
    externalId: { minecraft: null, roblox: null },
  },
  {
    caption: "No username on the account",
    named: false,
    externalId: { minecraft: null, roblox: null },
  },
];

/**
 * The demo's own Roblox renders.
 *
 * Minecraft rows need nothing: the row derives a body or a face straight from a
 * username. Roblox has no username-addressable endpoint, so a picture has to be
 * looked up server-side and handed *in* — and a demo that skipped that step
 * showed a permanent stand-in beside a real Minecraft skin, which is a false
 * picture of the component rather than an honest one.
 *
 * **It resolves by handle, which a production surface does not.** A real surface
 * is looking at a *stored* account and goes straight to the by-id route: two
 * upstream calls, batchable, no username hop. This page has fixtures rather than
 * rows, so the only thing it holds is a handle — which makes verification the
 * only lookup available to it, and is why it is behind a button.
 *
 * **The lookup belongs here, not in the row** — the row stays fixture-pure and
 * takes a URL. Both demos call this with the same handle, so React Query serves
 * one request for the pair. While it is in flight `data` is undefined and the
 * rows draw the stand-in in a box that is already its final size, so nothing
 * moves when the render lands.
 */
function useRobloxDemoRenders(
  live: boolean,
): Readonly<Record<GameFigure, string | null>> {
  // Disabled until asked for. A Roblox verification is three upstream calls
  // against a bucket of sixty a minute shared by every IP the fleet has, and
  // this page gets opened to look at buttons far more often than to look at
  // Roblox — so it does not spend that budget on arrival.
  const { data } = useRobloxProfile(live ? DEMO_USERNAME.roblox : null);
  return { full: data?.avatarUrl ?? null, head: data?.headshotUrl ?? null };
}

/**
 * The button that spends the request.
 *
 * Stays a button once pressed, disabled with different words, so the row of
 * controls keeps its height and the rows below it do not move when the renders
 * land — the figure boxes were already at their final size, so the pictures
 * simply appear.
 */
function RobloxLiveToggle({
  live,
  onLoad,
}: {
  live: boolean;
  onLoad: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <Button variant="outline" size="sm" onClick={onLoad} disabled={live}>
        {live ? "Real Roblox renders loaded" : "Load real Roblox renders"}
      </Button>
      <span className="text-xs text-muted-foreground">
        Minecraft draws from the username with no lookup; Roblox needs a live
        verification, so it stays on the stand-in until you ask.
      </span>
    </div>
  );
}

/**
 * What to hand the row for one fixture cell.
 *
 * `undefined` for Minecraft — the three meanings of `avatarUrl` make that "let
 * the platform derive it", which is exactly right. For Roblox it is the resolved
 * URL, or `null` for the row that has no username at all: an unknown row draws
 * the stand-in whatever it is handed, and passing a face to it would be asking
 * the component to contradict itself.
 */
function demoFigureUrl(
  platform: GamePlatform,
  named: boolean,
  resolved: string | null,
): string | null | undefined {
  if (platform === "minecraft") return undefined;
  return named ? resolved : null;
}

function GameViewOnlyDemo() {
  const [live, setLive] = useState(false);
  const renders = useRobloxDemoRenders(live);

  return (
    <div className="space-y-3">
      <RobloxLiveToggle live={live} onLoad={() => setLive(true)} />
      <div className={cn(GAME_DEMO_GRID, "items-center gap-y-2")}>
        <GameDemoHeader />
        {VIEW_ONLY_ROWS.map(({ caption, named, externalId }) => (
          <Fragment key={caption}>
            <DemoCaption>{caption}</DemoCaption>
            {DEMO_PLATFORMS.map((platform) => (
              <GameUsernameRow
                key={platform}
                platform={platform}
                username={named ? DEMO_USERNAME[platform] : null}
                externalId={externalId[platform]}
                avatarUrl={demoFigureUrl(platform, named, renders.full)}
              />
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

/**
 * The editable roster, driven by local state — and by the real verify routes,
 * because committing is what runs the lookup.
 *
 * One person per row, both platforms across, so the columns line up with the two
 * demos above. Commit a name and watch the status square: the spinner sits where
 * the tick will land, and a skin arrives into the box that was already holding
 * its space.
 */
const EDITABLE_SEED: readonly {
  key: string;
  person: string;
  accounts: Readonly<Record<GamePlatform, DemoAccount>>;
}[] = [
  {
    key: "aino",
    person: "Aino",
    accounts: {
      minecraft: {
        username: "Notch",
        externalId: "8f3a1c92-77de-4b01-9c2e-a1b2c3d4e5f6",
      },
      roblox: { username: "builderman", externalId: 68306362 },
    },
  },
  {
    key: "joonas",
    person: "Joonas",
    accounts: {
      minecraft: { username: "jeb_", externalId: null },
      roblox: { username: null, externalId: null },
    },
  },
  {
    key: "petra",
    person: "Petra",
    accounts: {
      minecraft: { username: null, externalId: null },
      roblox: { username: "Roblox", externalId: 1 },
    },
  },
];

function GameEditableRowDemo() {
  const [rows, setRows] = useState(EDITABLE_SEED);

  const commit = (
    key: string,
    platform: GamePlatform,
    account: DemoAccount,
  ) =>
    setRows((prev) =>
      prev.map((row) =>
        row.key === key
          ? { ...row, accounts: { ...row.accounts, [platform]: account } }
          : row,
      ),
    );

  return (
    <div className={cn(GAME_DEMO_GRID, "items-start gap-y-1")}>
      <GameDemoHeader />
      {rows.map((row) => (
        <Fragment key={row.key}>
          <DemoCaption>{row.person}</DemoCaption>
          {DEMO_PLATFORMS.map((platform) => (
            <GameUsernameEditableRow
              key={platform}
              platform={platform}
              username={row.accounts[platform].username}
              externalId={row.accounts[platform].externalId}
              personName={row.person}
              onCommit={({ username, externalId }) =>
                commit(row.key, platform, { username, externalId })
              }
            />
          ))}
        </Fragment>
      ))}
    </div>
  );
}

/**
 * The compact figure, in every state, on both platforms — both showing a real
 * picture, the Minecraft face derived from the name and the Roblox headshot
 * resolved by the demo.
 */
function GameHeadRowDemo() {
  const [live, setLive] = useState(false);
  const renders = useRobloxDemoRenders(live);

  return (
    <div className="space-y-3">
      <RobloxLiveToggle live={live} onLoad={() => setLive(true)} />
      <div className={cn(GAME_DEMO_GRID, "items-center gap-y-2")}>
        <GameDemoHeader />
        {VIEW_ONLY_ROWS.map(({ caption, named, externalId }) => (
          <Fragment key={caption}>
            <DemoCaption>{caption}</DemoCaption>
            {DEMO_PLATFORMS.map((platform) => (
              <GameUsernameRow
                key={platform}
                platform={platform}
                figure="head"
                username={named ? DEMO_USERNAME[platform] : null}
                externalId={externalId[platform]}
                avatarUrl={demoFigureUrl(platform, named, renders.head)}
              />
            ))}
          </Fragment>
        ))}

        <DemoCaption>Checking</DemoCaption>
        {DEMO_PLATFORMS.map((platform) => (
          <GameUsernameRow
            key={platform}
            platform={platform}
            figure="head"
            username={DEMO_USERNAME[platform]}
            status="checking"
            avatarUrl={demoFigureUrl(platform, true, renders.head)}
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Add-gamer dialog (real components, inert)                          */
/* ------------------------------------------------------------------ */

/**
 * The submit, defanged. Resolves after a beat with a fixed id so the committing
 * state is actually visible, and creates nothing — the real mutation is the one
 * prop `AddGamerFormCard` takes rather than a hook it reaches for, precisely so
 * this page can hand it something inert.
 */
function inertCreateGamer(): Promise<{ gamerId: string }> {
  return new Promise((resolve) =>
    setTimeout(
      () => resolve({ gamerId: "1a8e1e2a-32f6-4c6f-9a6a-9d0f2a1b7c44" }),
      700,
    ),
  );
}

function AddGamerDialogDemo() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border p-4">
      <Button onClick={() => setOpen(true)}>Open the add-gamer dialog</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <AddGamerFormCard onOpenChange={setOpen} onCreate={inertCreateGamer} />
      </Dialog>
    </div>
  );
}

function GameAccountDemo() {
  return (
    <div className="space-y-8">
      <SubSection title="1. First time entering a username (register)">
        <p className="text-sm text-muted-foreground">
          The same row, opened straight into edit mode &mdash; there is nothing to
          view yet, so the input sits where the name will be. Live: committing
          <em> is </em>the verification, so press Enter or the tick and watch the
          status square. The label above each row belongs to the surface, not to
          the component; a roster wants none.
        </p>
        <GameFirstCaptureDemo />
      </SubSection>

      <SubSection title="2. View, no editing here">
        <p className="text-sm text-muted-foreground">
          Real pictures on both sides. Minecraft derives its skin from the
          username, so the row needs nothing; Roblox has no username-addressable
          endpoint, so somebody has to resolve one server-side and hand the URL
          in. The row itself stays fixture-pure &mdash; it takes a picture, it
          never goes and finds one. The stand-in is what the last row shows,
          because it has no username to resolve. <em>This demo</em> resolves by
          handle, behind the button, because fixtures are all it has; a real
          surface holds a <em>stored</em> account and resolves by its numeric id
          instead &mdash; two upstream calls rather than three, and one call for
          a whole roster rather than one per row.
        </p>
        <GameViewOnlyDemo />
      </SubSection>

      <SubSection title="2b. The compact figure — head instead of full">
        <p className="text-sm text-muted-foreground">
          Same row, same four states, <code>figure=&quot;head&quot;</code>: 32px
          instead of 60px, for a dense list where the whole character crowds out
          what the list is about. Two surfaces use it &mdash; the voice
          participant row and the participant chip below. Everywhere else, including the
          admin user detail page, keeps the whole figure. Both platforms are{" "}
          <em>identical</em> here
          &mdash; a Minecraft face render and a Roblox headshot are both square,
          so the 1:2-vs-1:1 divergence that makes the full figure&rsquo;s box
          differ simply does not exist. Both draw a real picture: Minecraft
          derives its face from the username, and the demo resolves the Roblox
          headshot from the same lookup as the section above &mdash; one request
          for the pair, because they ask for the same handle.
        </p>
        <GameHeadRowDemo />
      </SubSection>

      <SubSection title="3. View and edit, in place">
        <p className="text-sm text-muted-foreground">
          The same component as demo 1 without <code>autoEdit</code>. Enter
          commits, Escape cancels, and a commit runs the real lookup: the name
          appears immediately, the spinner sits in the square the tick will land
          in, and a failed lookup leaves the name saved as unverified with the
          reason underneath.
        </p>
        <GameEditableRowDemo />
      </SubSection>

      <SubSection title="4. Where both rows land — the add-gamer dialog">
        <p className="text-sm text-muted-foreground">
          The real dialog, inert: the create call is a prop rather than a hook, so
          this page hands it something that resolves after a beat and writes
          nothing. The PIN gate in front of it is skipped &mdash; it is a
          conditional on one query with nothing of its own to look at. Both game
          rows are the real thing and both commits run the real lookup; only the
          submit is defanged. They sit <em>closed</em> rather than opened, unlike
          the register form in demo 1 &mdash; the same row costs the same height
          either way, so the choice is about how much the dialog appears to be
          asking for. The gender buttons are three across at every width, which is
          what pays for the two rows fitting on a phone.
        </p>
        <AddGamerDialogDemo />
      </SubSection>

      <SubSection title="In the admin participant chip">
        <p className="text-sm text-muted-foreground">
          The chip is the draggable roster token in the product groups panel, and
          it appears in four places: the group columns, the waitlist card, the
          unassigned card and the drag overlay. A child stacks name, age/gender,
          parent and the identity row inside a narrow rail, so it takes the
          compact figure: the whole body was taller than the other three lines
          put together. An adult holding their own seat has none of those three
          facts, so the chip drops them rather than drawing blanks, and carries
          the one thing a child&rsquo;s chip has no room for &mdash; the address
          &mdash; where the parent&rsquo;s name would be. Drag is live &mdash;
          the chips below are real, and there is nowhere to drop them.
        </p>
        <ParticipantChipDemo />
      </SubSection>
    </div>
  );
}

/**
 * Chip fixtures. The ids are real generated UUIDv4s, hardcoded:
 * an identicon is hashed out of the id's hex bytes, so a readable stand-in
 * renders a degenerate square and a freshly generated one gives the same person
 * a different face on every reload.
 *
 * `marja` is an adult holding a seat of her own. She has no date of birth, no
 * gender and no game account on purpose — those live on `gamer_profiles` and
 * `minecraft_accounts`, and an adult seat has neither row.
 */
const CHIP_PEOPLE = {
  aino: "3f5f2c9a-1d7e-4c8b-9a2f-6b1e0c4d8a37",
  joonas: "c81b47e2-9f30-4a15-8d6c-2e7b5a091f4d",
  petra: "7d2a6e13-5c84-4b09-a7f1-38e9c0b2d654",
  marja: "37cbff02-0866-4259-9586-20d91010007a",
} as const;

function ParticipantChipDemo() {
  return (
    // The chip is a dnd-kit draggable, so it needs the context its real parents
    // give it. There are no droppables here — picking one up and letting go puts
    // it back, which is all this demo needs.
    <DndContext>
      <ParticipantChipRow />
    </DndContext>
  );
}

function ParticipantChipRow() {
  return (
    <div className="flex flex-wrap items-start gap-6">
      {/* The real rail width in the groups panel, so the chip is judged at the
          size it actually renders at rather than stretched across the page. */}
      <div className="w-64 space-y-2 rounded-lg border p-3">
        <DemoCaption>In a group column (w-64, the real rail)</DemoCaption>
        <ParticipantChip
          participationId="demo-1"
          participantId={CHIP_PEOPLE.aino}
          firstName="Aino"
          dateOfBirth="2014-03-11"
          gender="girl"
          parentFirstName="Sanna"
          parentLastName="Virtanen"
          minecraftUsername="Notch"
          minecraftUuid="8f3a1c92-77de-4b01-9c2e-a1b2c3d4e5f6"
          participantEmail={null}
        />
        <ParticipantChip
          participationId="demo-2"
          participantId={CHIP_PEOPLE.joonas}
          firstName="Joonas"
          dateOfBirth="2012-09-02"
          gender="boy"
          parentFirstName="Petra"
          parentLastName="Nieminen"
          minecraftUsername="jeb_"
          minecraftUuid={null}
          participantEmail={null}
        />
        <ParticipantChip
          participationId="demo-3"
          participantId={CHIP_PEOPLE.petra}
          firstName="Petra"
          dateOfBirth={null}
          gender={null}
          parentFirstName={null}
          parentLastName={null}
          minecraftUsername={null}
          minecraftUuid={null}
          participantEmail={null}
        />
        {/* The adult variant, deliberately last in the same column: the thing
            worth seeing is how it sits against three child chips at the real
            rail width, not how it looks alone. Three lines become one, the
            badge carries the difference at a glance, and the address takes the
            line the parent's name had. */}
        <ParticipantChip
          participationId="demo-5"
          participantId={CHIP_PEOPLE.marja}
          firstName="Marja"
          dateOfBirth={null}
          gender={null}
          parentFirstName={null}
          parentLastName={null}
          minecraftUsername={null}
          minecraftUuid={null}
          participantEmail="marja.korhonen@example.com"
        />
      </div>

      <div className="w-64 space-y-2 rounded-lg border p-3">
        <DemoCaption>Mid-save — greyed and undraggable</DemoCaption>
        <ParticipantChip
          participationId="demo-4"
          participantId={CHIP_PEOPLE.aino}
          firstName="Aino"
          dateOfBirth="2014-03-11"
          gender="girl"
          parentFirstName="Sanna"
          parentLastName="Virtanen"
          minecraftUsername="Notch"
          minecraftUuid="8f3a1c92-77de-4b01-9c2e-a1b2c3d4e5f6"
          participantEmail={null}
          isPending
        />
      </div>
    </div>
  );
}

function ManageBillingCardDemo() {
  return (
    <div className="grid gap-x-6 gap-y-8 sm:grid-cols-2">
      <div className="flex flex-col gap-2">
        <DemoCaption>Idle</DemoCaption>
        <ManageBillingCardView
          accounts={[]}
          onManage={() => {}}
          isOpening={false}
        />
      </div>

      <div className="flex flex-col gap-2">
        <DemoCaption>Opening (disabled)</DemoCaption>
        <ManageBillingCardView accounts={[]} onManage={() => {}} isOpening />
      </div>

      <div className="flex flex-col gap-2">
        <DemoCaption>Several billing accounts</DemoCaption>
        <ManageBillingCardView
          accounts={BILLING_ACCOUNTS_SPLIT}
          onManage={() => {}}
          isOpening={false}
        />
      </div>

      <div className="flex flex-col gap-2">
        <DemoCaption>Several accounts, one opening</DemoCaption>
        <ManageBillingCardView
          accounts={BILLING_ACCOUNTS_SPLIT}
          onManage={() => {}}
          isOpening
          openingAccountId="cus_demo_migrated"
        />
      </div>
    </div>
  );
}

