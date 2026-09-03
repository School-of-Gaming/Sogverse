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
  Check,
  AlertCircle,
  AlertTriangle,
  Info,
  Eye,
} from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ROLE_BADGE_STYLES, ROUTES } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/ui/field";
import { FaqAccordion } from "@/components/ui/faq-accordion";
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
import {
  PersonChip,
  PersonChipList,
  type PersonChipListPerson,
} from "@/components/ui/person-chip";
import { GamerFlairDialog, NewcomerBadge } from "@/components/member-flair";
import {
  HelpFeedbackCardView,
  type HelpFeedbackAudience,
} from "@/components/help/help-feedback-card-view";
import { MinecraftPasswordResetCardView } from "@/components/tools/minecraft-password-reset-card-view";
import type { MinecraftPasswordResetResult } from "@/services/minecraft-education/minecraft-education.contracts";
import { VoiceAvatar } from "@/components/voice/VoiceAvatar";
import {
  ParticipantRow,
  type ParticipantRowData,
} from "@/components/voice/ParticipantRow";
import { SwitchProfileDialog } from "@/components/family/SwitchProfileDialog";
import { SwitchGateBody } from "@/components/family/SwitchGateDialog";
import {
  SwitchAccountError,
  SWITCH_PIN_INVALID,
  SWITCH_PIN_NOT_SET,
  SWITCH_PASSWORD_INVALID,
  type SwitchAccountErrorCode,
} from "@/services/family";
import { UserRow } from "@/components/admin/user-row";
import { EnrollmentCard } from "@/components/family/EnrollmentCard";
import {
  FIXTURE_TIMEZONE,
  buildEnrollmentFixture,
  type EnrollmentFixtureSpec,
  type FixtureClock,
} from "@/components/family/mock-enrollment-fixtures";
import { futureSlot, liveNowSlot } from "@/components/preview/fixture-clock";
import {
  SessionPhotoGallery,
  SessionPhotoViewer,
  type SessionPhoto,
} from "@/components/session-feed";
import { SESSION_FEED_ADULT_ID } from "@/components/gedu/session-feed/mock-fixtures";
import { GeduContractSettingsCardView } from "@/components/gedu/contract/gedu-contract-settings-card-view";
import {
  findGeduContractAcceptance,
  GEDU_CONTRACT_CURRENT_VERSION,
} from "@/components/gedu/contract/documents";
import { buildGeduContractAcceptance } from "@/components/gedu/contract/mock-contract-fixtures";
import { useNow, useTimezone } from "@/providers";
import { useLocale, useTranslations } from "next-intl";
import { resolveLocale } from "@/lib/constants/locales";
import { computeGlowStyle } from "@/lib/voice/glow";
import { composeZones } from "@/lib/voice/zone-composition";
import { ZoneList } from "@/components/voice/ZoneList";
import { VoiceRoomContext } from "@/components/voice/VoiceRoomProvider";
import type {
  VoiceRoomContextValue,
  VoiceParticipant,
} from "@/components/voice/hooks/types";
import type {
  GamerCreation,
  GeduContractAcceptance,
  UserRole,
  VoiceZone,
} from "@/types";
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
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import {
  GAME_PLATFORMS,
  GameUsernameEditableRow,
  GameUsernameRow,
  type GameFigure,
  type GamePlatform,
} from "@/components/game-account";
import { useRobloxProfile } from "@/services/roblox";
import { ImageCatalogueView } from "@/components/admin/products/image-catalogue-view";
import { ImageActionConfirmDialog } from "@/components/admin/products/image-catalogue-confirm";
import {
  CATALOGUE_DEMO_IMAGES,
  CATALOGUE_DEMO_SHARED_IMAGE_ID,
  CATALOGUE_DEMO_UNUSED_IMAGE_ID,
  CATALOGUE_DEMO_USAGE,
} from "@/components/admin/products/image-catalogue-fixtures";
import { ParticipantChip } from "@/components/admin/products/groups/participant-chip";
import type { ChipGameIdentity } from "@/components/admin/products/groups/panel-rules";
import { DndContext } from "@dnd-kit/core";
import { AddGamerFormCard } from "@/components/family";
import {
  PRODUCT_TYPE_ORDER,
  PRODUCT_TYPE_PRESENTATION,
} from "@/components/admin/dashboard/product-type-presentation";
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

/**
 * The role badges, each label travelling with the role it belongs to.
 *
 * Paired rather than positional: the styles live in a record, and a
 * hand-written label array read off `Object.values` of it would silently
 * mislabel every badge the day somebody reordered that record. `customer` reads
 * as "Parent" because that is what the product calls the role.
 */
const ROLE_BADGE_DEMO: readonly (readonly [UserRole, string])[] = [
  ["gamer", "Gamer"],
  ["customer", "Parent"],
  ["gedu", "Gedu"],
  ["admin", "Admin"],
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
    <Tag
      id={id}
      className={`group scroll-mt-[calc(var(--header-height)+1rem)] ${className}`}
    >
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

function Swatch({ label, className }: { label: string; className: string }) {
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

/**
 * The face the speaking-glow demo wears. A real generated UUIDv4, hardcoded:
 * the identicon is hashed out of the id's hex bytes, so the viewing admin's own
 * id would give this demo a different face for every reader, and a readable
 * stand-in would give it a degenerate one.
 */
const VOICE_AVATAR_DEMO_ID = "2ccb1824-4c93-4ec6-a034-a92bd327149e";

function VoiceAvatarDemo() {
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
        userId={VOICE_AVATAR_DEMO_ID}
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

/**
 * The primitive's own states, and nothing else. The labelled consent
 * compositions built on it — a sentence, a hint, a Required/Optional chip in a
 * bordered clickable row — are `CheckboxRow`, and they are judged on the
 * surfaces that use them rather than from a demo card here.
 */
function CheckboxDemo() {
  const [newsletter, setNewsletter] = useState(false);

  return (
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
  );
}

/* ------------------------------------------------------------------ */
/*  Dialog Demo                                                        */
/* ------------------------------------------------------------------ */

/**
 * The account-switch confirmation, in the two places it is reached from: a
 * parent clicking "Join" on a voice session, and a gamer clicking "Add Gamer".
 *
 * It wears the info color because an auth action is attention-worthy without
 * being a warning.
 */
function SwitchProfileDialogDemo() {
  const [open, setOpen] = useState(false);

  return (
    <Section title="Switch Profile Dialog">
      <p className="text-sm text-muted-foreground">
        The avatar tile is the CTA &mdash; clicking it swaps the session and
        then full-page navigates.
      </p>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Open Switch Dialog
      </Button>
      <SwitchProfileDialog
        open={open}
        onOpenChange={setOpen}
        target={{
          id: "7d0cf9eb-2567-4ec8-a883-2e67b9138a98",
          role: "gamer",
          first_name: "Aino",
        }}
        redirectUrl="#"
        title="Switch to Aino's profile to join Minecraft Club?"
        oneWayWarning="You'll be signed out of your parent account."
      />
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  Switch Gate Demo                                                   */
/* ------------------------------------------------------------------ */

/**
 * A real, generated UUID even though this body draws no identicon: the same
 * fixture person is worth being able to hand to a tile demo unchanged, and a
 * readable stand-in would render a degenerate avatar the moment one did.
 */
const GATE_TARGET = {
  id: "3b41f7dc-0b4a-4a2b-9a2e-9b0f1b7c6d21",
  role: "customer" as const,
  first_name: "Riikka",
};

/** An inert commit that always refuses, with the code the box is showing off. */
function refusesWith(code: SwitchAccountErrorCode) {
  return () =>
    Promise.reject(new SwitchAccountError("demo refusal", 403, code));
}

/**
 * The credential a child pays to leave their own account, in every state it
 * has. Four boxes rather than four buttons opening one dialog: the states are
 * only worth anything next to each other, and the box below is exactly the card
 * `DialogContent` draws, so nothing about the chrome is being guessed at.
 *
 * Every commit here is inert — it refuses without touching the network — so the
 * boxes can be typed into freely. The wrong-PIN shake, the wrong-password line
 * and the switch to the no-PIN message are all real behaviour, driven by the
 * refusal code each box is given.
 */
function SwitchGateDemo() {
  const [committing, setCommitting] = useState(false);

  return (
    <Section title="Switch Gate">
      <p className="text-sm text-muted-foreground">
        What a gamer pays to leave their own account: a linked parent&rsquo;s PIN
        when a parent switched them in, the target account&rsquo;s own password
        when they signed in themselves.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <SubSection title="Parent PIN — a wrong one shakes and clears">
          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            <SwitchGateBody
              target={GATE_TARGET}
              mode="pin"
              committing={committing}
              onCommittingChange={setCommitting}
              onCommit={refusesWith(SWITCH_PIN_INVALID)}
              onClose={() => {}}
            />
          </div>
        </SubSection>

        <SubSection title="No parent PIN — enter any four digits">
          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            <SwitchGateBody
              target={GATE_TARGET}
              mode="pin"
              committing={committing}
              onCommittingChange={setCommitting}
              onCommit={refusesWith(SWITCH_PIN_NOT_SET)}
              onClose={() => {}}
            />
          </div>
        </SubSection>

        <SubSection title="Target password — a wrong one says so">
          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            <SwitchGateBody
              target={GATE_TARGET}
              mode="password"
              committing={committing}
              onCommittingChange={setCommitting}
              onCommit={refusesWith(SWITCH_PASSWORD_INVALID)}
              onClose={() => {}}
            />
          </div>
        </SubSection>

        <SubSection title="Committing — held through the navigation">
          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            {/* `committing` is pinned true here rather than reached by a click:
                on the real success path it is never cleared, because the
                document is already unloading. */}
            <SwitchGateBody
              target={GATE_TARGET}
              mode="password"
              committing
              onCommittingChange={() => {}}
              onCommit={() => new Promise<void>(() => {})}
              onClose={() => {}}
            />
          </div>
        </SubSection>
      </div>
    </Section>
  );
}

function DialogDemo() {
  const [openDialog, setOpenDialog] = useState<
    "confirm" | "destructive" | "info" | null
  >(null);

  return (
    <Section title="Dialog">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={() => setOpenDialog("confirm")}>
          Confirmation Dialog
        </Button>
        <Button
          variant="destructive"
          onClick={() => setOpenDialog("destructive")}
        >
          Destructive Dialog
        </Button>
        <Button variant="secondary" onClick={() => setOpenDialog("info")}>
          Info Dialog
        </Button>
      </div>

      <Dialog
        open={openDialog === "confirm"}
        onOpenChange={(open) => !open && setOpenDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hide Product</DialogTitle>
            <DialogDescription>
              Are you sure you want to hide &ldquo;Sogverse Pro&rdquo;? It will
              no longer be visible to parents.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(null)}>
              Cancel
            </Button>
            <Button onClick={() => setOpenDialog(null)}>Hide</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={openDialog === "destructive"}
        onOpenChange={(open) => !open && setOpenDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Product
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;Starter Pack&rdquo;? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => setOpenDialog(null)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={openDialog === "info"}
        onOpenChange={(open) => !open && setOpenDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>About Dialogs</DialogTitle>
            <DialogDescription>
              Dialogs use a portal to render above all content with a backdrop
              overlay. They dismiss on Escape key or clicking the backdrop.
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

// Roles + game fields exercise every identity state: gedu/gamer rows show the
// compact identity row (verified / unverified / "(Unknown)"), while
// non-gedu/gamer rows (and rows with no `gamePlatform`) show none. Six of them,
// because the point of the compact figure is density — one row cannot show
// whether a list breathes.
//
// **One platform for the whole list, deliberately.** The platform is the
// *room's*, resolved from the product's topic at token-mint, so every peer in a
// real room carries the same one or none at all — a mixed list would be a state
// the product cannot produce. Minecraft here because it is the common case; the
// same row on Roblox lives in the game-account section, at this exact `head`
// figure, where both platforms sit side by side.
//
// Every row passes an explicit `gameAvatarUrl: null`: a fixture surface draws
// the bundled stand-in rather than reaching a third-party skin host on load.
const DEMO_PARTICIPANTS = [
  {
    userId: "4babfc78-d197-496e-860d-48f1207f5bc6",
    userName: "Emma",
    role: "gedu",
    // Verified — username + account key.
    gamePlatform: "minecraft",
    gameUsername: "ShadowFox99",
    gameExternalId: "8f3a1c92-77de-4b01-9c2e-a1b2c3d4e5f6",
    gameAvatarUrl: null,
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
    gamePlatform: "minecraft",
    gameUsername: "JaaKarhu",
    gameExternalId: null,
    gameAvatarUrl: null,
    isLocal: false,
    isOwner: false,
    audioOn: true,
    videoOn: true,
  },
  {
    userId: "19ffd6e5-2e78-4742-a65f-6ed40b2b8b47",
    userName: "Oliver",
    role: "gamer",
    // Linked-but-unset — renders the muted "(Unknown)" row.
    gamePlatform: "minecraft",
    gameUsername: null,
    gameExternalId: null,
    gameAvatarUrl: null,
    isLocal: false,
    isOwner: false,
    audioOn: false,
    videoOn: false,
  },
  {
    userId: "8661f882-c470-4225-934d-b7330e6867d1",
    userName: "Väinö",
    role: "gedu",
    gamePlatform: "minecraft",
    gameUsername: "DarkPhoenixRising",
    gameExternalId: "2b7c4d1e-90ab-4f56-8c3d-e1f2a3b4c5d6",
    gameAvatarUrl: null,
    isLocal: false,
    isOwner: true,
    audioOn: true,
    videoOn: true,
  },
  {
    userId: "6f6a6faf-f556-43cd-8ffe-87a0573e68b5",
    userName: "Sofia",
    role: "gamer",
    gamePlatform: "minecraft",
    gameUsername: "GalaxyDestroyer9000",
    gameExternalId: "5e8f2349-67ab-4c12-9d3e-a1b2c3d4e5f6",
    gameAvatarUrl: null,
    isLocal: false,
    isOwner: false,
    audioOn: true,
    videoOn: false,
  },
  {
    // A parent on their own seat — the imported id IS the gedu roster
    // fixtures' Marja, so she wears one face everywhere by construction
    // rather than by a copied literal. Her identity slot carries the shared
    // Parent badge where a child's row shows the game identity — the
    // adult-variant grammar the rosters established, decided by the owner
    // after judging the unbadged treatment in this very demo. No game
    // identity: parents cannot link game accounts, by scope decision, and the
    // row would hide the slot for a customer even if the room had a platform.
    userId: SESSION_FEED_ADULT_ID,
    userName: "Marja",
    role: "customer",
    gamePlatform: "minecraft",
    gameUsername: null,
    gameExternalId: null,
    gameAvatarUrl: null,
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
// VoiceRoomContext, this drives them identically to the real provider, which is
// also the separation-of-concerns check this demo doubles as.
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
    over: Pick<
      VoiceParticipant,
      "sessionId" | "userId" | "userName" | "zoneId"
    > &
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
    member({
      sessionId: "s1",
      userId: "1fc70377-0a73-4c36-b6c3-5cad0643748c",
      userName: "You",
      zoneId: "lobby",
      isLocal: true,
      role: "admin",
      isOwner: true,
    }),
    member({
      sessionId: "s2",
      userId: "fea034bc-7e25-4b75-976a-0e567b993279",
      userName: "Aino",
      zoneId: "lobby",
    }),
    member({
      sessionId: "s3",
      userId: "6ee45509-c687-4d8b-88a8-e933929555e8",
      userName: "Eero",
      zoneId: "yty-glow",
      isSpeaking: true,
    }),
    member({
      sessionId: "s4",
      userId: "82d61f2c-636f-4cfb-bcd3-9f35b366229e",
      userName: "Liisa",
      zoneId: "demo-strategy",
    }),
    // A very crowded zone (25) so the horizontal scroll, chevron scroll buttons,
    // and edge fade are all exercised. Mixed English/Finnish names, with a few
    // long ones (Maximilian, Aleksanteri, …) to show label truncation.
    // Six muted members in Valor so the mic-off badge is visible in the demo.
    member({
      sessionId: "s5",
      userId: "6421f24d-01b3-47eb-a229-38b29c438715",
      userName: "Aino",
      zoneId: "yty-valor",
      audioOn: false,
    }),
    member({
      sessionId: "s6",
      userId: "c4d53024-4d40-4c2a-9bad-44909fdc333b",
      userName: "Oliver",
      zoneId: "yty-valor",
      audioOn: false,
    }),
    member({
      sessionId: "s7",
      userId: "a1df031a-f181-49f3-a964-4039d8546ee4",
      userName: "Väinö",
      zoneId: "yty-valor",
      isSpeaking: true,
    }),
    member({
      sessionId: "s8",
      userId: "9c6f8a84-daa0-424f-a0a8-dd1af4fc3fbd",
      userName: "Charlotte",
      zoneId: "yty-valor",
      audioOn: false,
    }),
    member({
      sessionId: "s9",
      userId: "10b01f6c-e047-4d61-b5f0-bb80f4ec4a55",
      userName: "Onni",
      zoneId: "yty-valor",
      audioOn: false,
    }),
    member({
      sessionId: "s10",
      userId: "1620ec58-cc23-4a3f-b3ea-3880b12d19bf",
      userName: "James",
      zoneId: "yty-valor",
      audioOn: false,
    }),
    member({
      sessionId: "s11",
      userId: "b4af1059-f201-4718-8a1b-fa81e51c48d6",
      userName: "Helmi",
      zoneId: "yty-valor",
      audioOn: false,
    }),
    member({
      sessionId: "s12",
      userId: "c7d3368f-75bd-4841-bb1f-0ccd7b01d365",
      userName: "Maximilian",
      zoneId: "yty-valor",
    }),
    member({
      sessionId: "s13",
      userId: "85b79539-938a-4787-96b6-40d85b53c923",
      userName: "Veera",
      zoneId: "yty-valor",
    }),
    member({
      sessionId: "s14",
      userId: "3f323fe9-a59f-4444-8a2b-77a6ec310153",
      userName: "Benjamin",
      zoneId: "yty-valor",
    }),
    member({
      sessionId: "s15",
      userId: "a75793f5-b793-44f0-a85e-3f91d19523c3",
      userName: "Aarni",
      zoneId: "yty-valor",
    }),
    member({
      sessionId: "s16",
      userId: "1941c285-0589-4d4d-b23d-a7b1b9aa01f0",
      userName: "Sophia",
      zoneId: "yty-valor",
    }),
    member({
      sessionId: "s17",
      userId: "dc3a240c-0397-4300-bbbe-23c56f0287b3",
      userName: "Niilo",
      zoneId: "yty-valor",
    }),
    member({
      sessionId: "s18",
      userId: "147929ab-93ab-4a24-9d31-8786e14fe771",
      userName: "Alexandra",
      zoneId: "yty-valor",
    }),
    member({
      sessionId: "s19",
      userId: "2fbddcc4-f8e0-4bf9-b59c-9ac975e54086",
      userName: "Iiro",
      zoneId: "yty-valor",
    }),
    member({
      sessionId: "s20",
      userId: "3ee04404-1425-4af8-a027-9cfa925f6273",
      userName: "William",
      zoneId: "yty-valor",
    }),
    member({
      sessionId: "s21",
      userId: "859834f2-89b4-4902-8ae9-ae3d3dbfd3e0",
      userName: "Eveliina",
      zoneId: "yty-valor",
    }),
    member({
      sessionId: "s22",
      userId: "b039e677-6e77-4cf3-af9d-bd5e5c2fabbc",
      userName: "Liam",
      zoneId: "yty-valor",
    }),
    member({
      sessionId: "s23",
      userId: "bc17a11c-48f3-46c7-90dd-f1d01da20456",
      userName: "Aleksanteri",
      zoneId: "yty-valor",
    }),
    member({
      sessionId: "s24",
      userId: "bc5b1c08-6b0d-4265-af42-cf42e12d98da",
      userName: "Isabella",
      zoneId: "yty-valor",
    }),
    member({
      sessionId: "s25",
      userId: "2330764b-f7e5-483a-875d-691532be11e5",
      userName: "Pinja",
      zoneId: "yty-valor",
    }),
    member({
      sessionId: "s26",
      userId: "156922f3-8a32-48d6-b7ea-7c8de8b07440",
      userName: "Matias",
      zoneId: "yty-valor",
    }),
    member({
      sessionId: "s27",
      userId: "a094598f-8ab8-4787-83ff-849e0653a58a",
      userName: "Tuuli",
      zoneId: "yty-valor",
    }),
    member({
      sessionId: "s28",
      userId: "720504a5-4d6f-496b-b2a1-038fc5c6bc45",
      userName: "Kaarina",
      zoneId: "yty-valor",
    }),
    member({
      sessionId: "s29",
      userId: "35d24824-26c7-417b-9b6b-32798e1bfe57",
      userName: "Theodore",
      zoneId: "yty-valor",
    }),
    // Two confined to the private zone. In the real app their media is
    // SFU-blocked for outsiders (canReceive) — here they're just members of the
    // locked zone, rendered blurred behind the PrivacyScreen for an outsider.
    member({
      sessionId: "s30",
      userId: "791c29d1-e2c0-4a9f-bcc8-9d888bf72610",
      userName: "Onni",
      zoneId: "demo-quiet",
    }),
    member({
      sessionId: "s31",
      userId: "86592793-36ad-4247-a942-f2386cd27b43",
      userName: "Venla",
      zoneId: "demo-quiet",
    }),
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

const DAY_MS = 86_400_000;

/**
 * A join stamp `days` before the demo clock. The flair fixtures are written in
 * whole days ago rather than as literal timestamps, because a hardcoded ISO
 * string ages: a badge pinned to a date in 2026 reads "28 days" this month and
 * renders nothing the next, and the badge series would quietly go blank.
 */
function daysAgoIso(now: Date, days: number): string {
  return new Date(now.getTime() - days * DAY_MS).toISOString();
}

/** Oliver — the fixture whose mic + camera arrive locked. */
const PARTICIPANT_OLIVER_ID = "19ffd6e5-2e78-4742-a65f-6ed40b2b8b47";
/**
 * The voice room sidebar's list: avatar, name, moderator controls (for
 * non-owner remote participants) and status indicators. The lock buttons are
 * live and toggle between the ghost and destructive button variants.
 *
 * **The staff flair a Gedu sees on these rows is not here**, and that is the
 * one-home rule doing its job: a newcomer badge and a note marker are read off
 * a rail of rows, at the rail's width, beside the zone cards — so the Voice
 * room preview scene is where they are judged, and a second copy of them on a
 * card would be the copy that goes stale.
 */
function ParticipantCardDemo() {
  const [locks, setLocks] = useState<
    Record<string, { audio: boolean; video: boolean }>
  >({
    [PARTICIPANT_OLIVER_ID]: { audio: true, video: false },
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
/*  Member flair — newcomer badge & the Gedu note                       */
/* ------------------------------------------------------------------ */

/**
 * The newcomer badge across its whole window, in one line.
 *
 * It earns a section because both surfaces that draw it — the gedu roster and
 * the voice room rail — show a member at one age, so no page can show the
 * series. Four stops, one per pip, is the series: the block drains a pip every
 * seven and a half days and the badge stops rendering altogether at thirty, so
 * these four are every state a Gedu will ever meet.
 */
function NewcomerBadgeDemo() {
  const [now] = useState(() => new Date());

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {NEWCOMER_BADGE_STOPS.map((days) => (
          <div key={days} className="flex items-center gap-2">
            <NewcomerBadge joinedAt={daysAgoIso(now, days)} now={now} />
            <span className="text-xs text-muted-foreground">Day {days}</span>
          </div>
        ))}
      </div>
      <p className="max-w-prose text-sm text-muted-foreground">
        The pips drain bottom-right first, so the block changes shape rather
        than just dimming — a badge is readable on its own row, without another
        one beside it to compare against. At day 30 it stops rendering
        altogether; there is no faint permanent residue. The tooltip carries the
        exact age.
      </p>
    </div>
  );
}

/** One day inside each pip of the window, so all four states show at once. */
const NEWCOMER_BADGE_STOPS = [0, 8, 16, 24];

/**
 * The per-gamer dialog itself — an overlay, so the style guide is its home: it
 * opens above whatever summoned it and the page behind it contributes nothing to
 * how it reads.
 *
 * **What has to be judged here is the two-audience split.** The creation on top
 * is read by the member's own family; the private note under it is staff working
 * memory. Getting those the wrong way round is the only real risk the dialog
 * carries, so the bordered block and the padlocked one have to read as opposites
 * at a glance, with the audience stated in words in each — and one page is where
 * they are compared, because a reviewer sees both halves in one screenshot.
 *
 * Both halves are live against local state, including the two behaviours worth
 * checking here: saving an empty note is a real action that retires it rather
 * than a no-op, and **one creation field filled without the other** refuses the
 * save with a line under it, which is what keeps the database's CHECK a backstop
 * rather than a routine error path. Emptying both fields is the third, and is
 * how a creation is cleared.
 */
function GamerFlairDialogDemo() {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(
    "Quiet in big groups — pair her rather than letting her pick a partner. Has warmed up a lot since autumn.",
  );
  // One entry, because one is what the editor authors — the wire shape is still
  // an array, and a demo seeding two would be showing a state no Gedu can reach.
  const [creations, setCreations] = useState<readonly GamerCreation[]>([
    {
      title: "Underwater dome with the working airlock",
      url: "https://www.planetminecraft.com/project/siiri-dome/",
    },
  ]);

  return (
    <div className="space-y-2">
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Open the dialog about Siiri
      </Button>
      <p className="text-xs text-muted-foreground">
        {note === "" && creations.length === 0
          ? "Nothing recorded — the dialog opens on the add flow, and the roster button is dimmed."
          : `${note === "" ? "No note" : "Has a note"}, ${creations.length} creation${creations.length === 1 ? "" : "s"}.`}
      </p>
      <GamerFlairDialog
        open={open}
        onOpenChange={setOpen}
        name="Siiri"
        note={note}
        lastEditedBy="Sanna"
        creations={creations}
        onSaveNote={setNote}
        onSaveCreations={setCreations}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Family — Enrollment Card                                            */
/* ------------------------------------------------------------------ */

/** The site the one in-person fixture is held at. */
const ENROLLMENT_DEMO_SITE = "Kirjasto Oodi, Helsinki";

/** The three-way comparison's columns, in the order they are read. */
const ENROLLMENT_AUDIENCES = ["customer", "gamer", "self"] as const;
type EnrollmentAudience = (typeof ENROLLMENT_AUDIENCES)[number];

/**
 * Every state the enrollment card can be in, side by side.
 *
 * It earns a style-guide section rather than a preview scene because it is the
 * one component both family dashboards are built out of: no single page owns
 * it, and no page shows more than a few of its states at once. The two
 * dashboards' own scenes are still where it gets judged *in place* — this is
 * where the states get judged against each other.
 *
 * The card states the **schedule**, not the next session: the next session
 * lives in the Join button's locked label and in the Live badge, so a weekly
 * club is one card all term instead of one card per week. The schedule sentence
 * is the shared product-schedule formatter's, and the footer answers the one
 * remaining question in whichever way this enrollment can.
 *
 * **Three audiences, and that is the second reason this section exists.** Two
 * of the footers on this card have three wordings — a parent reading about
 * their child, the child reading about themselves, and a parent reading about a
 * seat of their own — and a page can only ever be one of the three. Those two
 * states, and only those two, are laid out as a three-column matrix, so the
 * three wordings of one footer land beside each other on one line: three
 * versions of a sentence stacked in three blocks can only be compared from
 * memory, which is the one thing this section exists to avoid.
 *
 * **Every other state runs two-up underneath, at a width the card can be read
 * at.** Those states have one wording, not three, so a nine-row matrix spent
 * two of its three columns on dashes to hold a comparison they do not have —
 * a slot held open beside content it will never sit next to — and squeezed the
 * one column that was full to a third of the width. The parent's own seat
 * carries the two extra states it adds in a block of its own below that. No
 * state/audience pair the matrix used to render was dropped in the reshape.
 *
 * The dashed cells were saying one thing worth keeping: the child never meets a
 * state that is about money, and the parent's own seat renders the rest exactly
 * as the card about their child does. That is a fact about the props rather
 * than about the layout — the child's card cannot be handed a portal or a leave
 * handler at all — so it is written down here instead of drawn twelve times.
 *
 * Two of the card's own rules are why several of these states look the way they
 * do: nothing on a card may promise there is more inside when there is not, so
 * a queue place and an unplaced seat drop their link, chevron and hover
 * together; and the corner means an alarm the parent can act on, which is why a
 * cancelled membership is a quiet line in the body instead — the parent chose
 * it, so it is confirmation rather than a problem to fix.
 *
 * The fixtures go through `buildEnrollmentFixture`, the same builder the two
 * dashboard scenes use, so the schedule sentence and the next session are the
 * real derivations rather than authored prose: the live card's Join is lit
 * because its slot genuinely started twenty-five minutes ago, and the locked
 * one's label names a time the shared clock will actually reach.
 */
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
      // The same queue place, asked. Thirty hours into a five-day window, so
      // the deadline reads as a real moment rather than as either edge of the
      // window. It belongs in the matrix beside the other two for exactly the
      // reason they are there: the block is worded three ways, and only the
      // child's copy has no way to answer it.
      seatOffered: build({
        ...remoteClub,
        participationId: "demo-enrollment-seat-offered",
        productName: "Valheim Survival Club",
        slots: [futureSlot(now, 6, "15:00", 90, FIXTURE_TIMEZONE)],
        waitlistPosition: 3,
        seatOfferedHoursAgo: 30,
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

  // The seat offer's answer, inert the same way. It resolves rather than
  // rejecting, which leaves the buttons committed and the spinner running —
  // which is what a real answer leaves behind, since the refetch that follows
  // takes the card off the waitlist band entirely.
  const inertAnswer = () => Promise.resolve("accepted" as const);

  // One card. The three arms take different props rather than one `audience`
  // string, which is the point: the child's card cannot be handed a portal or a
  // leave handler at all, and the parent's own seat has no `onJoinClick` to
  // hand it. That last one is the invisible difference between the two adult
  // arms — with no `onJoinClick` the button falls back to a plain link straight
  // to the room, rather than opening the switch-profile dialog a child's card
  // opens.
  const cell = (
    audience: EnrollmentAudience,
    enrollment: (typeof cards)[keyof typeof cards],
  ) => {
    if (audience === "gamer") {
      return <EnrollmentCard enrollment={enrollment} audience="gamer" />;
    }
    if (audience === "self") {
      return (
        <EnrollmentCard
          enrollment={enrollment}
          audience="self"
          onOpenPortal={inert}
          onLeaveWaitlist={inert}
          onRespondToSeatOffer={inertAnswer}
        />
      );
    }
    return (
      <EnrollmentCard
        enrollment={enrollment}
        audience="customer"
        gamerFirstName="Aino"
        onOpenPortal={inert}
        onJoinClick={inert}
        onLeaveWaitlist={inert}
        onRespondToSeatOffer={inertAnswer}
      />
    );
  };

  // The states whose footer is worded three ways. They are the matrix.
  const compared: readonly {
    label: string;
    enrollment: (typeof cards)[keyof typeof cards];
  }[] = [
    { label: "Awaiting placement", enrollment: cards.awaiting },
    { label: "Waitlisted", enrollment: cards.waitlisted },
    // Directly under the plain queue place, because the pair is the comparison
    // worth having: the leave link stands down when the offer arrives, and
    // seeing the two rows together is the only way to notice that.
    { label: "Seat offered", enrollment: cards.seatOffered },
  ];

  // Everything else, one wording each, at a width the card reads at.
  const customerOnly: typeof compared = [
    { label: "Live", enrollment: cards.live },
    { label: "Locked", enrollment: cards.locked },
    { label: "Failing card", enrollment: cards.badged },
    { label: "Cancelled", enrollment: cards.cancelled },
    { label: "Cancelled, window used up", enrollment: cards.cancelledNoDate },
    { label: "In person", enrollment: cards.inPerson },
    { label: "Finished", enrollment: cards.finished },
  ];

  // The two the parent's own seat adds beyond the matrix.
  const selfOnly: typeof compared = [
    { label: "Live", enrollment: cards.live },
    { label: "Failing card", enrollment: cards.badged },
  ];

  return (
    <div className="space-y-10">
      {/* The header row and each state's row are separate grids on the same
          column template, so the captions sit over their columns without the
          state label having to span the grid. */}
      <div className="space-y-6">
        <div className="grid items-start gap-6 lg:grid-cols-3">
          <DemoCaption>customer &mdash; a parent about their child</DemoCaption>
          <div className="space-y-2">
            <DemoCaption>gamer &mdash; the child about themselves</DemoCaption>
            <p className="text-sm text-muted-foreground">
              Only the two footers that speak <em>about</em> a child on the
              parent&rsquo;s page speak <em>to</em> them here, and money is gone
              entirely: no corner badge, no won&rsquo;t-renew line, and no way
              to give up a place in line &mdash; not hidden, but unreachable.
            </p>
          </div>
          <div className="space-y-2">
            <DemoCaption>
              self &mdash; a parent about their own seat
            </DemoCaption>
            <p className="text-sm text-muted-foreground">
              A for-parents product puts the reader in the seat, so the two
              footers move into the second person again &mdash; and the leave
              dialog behind the waitlist card names nobody, because there is
              nobody but them to name. Money stays, since it is still their card
              being charged.
            </p>
          </div>
        </div>

        {compared.map(({ label, enrollment }) => (
          <div key={enrollment.participationId} className="space-y-3">
            <DemoCaption>{label}</DemoCaption>
            <div className="grid items-start gap-6 lg:grid-cols-3">
              {ENROLLMENT_AUDIENCES.map((audience) => (
                <div key={audience}>{cell(audience, enrollment)}</div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Every other state, on a parent&rsquo;s card about their child.
        </p>
        <div className="grid items-start gap-x-6 gap-y-8 lg:grid-cols-2">
          {customerOnly.map(({ label, enrollment }) => (
            <div key={enrollment.participationId} className="space-y-3">
              <DemoCaption>{label}</DemoCaption>
              {cell("customer", enrollment)}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          The parent&rsquo;s own seat, in the two states the comparison above
          does not carry it in.
        </p>
        <div className="grid items-start gap-x-6 gap-y-8 lg:grid-cols-2">
          {selfOnly.map(({ label, enrollment }) => (
            <div key={enrollment.participationId} className="space-y-3">
              <DemoCaption>{label}</DemoCaption>
              {cell("self", enrollment)}
            </div>
          ))}
        </div>
      </div>
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
// bar = empty club, empty bar = full club. Color escalates with scarcity
// (green → yellow at ≤2 left).
//
// It is shared by the product cards and the detail-page signup panel.
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
    label: "Full, no waitlist — 0 of 15",
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

/**
 * The shop's browse cards, one per mocked product, grouped by product type.
 *
 * Between them the cards cover every registration state, including one a parent
 * reaches only by leaving a tab open past midnight — and because a card that
 * opens takes the reader to that same mock's full detail page in the public
 * layout, the registration signup panel needs no separate demo here.
 *
 * Caps and waitlists are legal on every type now, so the pairs to read against
 * each other are the capped non-muni ones. The muni countdown scenarios are the
 * only pre-open ones, because registration timing is still a municipality-only
 * setting.
 */
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
/*  Product image catalogue                                            */
/* ------------------------------------------------------------------ */

/**
 * The catalogue dialog's presentational core, driven entirely by fixtures.
 *
 * Every action resolves without touching anything: this demo exists to look at
 * the layout, the reserved badge slot, the reference column and the two
 * confirms, not to move data. The two confirms also have their own entry points
 * because their interesting difference is the *count* — an unused picture is a
 * plain yes/no, and one 22 products share is a list with a count-bearing button
 * pinned under it.
 */
function ImageCatalogueDemo() {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    action: "replace" | "remove";
    imageId: string;
  } | null>(null);

  const confirmImage = CATALOGUE_DEMO_IMAGES.find(
    (image) => image.id === confirm?.imageId,
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Open catalogue
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            setConfirm({
              action: "remove",
              imageId: CATALOGUE_DEMO_SHARED_IMAGE_ID,
            })
          }
        >
          Remove &mdash; 22 products
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            setConfirm({
              action: "replace",
              imageId: CATALOGUE_DEMO_SHARED_IMAGE_ID,
            })
          }
        >
          Replace &mdash; 22 products
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            setConfirm({
              action: "remove",
              imageId: CATALOGUE_DEMO_UNUSED_IMAGE_ID,
            })
          }
        >
          Remove &mdash; no products
        </Button>
      </div>

      <Dialog open={open} size="wide" onOpenChange={setOpen}>
        <ImageCatalogueView
          images={CATALOGUE_DEMO_IMAGES}
          usage={CATALOGUE_DEMO_USAGE}
          selectedId={selectedId}
          onSelectTile={setSelectedId}
          onUse={() => setOpen(false)}
          onUpload={() => Promise.resolve()}
          onRename={() => Promise.resolve()}
          onReplace={() => Promise.resolve()}
          onRemove={() => Promise.resolve()}
          onClose={() => setOpen(false)}
        />
      </Dialog>

      {confirm && confirmImage && (
        <ImageActionConfirmDialog
          open
          onOpenChange={(next) => !next && setConfirm(null)}
          action={confirm.action}
          label={confirmImage.label}
          products={CATALOGUE_DEMO_USAGE[confirmImage.id] ?? []}
          onConfirm={() => {
            setConfirm(null);
            return Promise.resolve();
          }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Product type colours                                               */
/* ------------------------------------------------------------------ */

/**
 * The product-type mark: the sidebar's glyph for a type, tinted with that
 * type's colour.
 *
 * **It is here rather than only in the dashboard's preview scene because no one
 * page owns it.** The mark is spoken by the key rail, the schedule chips, the
 * attention cards and the coming-up feed, and by any admin surface that later
 * needs to say "this is a camp" — so the four colours have nowhere else they
 * can be seen together, at the sizes they are actually drawn, without a page's
 * own composition getting in the way.
 *
 * **The second row is the reason the section is worth its space.** The type
 * glyphs sit directly above the state marks they share rows with on the live
 * page, so the question a categorical palette exists to answer — can any of
 * these four be mistaken for "something is wrong here" — is settled by looking
 * down rather than by remembering. A hue that drifts toward warning amber or
 * success green shows up here before it shows up in front of an admin.
 */
function ProductTypePaletteDemo() {
  const tType = useTranslations("admin.products.types");

  return (
    <Section title="Product Type Colours">
      <SubSection title="The mark, at the size the key draws it">
        <ul className="flex flex-wrap gap-x-6 gap-y-2">
          {PRODUCT_TYPE_ORDER.map((productType) => {
            const presentation = PRODUCT_TYPE_PRESENTATION[productType];
            const Icon = presentation.icon;
            return (
              <li
                key={productType}
                className="flex items-center gap-2 text-xs leading-tight"
              >
                {/* Tile and glyph are one mark, not a swatch beside an icon —
                    two elements would say the same thing twice and imply they
                    were two facts. */}
                <span
                  className={cn(
                    "grid h-7 w-7 shrink-0 place-items-center rounded-md",
                    presentation.tint,
                  )}
                >
                  <Icon
                    className={cn("h-4 w-4", presentation.text)}
                    aria-hidden
                  />
                </span>
                <span className="min-w-0">
                  {tType(`${presentation.i18nKey}.plural`)}
                </span>
              </li>
            );
          })}
        </ul>
      </SubSection>

      <SubSection title="Against the state marks it shares a row with">
        <div className="space-y-2">
          {/* Chip size — the size the mark is drawn at everywhere it is dense. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {PRODUCT_TYPE_ORDER.map((productType) => {
              const presentation = PRODUCT_TYPE_PRESENTATION[productType];
              const Icon = presentation.icon;
              return (
                <span
                  key={productType}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <Icon
                    className={cn("h-3.5 w-3.5 shrink-0", presentation.text)}
                    aria-hidden
                  />
                  {tType(`${presentation.i18nKey}.label`)}
                </span>
              );
            })}
          </div>

          {/* The four state colours at the same size, wearing the glyphs the
              live page gives them. Not a simulation of that page — just the
              colours, close enough to compare against the row above. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle
                className="h-3.5 w-3.5 shrink-0 text-destructive"
                aria-hidden
              />
              Needs attention
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle
                className="h-3.5 w-3.5 shrink-0 text-warning"
                aria-hidden
              />
              Open issue
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Check
                className="h-3.5 w-3.5 shrink-0 text-success"
                aria-hidden
              />
              All clear
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 shrink-0 text-info" aria-hidden />
              Information
            </span>
          </div>
        </div>
      </SubSection>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  Session photos — the shared gallery and its viewer                 */
/* ------------------------------------------------------------------ */

/**
 * The fixture art, with its real dimensions.
 *
 * The `id` field carries a path rather than a UUID on purpose: the session-image
 * URL helper passes a leading-slash value straight through, so demo art travels
 * in the same field a stored photo's id does and the gallery needs no
 * demo-only prop. The files are genuine JPEGs — the optimizer has to be able to
 * actually serve them — and the numbers below are the files' own pixel sizes,
 * because sizing from the stored dimensions is the whole behaviour under test.
 */
const SESSION_PHOTO_ART = {
  build: { id: "/preview-art/session-build.jpg", width: 1600, height: 900 },
  arena: { id: "/preview-art/session-arena.jpg", width: 1600, height: 900 },
  parkour: { id: "/preview-art/session-parkour.jpg", width: 1440, height: 810 },
  badge: { id: "/preview-art/session-badge.jpg", width: 1200, height: 1200 },
  tower: { id: "/preview-art/session-tower.jpg", width: 900, height: 1600 },
} as const;

/**
 * A full report's worth of photos, at the cap and in mixed ratios — the set the
 * gallery cases and the viewer's paging demo both draw, so the row and the
 * overlay are demonstrably showing the same five pictures.
 */
const SESSION_PHOTO_SET: readonly SessionPhoto[] = [
  SESSION_PHOTO_ART.build,
  SESSION_PHOTO_ART.badge,
  SESSION_PHOTO_ART.tower,
  SESSION_PHOTO_ART.parkour,
  SESSION_PHOTO_ART.arena,
];

const SESSION_PHOTO_CASES: readonly {
  caption: string;
  photos: readonly SessionPhoto[];
  /** A width cap on the box the gallery is drawn in, where the point of the
   *  case is how the row behaves inside it. */
  frameClassName?: string;
}[] = [
  {
    caption: "Five — the cap, mixed ratios",
    photos: SESSION_PHOTO_SET,
  },
  {
    caption: "One",
    photos: [SESSION_PHOTO_ART.arena],
  },
  {
    caption: "A portrait beside a landscape",
    photos: [SESSION_PHOTO_ART.tower, SESSION_PHOTO_ART.build],
  },
  {
    // 312px is what a 360px phone leaves after the dashboard layout's own
    // gutter, which is the width the mobile floor is actually judged at.
    caption: "Five, at the 360px floor (312px of card)",
    photos: SESSION_PHOTO_SET,
    frameClassName: "w-[312px]",
  },
];

function SessionPhotosDemo() {
  // One overlay, so one piece of state — which set is open and where in it.
  // The single-photo case is a set of one rather than a second holder: it is
  // the same component answering a shorter list, which is the whole of what
  // hides its arrows.
  const [viewer, setViewer] = useState<{
    photos: readonly SessionPhoto[];
    index: number;
  } | null>(null);

  return (
    <Section title="Session photos">
      <p className="text-sm text-muted-foreground -mt-2">
        The photos attached to a session report, drawn identically on the staff
        feed and the family one &mdash; a wrapping row of thumbnails that share
        a <strong>height</strong>, keep their own widths and sit{" "}
        <strong>centred</strong> in the row, so mixed ratios sit together
        uncropped and a part-full last line reads as a set rather than as a row
        that ran out. Every box is sized by arithmetic from the stored
        dimensions, never from a decoded image, which is what keeps the row from
        reshuffling as the JPEGs land.
      </p>

      <SubSection title="Gallery">
        <div className="grid gap-6 xl:grid-cols-2">
          {SESSION_PHOTO_CASES.map((demoCase) => (
            <div key={demoCase.caption} className="space-y-2">
              <DemoCaption>{demoCase.caption}</DemoCaption>
              <div
                className={cn(
                  "rounded-lg border bg-card p-4",
                  demoCase.frameClassName,
                )}
              >
                <SessionPhotoGallery photos={demoCase.photos} />
              </div>
            </div>
          ))}
        </div>
      </SubSection>

      <SubSection title="Fullscreen viewer">
        <p className="text-sm text-muted-foreground">
          Tapping any thumbnail above opens it; the two buttons here open it
          directly, because an overlay can only be looked at one at a time. It
          takes the whole viewport &mdash; dark ground, the picture contained
          inside it &mdash; and it <strong>pages through the set</strong> with
          the two side arrows or the left/right arrow keys, wrapping at both
          ends so neither control is ever sitting there unable to act. A set of
          one gets no arrows at all. Escape, the backdrop, the margins beside
          the picture, the picture itself and the corner button all close it;
          the three controls do not, which is why pressing next is never also a
          request to leave. The overlay itself is the shared{" "}
          <strong>FullscreenImageViewer</strong> &mdash; the chat log opens the
          same one over a send&rsquo;s burst of images, in its own words &mdash;
          and what is drawn here is the session feed&rsquo;s set going into it.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() =>
              setViewer({ photos: SESSION_PHOTO_SET, index: 0 })
            }
          >
            Open the five-photo set
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              setViewer({ photos: [SESSION_PHOTO_ART.tower], index: 0 })
            }
          >
            Open a single photo
          </Button>
        </div>
        <SessionPhotoViewer
          photos={viewer?.photos ?? []}
          index={viewer?.index ?? null}
          onIndexChange={(index) =>
            setViewer((open) => (open === null ? null : { ...open, index }))
          }
          onClose={() => setViewer(null)}
        />
      </SubSection>
    </Section>
  );
}

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
            <span className="text-sm font-medium text-success">Success</span>
            <span className="text-sm font-medium text-info">Info</span>
            <span className="text-sm font-medium text-warning">Warning</span>
          </div>
        </SubSection>
      </Section>

      <ProductTypePaletteDemo />

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
          {/* The same six, one prop apart, directly under themselves — the
              disabled treatment is only judgeable against the enabled one. */}
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="default" disabled>
              Default
            </Button>
            <Button variant="destructive" disabled>
              Destructive
            </Button>
            <Button variant="outline" disabled>
              Outline
            </Button>
            <Button variant="secondary" disabled>
              Secondary
            </Button>
            <Button variant="ghost" disabled>
              Ghost
            </Button>
            <Button variant="link" disabled>
              Link
            </Button>
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

      <Section title="Badge">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="default">Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="destructive">Destructive</Badge>
          <Badge variant="outline">Outline</Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-4 mb-2">Role badges</p>
        <div className="flex flex-wrap items-center gap-3">
          {ROLE_BADGE_DEMO.map(([role, label]) => (
            <Badge key={role} className={ROLE_BADGE_STYLES[role]}>
              {label}
            </Badge>
          ))}
        </div>
      </Section>

      <Section title="Input & Label">
        <SubSection title="Field — the canonical labelled-field wrapper">
          <p className="text-sm text-muted-foreground mb-4">
            House rule for required vs. optional: fields are{" "}
            <strong>required by default and carry no marker</strong>; genuinely
            optional fields get <code>optional</code>, which renders a muted{" "}
            <code>(optional)</code> suffix. We mark the exceptions, not the norm
            — never an asterisk on required fields.
          </p>
          {/*
            Use <Field> for every labelled input — it owns the label, the
            label→input spacing, and the optional hint. Do not hand-roll a
            <Label> + input group.
          */}
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
              <Input
                id="demo-field-required"
                placeholder="e.g. Jane"
                autoComplete="off"
              />
            </Field>
            <Field label="Phone number" htmlFor="demo-field-optional" optional>
              <Input
                id="demo-field-optional"
                type="tel"
                placeholder="+358 …"
                autoComplete="off"
              />
            </Field>
            <Field
              label="Password"
              htmlFor="demo-field-hint"
              hint="Must be at least 8 characters."
            >
              <Input
                id="demo-field-hint"
                type="password"
                autoComplete="new-password"
              />
            </Field>
            {/*
              The icon variant, for a label that has become a title — one
              carrying a fact beyond the field's name, such as who ends up
              reading what is typed in. The glyph is decorative and adds
              nothing to the accessible name; the label text is what states
              the fact.
            */}
            <Field
              label="Visible to families"
              htmlFor="demo-field-icon"
              icon={Eye}
              hint="Everyone enrolled here can read this."
            >
              <Input
                id="demo-field-icon"
                placeholder="Say hello…"
                autoComplete="off"
              />
            </Field>
          </form>
        </SubSection>

        <SubSection title="Textarea — the multi-line control">
          <p className="text-sm text-muted-foreground mb-4">
            <code>&lt;Textarea&gt;</code> is the multi-line sibling of{" "}
            <code>&lt;Input&gt;</code> — same border, padding, and the
            load-bearing <code>text-base</code> (anything under 16px makes iOS
            Safari auto-zoom and horizontal-scroll the page on focus).
          </p>
          {/*
            Size it with `rows`; add `resize-y` for a user-resizable box. Wrap
            it in a <Field> exactly like an input.
          */}
          <div className="grid gap-6 md:grid-cols-2 max-w-2xl">
            <Field label="Short description" htmlFor="demo-textarea">
              <Textarea
                id="demo-textarea"
                rows={3}
                placeholder="A sentence or two…"
              />
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

      <Section title="Checkbox">
        <CheckboxDemo />
      </Section>

      <Section title="Avatar & Identicon">
        {/* Five unrelated ids first — the pattern is hashed out of the id's
            hex bytes, so a near-identical series would give five people one
            face. */}
        <div className="flex flex-wrap items-end gap-4">
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
          {/* The size step, appended to the row of ids rather than repeated
              below it — and both of its cells carry the same id, because a
              step only reads against the same pattern at the other size.
              Measuring 48px against one of the five faces to the left would
              be measuring two differences at once. */}
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
      </Section>

      <Section title="Person chip">
        {/* The avatar box and the identicon's pixel size are paired inside the
            component, so a call site can't desync them. `compact` is for a line
            that already carries something else (a rail row with a button beside
            the chips); the default size is for a row of chips on their own
            line. */}
        <p className="max-w-prose text-sm text-muted-foreground">
          A person as a pill — identicon plus first name.
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
          {/* The rail row already shows a gamer count, so an unlabelled set of
              faces would read as children rather than as the Gedus teaching the
              group — which is why that surface labels them. */}
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              Labelled, as the product page&rsquo;s rail does it
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
      </Section>

      <Section title="Member flair — newcomer badge & the per-gamer dialog">
        <p className="max-w-prose text-sm text-muted-foreground">
          The marks a Gedu reads off a roster before they read a name, and the
          dialog behind them. The badge never reaches a family surface: the data
          behind it comes from staff-scoped reads, so a parent&rsquo;s page has
          nothing to pass. The dialog is where that stops being the whole story
          — the note in it is staff-only for ever, and the creations under it are
          read by the member&rsquo;s own family, which is why each half states
          its audience above the fields.
        </p>
        <p className="max-w-prose text-sm text-muted-foreground">
          The glyph and the note marker are both picked here — three options can
          only be judged side by side, and one page can only ever draw one of
          them. How the badge thins out across a member&rsquo;s first month
          cannot be shown this way at all: it is a whole roster read as a
          series, so it lives in the{" "}
          <span className="font-medium text-foreground">Gedu product page</span>{" "}
          and <span className="font-medium text-foreground">Voice room</span>{" "}
          preview scenes, which also carry a switcher for everything on this
          page.
        </p>
        <SubSection title="The newcomer badge">
          <NewcomerBadgeDemo />
        </SubSection>
        <SubSection title="The per-gamer dialog">
          <GamerFlairDialogDemo />
        </SubSection>
      </Section>

      <Section title="FAQ accordion">
        <p className="text-sm text-muted-foreground">
          Every FAQ on the site is drawn as this list. The caller resolves its
          own strings and composes each answer, so an answer can be one
          paragraph, several, or carry a link. Given no items the component
          renders nothing at all — there is no empty state to show, which is why
          that case is pinned in a unit test instead of demoed here.
        </p>
        <SubSection title="A list of questions">
          <div className="max-w-3xl">
            <FaqAccordion
              items={[
                {
                  key: "plain",
                  question: "What is the difference between clubs, camps and events?",
                  answer: (
                    <p>
                      Clubs meet on a recurring schedule. Camps run across
                      multiple days during school breaks. Events are one-off
                      get-togethers.
                    </p>
                  ),
                },
                {
                  key: "two-paragraphs",
                  question: "What equipment does my child need?",
                  answer: (
                    <>
                      <p>
                        A computer that runs the game, a headset with a
                        microphone, and a reasonably steady connection.
                      </p>
                      <p>
                        Camps and events sometimes run on site, in which case the
                        room provides the machines.
                      </p>
                    </>
                  ),
                },
                {
                  key: "with-a-link",
                  question: "Who leads the sessions?",
                  answer: (
                    <p>
                      Every session is hosted by a Gedu — a Game Educator who is
                      also a gamer.{" "}
                      <a
                        href={ROUTES.about}
                        className="text-primary underline underline-offset-4 hover:no-underline"
                      >
                        Read more about us
                      </a>
                      .
                    </p>
                  ),
                },
              ]}
            />
          </div>
        </SubSection>
        <SubSection title="A single question">
          <div className="max-w-3xl">
            <FaqAccordion
              items={[
                {
                  key: "only",
                  question: "How do I get started?",
                  answer: (
                    <p>
                      Create a parent account, browse what is on offer, and enrol
                      your child.
                    </p>
                  ),
                },
              ]}
            />
          </div>
        </SubSection>
      </Section>

      <Section title="Alert">
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
              <AlertDescription>Profile updated successfully!</AlertDescription>
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

          {/* The same variants with the title dropped, and then centred as
              the purchase banners use them — one prop apart each, so they
              only mean anything read against the five above. */}
          <Alert variant="success">
            <Check className="mt-0.5 h-4 w-4 shrink-0" />
            <AlertDescription>Profile updated successfully!</AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <AlertDescription>
              Something went wrong. Please try again.
            </AlertDescription>
          </Alert>

          <Alert variant="success" align="center">
            <Check className="h-4 w-4 shrink-0" />
            <AlertDescription>Purchase successful!</AlertDescription>
          </Alert>
          <Alert variant="warning" align="center">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <AlertDescription>
              Purchase canceled. No charges were made.
            </AlertDescription>
          </Alert>
          <Alert variant="destructive" align="center">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <AlertDescription>
              Something went wrong starting checkout. Please try again.
            </AlertDescription>
          </Alert>
        </div>
      </Section>

      <DialogDemo />

      <SwitchProfileDialogDemo />

      <SwitchGateDemo />

      <Section title="Voice Room">
        <SubSection title="Zone list (mock data, moderator view)">
          <p className="text-sm text-muted-foreground mb-3">
            The discrete-zone room UI, fed a hand-built mock provider context
            (no live Daily call). Resize the panel to feel the mobile layout.
            Live video and the audio-driven glow are inert under mock data (no
            real tracks); everything else — cards, custom + locked zones, the
            privacy-screen blur, current-zone emphasis, drag, and the moderator
            controls — renders from the fixture.
          </p>
          <VoiceZonesDemo />
        </SubSection>

        <SubSection title="Avatar (speaking glow)">
          <VoiceAvatarDemo />
        </SubSection>

        <SubSection title="Participant list">
          <ParticipantCardDemo />
        </SubSection>
      </Section>

      <Section title="Location Picker">
        <p className="text-sm text-muted-foreground">
          One panel, and every location control in the app is a configuration of
          it: it browses the hierarchy from the countries down, searches it from
          the first keystroke, and stops at whatever level the caller made
          pickable.
        </p>
        <p className="text-sm text-muted-foreground">
          Note what is <em>not</em> here: no country to choose first (a country
          is simply the top level of the tree) and no loading skeleton. Every
          read behind the real panel is a small indexed lookup, so the list box
          — which already has its final height — just fills in.
        </p>
        <SubSection title="Configurations">
          <div className="grid gap-x-8 gap-y-10 xl:grid-cols-2">
            <div className="space-y-3">
              <DemoCaption>Single mode &mdash; pick one place</DemoCaption>
              {/* The product form's municipality field uses both — it opens on
                  Finland's maakunnat and will not offer a French commune — and
                  both are fed by the same browse and search reads this demo
                  replaces with fixtures. */}
              <p className="text-sm text-muted-foreground">
                Two things a caller can do are deliberately <em>not</em> visible
                here, because they belong to the data container rather than to
                this panel: opening the breadcrumb already inside a country, and
                restricting every row offered to one country. What the panel
                does say about them is the bound-country panel beside it. This
                one is handed no search rows at all, which is why typing into it
                finds nothing and why the search branch has a panel of its own.
              </p>
              <LocationPickerDemo />
            </div>

            <div className="space-y-3">
              <DemoCaption>Multi mode &mdash; gedu coverage</DemoCaption>
              {/* Half-ticking the children would say something the saved rows
                  don't: one claim is one row, and matching walks the ancestor
                  chain to find it. */}
              <p className="text-sm text-muted-foreground">
                Every level is tickable and each tick is an independent &ldquo;I
                cover this whole subtree&rdquo; claim, so ticking
                Hauts-de-France and then drilling into it shows Nord and
                Pas-de-Calais <em>unticked</em> — deliberately.
              </p>
              <LocationCoverageDemo />
            </div>

            <div className="space-y-3">
              <DemoCaption>Searching</DemoCaption>
              {/* The caller reads the type to decide what the confirmation
                  meant — a site is the answer, a municipality is the next
                  question ("show me the sites here", which is also the only
                  screen that can offer to create one). That is why a site is
                  confirmable but never browsable to: making a municipality
                  terminal is exactly what stops the tree walking past the
                  screen that carries creation. And a prefix match beats an
                  infix one however late in the table it sits. */}
              <p className="text-sm text-muted-foreground">
                Configured the way the product form&rsquo;s site dialog
                configures it: <code>municipality</code> and <code>site</code>{" "}
                are both pickable, so the site &ldquo;Gymnase municipal de
                Nîmes&rdquo; is confirmable straight from a search. In the real
                app the ranking, the cap and the match count all come from the
                database.
              </p>
              <LocationSearchDemo />
            </div>

            <div className="space-y-3">
              <DemoCaption>Bound to one country</DemoCaption>
              <p className="text-sm text-muted-foreground">
                The same panel, told which country its container has bound it
                to. The bound country is copy and nothing else — the filtering
                happens above, and the rows here are the same fixtures as
                everywhere else on this page.
              </p>
              <LocationBoundCountryDemo />
            </div>
          </div>
        </SubSection>
        <SubSection title="Home location field (parent profile)">
          <p className="text-sm text-muted-foreground mb-3">
            The parent&rsquo;s own place: one optional municipality. Unlike the
            panels above, this demo opens the real dialog, so browsing and
            search here hit the database.
          </p>
          <HomeLocationFieldDemo />
        </SubSection>
      </Section>

      <Section title="User Row (admin/users)">
        {/* A user with their role badge and, optionally, their nested gamers.
            Used in admin/users. */}
        {/* The ids are real generated UUIDv4s, hardcoded and deliberately
            unrelated to each other: an identicon is hashed out of the id's
            first bytes, so a near-identical series would give five different
            people one face and make the row look like a rendering bug. */}
        <div className="space-y-4">
          <UserRow
            user={{
              id: "1336ddd9-c36d-4a16-b5a9-e2a0cc867868",
              first_name: "Jane",
              last_name: "Doe",
              email: "jane@example.com",
              email_verified_at: "2026-03-04T09:12:00.000Z",
              role: "customer",
            }}
            linkedGamers={[
              {
                id: "8e86d931-500c-49ed-889d-c2cd10879a28",
                first_name: "Venla",
                last_name: "Doe",
                email: null,
                email_verified_at: null,
                role: "gamer",
              },
              {
                id: "5aec0f5a-5398-46d7-a150-3554cf701beb",
                first_name: "Lucas",
                last_name: "Doe",
                email: null,
                email_verified_at: null,
                role: "gamer",
              },
            ]}
          />
          {/* A certified gedu whose address is confirmed too — the row that
              carries both marks, and the reason their order is fixed. */}
          <UserRow
            user={{
              id: "f4c215ef-174c-4ed3-9a25-26d2ba765b6d",
              first_name: "Sam",
              last_name: "Smith",
              email: "sam@example.com",
              email_verified_at: "2026-02-19T17:40:00.000Z",
              role: "gedu",
            }}
            certified
          />
          {/* The same row with a known "no": an educator waiting on an admin,
              shield withheld. */}
          <UserRow
            user={{
              id: "2ddca203-1c71-4144-93c1-f79c25b93407",
              first_name: "Riikka",
              last_name: "Laine",
              email: "riikka@example.com",
              email_verified_at: "2026-05-02T08:05:00.000Z",
              role: "gedu",
            }}
            certified={false}
          />
          {/* And the third state: the certification read failed, so nobody's
              status is known. It has to look like the "no" above rather than
              like the "yes" — a mark is a claim, and there is nobody here to
              make it. */}
          <UserRow
            user={{
              id: "006da659-e900-4d7a-b5ae-112ff93b28a9",
              first_name: "Petri",
              last_name: "Koskinen",
              email: "petri@example.com",
              email_verified_at: null,
              role: "gedu",
            }}
            certified={null}
          />
          {/* A parent who has never confirmed their address: no mark at all,
              which is the ordinary state of a new account. */}
          <UserRow
            user={{
              id: "6a909d0b-f865-4b31-846e-f39052953107",
              first_name: "Otto",
              last_name: "Nieminen",
              email: "otto@example.com",
              email_verified_at: null,
              role: "customer",
            }}
          />
        </div>
      </Section>

      <Section title="Seat Availability Bar">
        <p className="text-sm text-muted-foreground -mt-2">
          The bar tracks seats <em>remaining</em> — an empty club starts full
          and drains as it fills — so it reads as &ldquo;room left,&rdquo; not
          &ldquo;how full.&rdquo; At zero there&rsquo;s no fill to color, so the
          full state is carried by text/badge, where the waiting list is
          surfaced.
        </p>
        <SeatAvailabilityDemo />
      </Section>

      <Section title="Products">
        <p className="text-sm text-muted-foreground -mt-2">
          Parent-facing product surfaces, grouped by product type. Each card is
          one mocked product rendered as the browse card a parent sees in the
          shop (/shop). <strong>The whole card is the click target</strong> —
          clicking anywhere on one that carries a chevron opens that same
          mock&rsquo;s full detail page in the public layout, exactly as a
          parent would see it. The &ldquo;View&rdquo; hint in the footer is a
          label on that target rather than a separate one — it is not a link,
          and the card beneath it takes the click.{" "}
          <strong>Cards with no chevron are inert:</strong> none of the four has
          a detail page, because a parent can&rsquo;t act there. Only the
          openable ones react to hover. The one surface with no card of its own
          is the shared &ldquo;registration closed&rdquo; panel (ended / already
          started / fully booked), which a parent meets only through a stale
          link — it is previewable full-page from the{" "}
          <a href={ROUTES.admin.uiPreviews} className="underline">
            UI Previews
          </a>{" "}
          page.
        </p>
        <p className="text-sm text-muted-foreground">
          <strong>No card carries seat information</strong> except the
          municipality seat-fill bar, which is the deliberate exception (schools
          are the known-scarce case) and reads counts that are not live. The
          free club and the full-with-waitlist club both look like ordinary open
          cards, and the full-no-waitlist camp is inert &mdash; whether the card
          opens is the only difference a parent can see before clicking, and
          fullness is stated properly on the detail page behind it.
        </p>
        <ProductsDemo />
      </Section>

      <Section title="Product Image Catalogue">
        <p className="text-sm text-muted-foreground -mt-2">
          The dialog the product form&rsquo;s picture card opens. Pictures are{" "}
          <strong>shared</strong>: one entry can be on many products, so
          clicking a tile only fills the reference column &mdash; a separate
          button commits the pick &mdash; and the column carries the
          entry&rsquo;s name, everything it reaches, and the two verbs that
          reach all of them.
        </p>
        <p className="text-sm text-muted-foreground">
          The badge under each tile sits in a <strong>reserved slot</strong>, so
          the usage counts arriving after the pictures move nothing. Nothing
          here writes anything &mdash; every action resolves against the
          fixtures.
        </p>
        <ImageCatalogueDemo />
      </Section>

      <Section title="Family — Enrollment Card">
        <p className="text-sm text-muted-foreground -mt-2">
          One card per <em>enrollment</em> &mdash; a family&rsquo;s
          participation in one product.
        </p>
        <p className="text-sm text-muted-foreground">
          <strong>Two states have nothing behind them</strong> &mdash; a queue
          place and an unplaced seat &mdash; and both drop the link, the chevron
          and the hover together. A cancelled membership is a quiet line in the
          body rather than a corner badge.
        </p>
        <EnrollmentCardDemo />
      </Section>

      <SessionPhotosDemo />

      <Section title="Rich text editor — authoring and what it stores">
        <p className="text-sm text-muted-foreground -mt-2">
          The shared authoring control for anywhere a person writes prose the
          app stores. It round-trips <strong>markdown</strong> behind a small
          fixed toolbar, so a writer never has to know what <code>##</code>{" "}
          does. The value below the editor is exactly what gets persisted.
        </p>
        <p className="text-sm text-muted-foreground">
          The toolbar produces a deliberately narrow subset: headings,
          paragraphs, bold, italics and lists. The <strong>marketing</strong>{" "}
          variant adds one button to it, and its headings are a page&rsquo;s
          scale rather than a card&rsquo;s, because that is where its output
          lands.
        </p>
        <RichTextEditorDemo />
      </Section>

      <Section title="Game account — one identity, any platform">
        {/* Parameterised by `platform`; everything a platform does differently
            lives in a descriptor in components/game-account/platforms.tsx. */}
        <p className="text-sm text-muted-foreground -mt-2">
          One component set for a child&rsquo;s game identity. Three ways it is
          ever shown, one height for all of them, and every one carries the
          skin.
        </p>
        <GameAccountDemo />
      </Section>

      <Section title="Minecraft Education password reset">
        {/* One card, rendered unchanged on the gedu dashboard's Tools section
            and on /admin/tools. Every row shape is on it because they only
            compare themselves side by side. */}
        <p className="text-sm text-muted-foreground -mt-2">
          The textarea, the duplicate-collapsing, the bare-username warning and
          the batch cap are all live &mdash; type into it &mdash; because they
          are pure UI over local state; only the submit is inert here, and the
          result rows below it come from fixtures rather than from Graph.
        </p>
        <p className="text-sm text-muted-foreground">
          The three rows are a <code>@gamer.sog.gg</code> account, which keeps
          the password it is given; a <code>@gedu.sog.gg</code> one, which must
          change it on first sign-in and says so under the address; and a
          username no domain matched, whose message lands where the password
          chip would be. The chips and the Copy-all button write to the real
          clipboard.
        </p>
        <MinecraftPasswordResetDemo />
      </Section>

      <Section title="Help & feedback form">
        {/* One card, rendered unchanged in the parent, gamer and gedu Help
            sections. Every state is here because the three preview scenes can
            only ever show the idle one — a scene must never gain a live submit
            that emails every admin. */}
        <p className="text-sm text-muted-foreground -mt-2">
          The first card of each pair is live &mdash; type into it &mdash;
          because the textarea, the two counters and the
          disabled-until-long-enough button are pure UI over local state. The
          rest are the states a real submit produces, driven by props.
        </p>
        <p className="text-sm text-muted-foreground">
          The refused state is the database&rsquo;s rolling-hour rate limit,
          which the route answers with a 429. It is worded here rather than
          shown as the route&rsquo;s own English sentence, which is written for
          a developer reading a log.
        </p>
        <HelpFeedbackDemo />
      </Section>

      <Section title="Gedu contract — settings card">
        <p className="text-sm text-muted-foreground -mt-2">
          The contract card on a gedu&rsquo;s settings page, in both the states
          it has. The settings route reads the acceptances before the page
          renders and fails if it cannot, so the card is born signed or unsigned
          and there is no third thing for it to be.
        </p>
        <p className="text-sm text-muted-foreground">
          The database keeps one acceptance row per signed version &mdash; the
          legal record of what was agreed and when, which a new version does not
          make untrue. The card names exactly one of them: the earliest
          acceptance of the version <em>in force</em>. So a second season on file
          renders identically to one, and a gedu who signed only last season
          reads as <em>Not accepted</em>.
        </p>
        <p className="text-sm text-muted-foreground">
          The settings page is one column wide, so each state wraps later there
          than in these columns.
        </p>
        <GeduContractSettingsCardDemo />
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Gedu contract — settings card                                      */
/* ------------------------------------------------------------------ */

/**
 * When the fixture educator signed each version. Fixed literals, unlike the
 * contract scene's clock-relative one: the card renders the date absolutely, so
 * nothing here goes stale — and a moment that moved would move the line it is
 * printed on, which is the one thing this section exists to hold still.
 */
const CONTRACT_CARD_SIGNED_AT = "2026-03-14T09:12:00.000Z";

const CONTRACT_CARD_CURRENT_ROW = buildGeduContractAcceptance({
  acceptedAt: CONTRACT_CARD_SIGNED_AT,
});

/** What the settings page's read comes back holding — the card's two states. */
const CONTRACT_CARD_CASES: readonly {
  label: string;
  acceptances: GeduContractAcceptance[];
}[] = [
  { label: "No signature", acceptances: [] },
  // A second row for an older version would render this column pixel for pixel:
  // the card names the earliest acceptance of the version in force and nothing
  // else. Two identical renders are one state, so there is one column.
  { label: "Signed", acceptances: [CONTRACT_CARD_CURRENT_ROW] },
];

/**
 * Both answers side by side, so their bottom edges can be read against each
 * other — the card is the only one on the settings page whose height its data
 * decides, and whether the two can be made one height is the open question
 * about it.
 *
 * The rows go through the real matcher rather than being hand-picked, so what
 * each column shows is what the data shell would have handed the card, not a
 * claim about it. `items-start` is load-bearing: a stretching grid would give
 * both columns the taller card's height and erase the comparison.
 */
function GeduContractSettingsCardDemo() {
  return (
    <div className="grid items-start gap-x-6 gap-y-8 md:grid-cols-2">
      {CONTRACT_CARD_CASES.map(({ label, acceptances }) => (
        <div key={label} className="space-y-3">
          <DemoCaption>{label}</DemoCaption>
          <GeduContractSettingsCardView
            acceptance={findGeduContractAcceptance(
              acceptances,
              GEDU_CONTRACT_CURRENT_VERSION,
            )}
          />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Minecraft Education password reset                                 */
/* ------------------------------------------------------------------ */

/**
 * The three row shapes a submit can answer with, on one card: the two success
 * variants (which differ only by domain, and therefore by whether the password
 * survives the first sign-in) and a failure, which is the only row that carries
 * a sentence instead of a password.
 */
const PASSWORD_RESET_DEMO_RESULTS: readonly MinecraftPasswordResetResult[] = [
  {
    username: "builder07",
    ok: true,
    upn: "builder07@gamer.sog.gg",
    password: "Sogverse42",
    forceChange: false,
  },
  {
    username: "sanna.gedu",
    ok: true,
    upn: "sanna.gedu@gedu.sog.gg",
    password: "Sogverse08",
    forceChange: true,
  },
  {
    username: "creeper99",
    ok: false,
    error: {
      code: "not_found",
      username: "creeper99",
      domains: ["gamer.sog.gg", "gedu.sog.gg"],
    },
  },
];

function MinecraftPasswordResetDemo() {
  return (
    <MinecraftPasswordResetCardView
      results={PASSWORD_RESET_DEMO_RESULTS}
      submitting={false}
      error={null}
      onSubmit={noopSubmit}
    />
  );
}

function noopSubmit() {}

/* ------------------------------------------------------------------ */
/*  Help & feedback form                                               */
/* ------------------------------------------------------------------ */

/**
 * The two audiences and every state a submit can leave the card in, side by
 * side — which is the whole reason this section exists: the dashboards render
 * the idle card and nothing else, and states compared from memory are not
 * compared at all.
 *
 * The idle card of each audience holds its own message so typing works; the
 * others are driven by props alone, because no click can reach them here.
 */
function HelpFeedbackDemo() {
  return (
    <div className="space-y-6">
      <SubSection title="Adult — parent and gedu">
        <div className="grid gap-4 lg:grid-cols-2">
          <LiveHelpFeedbackDemoCard audience="adult" />
          <HelpFeedbackCardView
            audience="adult"
            message="My daughter cannot hear anyone in the club room."
            onMessageChange={noopMessage}
            submitting
            succeeded={false}
            error={null}
            onSubmit={noopSubmit}
          />
          <HelpFeedbackCardView
            audience="adult"
            message=""
            onMessageChange={noopMessage}
            submitting={false}
            succeeded
            error={null}
            onSubmit={noopSubmit}
          />
          <HelpFeedbackCardView
            audience="adult"
            message="My daughter cannot hear anyone in the club room."
            onMessageChange={noopMessage}
            submitting={false}
            succeeded={false}
            error="rateLimited"
            onSubmit={noopSubmit}
          />
        </div>
      </SubSection>

      <SubSection title="Gamer">
        <div className="grid gap-4 lg:grid-cols-2">
          <LiveHelpFeedbackDemoCard audience="gamer" />
          <HelpFeedbackCardView
            audience="gamer"
            message="My mic does not work."
            onMessageChange={noopMessage}
            submitting={false}
            succeeded={false}
            error="failed"
            onSubmit={noopSubmit}
          />
        </div>
      </SubSection>
    </div>
  );
}

/** The card a reader can actually type into, over local state. */
function LiveHelpFeedbackDemoCard({
  audience,
}: {
  audience: HelpFeedbackAudience;
}) {
  const [message, setMessage] = useState("");

  return (
    <HelpFeedbackCardView
      audience={audience}
      message={message}
      onMessageChange={setMessage}
      submitting={false}
      succeeded={false}
      error={null}
      onSubmit={noopSubmit}
    />
  );
}

function noopMessage() {}

/* ------------------------------------------------------------------ */
/*  Location Picker Demo                                               */
/* ------------------------------------------------------------------ */

/**
 * One panel, and every location control in the app is a configuration of it.
 *
 * It once had a second, "set" scope — a bounded, pre-fetched collection grouped
 * under the place above each row — but every surface that used one (the flat
 * every-site list, the Finnish municipality list) now reaches the same rows
 * through this tree, so the panel has one shape and the demos below show its
 * states.
 *
 * Its consumers: gedu coverage, a parent's own location, and the product form's
 * site and municipality fields — the last two as dialogs, configured by
 * `pickableTypes` (a site pick stops at `site`, a municipality pick at
 * `municipality`, seeded at Finland).
 *
 * In the real app a container above the panel owns the browse position, the
 * debounced query and the two server reads behind them — one level of children
 * by parent, or a ranked top-N from the search index. Here every scope is fed a
 * fixture and fake handlers, no network at all: the panel takes rows and a
 * `scope` config as props and owns nothing else, which is the
 * separation-of-concerns check.
 */

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
  "59": [
    fixtureRow("59350", "Lille", "municipality"),
    fixtureRow("59512", "Roubaix", "municipality"),
  ],
  "62": [fixtureRow("62041", "Arras", "municipality")],
  "30": [fixtureRow("30189", "Nîmes", "municipality")],
  "34": [fixtureRow("34032", "Béziers", "municipality")],
};

const NIMES = fixtureRow("30189", "Nîmes", "municipality");

/**
 * Fixture search hits for the needle "nimes", each with the path a real hit
 * carries. The third is a site rather than a commune, and it is the whole
 * point of the search demo's configuration: the product form's site dialog
 * makes `site` pickable alongside `municipality`, so an admin who knows the
 * building's name confirms it here in one step instead of walking down to its
 * commune first. Both types rank against the same needle.
 */
const HITS: LocationPick[] = [
  { location: NIMES, ancestors: [GARD, OCC, FR] },
  {
    location: fixtureRow("34032", "Béziers", "municipality"),
    ancestors: [fixtureRow("34", "Hérault", "district"), OCC, FR],
  },
  {
    location: fixtureRow("s-30189-1", "Gymnase municipal de Nîmes", "site"),
    ancestors: [NIMES, GARD, OCC, FR],
  },
];

/**
 * Drives the panel's browse half from the fixture tree above: the path is
 * component state, and the rows are whatever level that path points at.
 */
function useFixtureBrowse(initialPath: LocationChainSummary[] = []) {
  const [path, setPath] = useState<LocationChainSummary[]>(initialPath);
  const parentId = path.at(-1)?.id ?? "root";
  const ancestors = [...path].reverse();
  const rows = (LEVELS[parentId] ?? []).map((location) => ({
    location,
    ancestors,
  }));

  return {
    path,
    // The same rule the real browser uses: a row's path is its ancestors
    // reversed to root-first plus the row itself, which holds whether the row
    // was browsed to or searched for. Appending instead would look right here —
    // the fixture only browses — while being wrong in the app.
    onDrill: (pick: LocationPick) =>
      setPath([...[...pick.ancestors].reverse(), pick.location]),
    onOpenDepth: (depth: number) =>
      setPath((current) => current.slice(0, depth)),
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
          Confirmed <span className="font-medium">{confirmed}</span> — the site
          flow would now list the sites already in it, with that row as the
          parent of any new one.
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => setConfirmed(null)}
        >
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
        Ticked: {ticked.size === 0 ? "(none)" : [...ticked].join(", ")} &mdash;
        &ldquo;Done&rdquo; clears the demo&rsquo;s state; in the real app it
        closes the dialog and the caller&rsquo;s save commits the ticks.
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
            // The site dialog's own configuration: two confirmable types, and
            // the caller decides what each one meant — a site is the answer, a
            // municipality is "show me the sites here".
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

/**
 * The parent's own place: one optional municipality, on the registration form
 * and in settings. It asks single mode for the municipality level — Finland's
 * kunta, France's commune, the one directly above a site.
 *
 * The box *is* the picker rather than a display row over a "choose" button —
 * one control, and no button caption that has to guess what the viewer's
 * country calls this level. A confirmed pick is a row, so what comes back is a
 * foreign key and a path, with nothing left to resolve: the caller has a
 * foreign key to store and a path to render without a second read, and it
 * decides what committing means — a registration submit, or a settings save.
 */
function HomeLocationFieldDemo() {
  const [place, setPlace] = useState<LocationPick | null>(null);

  return (
    <div className="max-w-md space-y-4 rounded-md border border-input bg-card p-4">
      <div className="space-y-2">
        <HomeLocationField value={place} onChange={setPlace} />
        <p className="text-xs text-muted-foreground">
          Value:{" "}
          {place ? `${place.location.id} (${place.location.name})` : "(none)"}{" "}
          &mdash; a row id.
        </p>
      </div>

      {/* The third state, which is the reason the prop is not just
          `LocationPick | null`. It cannot be reached by clicking, because the
          read it represents lands in a frame or two — so it is pinned here as a
          fixture rather than demonstrated by waiting for one. The "add your
          location" prompt is withheld because it would tell someone who has
          chosen a place that they have not, and be clickable while it did
          so. */}
      <div className="space-y-2">
        <HomeLocationField value={undefined} onChange={() => {}} />
        <p className="text-xs text-muted-foreground">
          Value: <code>undefined</code> &mdash; a stored id whose row has not
          arrived yet, as settings mounts. The box is silent at its final height
          rather than showing the &ldquo;add your location&rdquo; prompt.
          Reading one row by id is an indexed lookup, so there is no skeleton
          and no spinner here by design.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Rich text editor                                                   */
/* ------------------------------------------------------------------ */

/** Seeds the editor with every construct its toolbar produces. */
const DEMO_MARKDOWN = `# Mob-proofing night

We lit the paths, walled the gaps and got through a whole session without losing anybody to a creeper.`;

/**
 * The marketing variant's seed, which has to carry a link: the link control is
 * the only part of this editor that opens a second row, and it is unreachable
 * from the feed variant.
 */
const DEMO_MARKETING_MARKDOWN = `## Before the first session

There is nothing to install beyond the game itself — the **Java edition** is the one you want.

Our [privacy policy](/privacy) covers what we keep and for how long.`;

/**
 * The writer, in both variants, with its own serialised output beside each.
 *
 * Showing the stored markdown next to the editor is the one thing worth being
 * able to see at a glance: a writer never meets the syntax, so this is the only
 * place to confirm the round trip is honest. Type a heading, watch the `#`
 * appear in the serialised output.
 *
 * Both variants are here because the variant is the difference between two
 * toolbars over one component, and the point of a style-guide section is
 * exactly that — every state of a reused piece, side by side. It is also the
 * only place the link control can be exercised at all until the admin form
 * starts storing markdown.
 *
 * How stored markdown *renders* is deliberately not demoed here — a renderer is
 * only meaningful inside the surface that owns it, at that surface's width and
 * clamping. Those live in the full-page preview scenes on `/admin/ui-previews`.
 *
 * **Markdown is the stored format because it is the one that converts cleanly
 * into email.** Whatever consumes it is expected to enforce the toolbar's
 * subset as a *whitelist* on the way out, unwrapping anything outside it to its
 * text rather than dropping it, so a pasted table or a stray tag shows its
 * words instead of silently deleting a paragraph of somebody's writing.
 *
 * The marketing variant's link control is worth knowing before you press it: a
 * bare "sog.gg/privacy" is read as an external address and gets `https://`
 * rather than becoming a path under this page, and an address the reader's
 * renderer would strip anyway (`tel:`, `ftp://`) keeps the address row open and
 * says so instead of closing on nothing.
 */
function RichTextEditorDemo() {
  const [markdown, setMarkdown] = useState(DEMO_MARKDOWN);
  const [marketingMarkdown, setMarketingMarkdown] = useState(
    DEMO_MARKETING_MARKDOWN,
  );

  return (
    // One 2×2 grid rather than two blocks: the whole difference between the
    // variants is one toolbar button, and a seven-button row directly above an
    // eight-button one is the only way to see that.
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-2">
        <DemoCaption>Feed variant</DemoCaption>
        <RichTextEditor
          initialValue={DEMO_MARKDOWN}
          onChange={setMarkdown}
          ariaLabel="Session report"
          placeholder="What the group built, played or figured out."
        />
      </div>
      <div className="space-y-2">
        <DemoCaption>Serialised markdown</DemoCaption>
        <pre className="min-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-input bg-muted/40 p-3 text-xs text-muted-foreground">
          {markdown}
        </pre>
      </div>

      <div className="space-y-2">
        <DemoCaption>Marketing variant</DemoCaption>
        <RichTextEditor
          variant="marketing"
          initialValue={DEMO_MARKETING_MARKDOWN}
          onChange={setMarketingMarkdown}
          ariaLabel="Product long description"
          placeholder="The expanded pitch under the hero."
        />
      </div>
      <div className="space-y-2">
        <DemoCaption>Serialised markdown</DemoCaption>
        <pre className="min-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-input bg-muted/40 p-3 text-xs text-muted-foreground">
          {marketingMarkdown}
        </pre>
      </div>
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
 * The one grid every demo below is laid out on: a label column, then a column
 * per platform.
 *
 * Shared so the identity rows line up vertically down the whole section. The
 * demos exist to be *compared* — they are presentations of one row — and
 * different container widths made that impossible.
 */
const GAME_DEMO_GRID =
  "grid max-w-4xl grid-cols-[9rem_minmax(0,1fr)_minmax(0,1fr)] gap-x-8 rounded-lg border p-4";

/**
 * The header row every demo grid opens with. The corner cell names the grid
 * where a subsection holds more than one — it is otherwise empty.
 */
function GameDemoHeader({ label }: { label?: string }) {
  return (
    <>
      <div>{label ? <DemoCaption>{label}</DemoCaption> : null}</div>
      {DEMO_PLATFORMS.map((platform) => (
        <DemoCaption key={platform}>
          {GAME_PLATFORMS[platform].name}
        </DemoCaption>
      ))}
    </>
  );
}

/** One person's accounts, as a surface would hold them. */
type DemoAccount = {
  username: string | null;
  externalId: string | number | null;
};

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
      <GameDemoHeader label="Register" />
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
 * one saved name nobody ever checked, one child who has never given a name.
 * `checking` belongs to a lookup in flight rather than to a stored account,
 * which is why it is pinned once at the foot of the head grid and otherwise met
 * by committing in the editable demo.
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
 * takes a URL. One call feeds both figures, so the body and the head come out of
 * a single request. While it is in flight `data` is undefined and the rows draw
 * the stand-in in a box that is already its final size, so nothing moves when
 * the render lands.
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

/**
 * The read-only row, in both figures, under one toggle.
 *
 * The two figures were two demos, each holding its own `live` flag and its own
 * copy of the toggle while asking React Query for the very same handle. One
 * flag, one button, one request, and the 32px head now sits directly under the
 * 60px body it is a reduction of — which is the only way to judge a size step.
 */
function GameViewOnlyDemo() {
  const [live, setLive] = useState(false);
  const renders = useRobloxDemoRenders(live);

  return (
    <div className="space-y-3">
      <RobloxLiveToggle live={live} onLoad={() => setLive(true)} />

      <div className={cn(GAME_DEMO_GRID, "items-center gap-y-2")}>
        <GameDemoHeader label="Full figure" />
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

      <div className={cn(GAME_DEMO_GRID, "items-center gap-y-2")}>
        <GameDemoHeader label="Head" />
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

  const commit = (key: string, platform: GamePlatform, account: DemoAccount) =>
    setRows((prev) =>
      prev.map((row) =>
        row.key === key
          ? { ...row, accounts: { ...row.accounts, [platform]: account } }
          : row,
      ),
    );

  return (
    <div className={cn(GAME_DEMO_GRID, "items-start gap-y-1")}>
      <GameDemoHeader label="Roster" />
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

/**
 * The card's three pages, side by side and all three live.
 *
 * The form has one shape a parent meets by default and two it only reaches by
 * choosing a sign-in mode and pressing Next, and the whole question about them
 * is comparative: does the second page look like it belongs to the first, and do
 * the two credential pages look like each other. States reached by driving one
 * card through the flow would have to be compared from memory, so all three are
 * rendered at once and each is seeded straight into its page through the card's
 * `initial` prop.
 *
 * **No `Dialog` around them.** A dialog is a portal, so three of them would
 * stack in `document.body` on top of one another rather than sitting in a row —
 * and `DialogContent` needs no portal to render, which is the whole reason the
 * card is separable from it. The height cap goes with the dialog: `90vh` is
 * about a viewport, and these are three columns on a page.
 */
function AddGamerDialogDemo() {
  const dismiss = () => {};

  return (
    <div className="grid items-start gap-4 lg:grid-cols-3">
      <AddGamerFormCard
        onOpenChange={dismiss}
        onCreate={inertCreateGamer}
        className="max-h-none"
      />
      <AddGamerFormCard
        onOpenChange={dismiss}
        onCreate={inertCreateGamer}
        className="max-h-none"
        initial={{ firstName: "Lily", signIn: "username", step: "credentials" }}
      />
      <AddGamerFormCard
        onOpenChange={dismiss}
        onCreate={inertCreateGamer}
        className="max-h-none"
        initial={{ firstName: "Lily", signIn: "email", step: "credentials" }}
      />
    </div>
  );
}

function GameAccountDemo() {
  return (
    <div className="space-y-8">
      <SubSection title="Entering and editing a username">
        {/* The prop is `autoEdit`, and the label above each register row
            belongs to the surface, not to the component; a roster wants
            none. */}
        <p className="text-sm text-muted-foreground">
          One component, one prop apart. A register form has nothing to view
          yet, so those rows open straight into edit mode with the input where
          the name will be; a roster leaves it closed and opens on a click.
          Either way, committing <em>is</em> the verification &mdash; press
          Enter or the tick and watch the status square: the name appears
          immediately, the spinner sits in the square the tick will land in, and
          a failed lookup leaves the name saved as unverified with the reason
          underneath.
        </p>
        <GameFirstCaptureDemo />
        <GameEditableRowDemo />
      </SubSection>

      <SubSection title="View only">
        {/* The row itself stays fixture-pure — it takes a picture, it never
            goes and finds one. Two surfaces use the head figure — the voice
            participant row and the participant chip below; everywhere else, the
            admin user detail page included, keeps the whole figure. */}
        <p className="text-sm text-muted-foreground">
          Real pictures on both sides. Minecraft derives its skin from the
          username, so the row needs nothing; Roblox has no username-addressable
          endpoint, so somebody has to resolve one server-side and hand the URL
          in. The stand-in is what the last row shows, because it has no
          username to resolve. <em>This demo</em> resolves by handle, behind the
          button, because fixtures are all it has.
        </p>
        <p className="text-sm text-muted-foreground">
          <code>figure=&quot;head&quot;</code> is the same row at 32px instead
          of 60px, for a dense list where the whole character crowds out what
          the list is about. The two platforms are <em>identical</em> at that
          size, because a Minecraft face render and a Roblox headshot are both
          square, so the 1:2-vs-1:1 divergence that makes the full
          figure&rsquo;s box differ simply does not exist.
        </p>
        <GameViewOnlyDemo />
      </SubSection>

      <SubSection title="In the add-gamer dialog">
        {/* The game rows sit closed rather than opened, unlike the register
            rows above — the same row costs the same height either way, so the
            choice is about how much the dialog appears to be asking for. The
            gender buttons are three across at every width, which is what pays
            for the two rows fitting on a phone. */}
        <p className="text-sm text-muted-foreground">
          The real card, inert: the submit resolves after a beat and writes
          nothing. The PIN gate in front of it is skipped &mdash; it is a
          conditional on one query with nothing of its own to look at. Both game
          rows are the real thing and both commits run the real lookup, the
          radios switch the footer between Add gamer and Next, and every field
          validates.
        </p>
        <AddGamerDialogDemo />
      </SubSection>

      <SubSection title="In the admin participant chip">
        {/* It appears in four places: the group columns, the waitlist card, the
            unassigned card and the drag overlay. A child stacks name,
            age/gender, parent and the identity row inside a narrow rail, so it
            takes the compact figure: the whole body was taller than the other
            three lines put together. */}
        <p className="text-sm text-muted-foreground">
          The chip is the draggable roster token in the product groups panel. An
          adult holding their own seat has none of a child&rsquo;s three facts,
          so the chip drops them rather than drawing blanks, and carries the one
          thing a child&rsquo;s chip has no room for &mdash; the address &mdash;
          where the parent&rsquo;s name would be. Drag is live &mdash; the chips
          below are real, and there is nowhere to drop them.
        </p>
        <p className="text-sm text-muted-foreground">
          <strong className="font-medium text-foreground">
            Which identity a chip draws is the product&rsquo;s topic, not the
            chip&rsquo;s choice.
          </strong>{" "}
          A Minecraft product draws the Minecraft handle, a Roblox one the
          Roblox handle beside its render, and a topic about no single game
          account &mdash; Programming, Esports &mdash; draws no identity row at
          all: the chip is simply shorter. Every figure here is the drawn
          placeholder, because a fixture surface must not reach a third-party
          image host on load.
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
 * the per-platform account tables, and an adult seat has none of those rows.
 *
 * On a live Roblox chip the render beside the handle is one the panel resolved
 * by account id in a single batched call for the whole roster; a chip whose
 * topic is about no one game account draws no identity row at all, which is the
 * same call the adult variant makes.
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

/**
 * The identity a chip draws, one entry per variant. The panel resolves these
 * from the product's topic and the snapshot's columns; a fixture states them
 * outright.
 *
 * Every one passes `gameAvatarUrl: null` — the drawn placeholder — because a
 * style-guide page must not reach a third-party image host on load. On a live
 * Minecraft chip the prop is *omitted* instead, which is what lets the row
 * derive the face from the name; a Roblox chip is always handed its render,
 * because that platform has no by-name image host.
 */
const CHIP_IDENTITY = {
  minecraftVerified: {
    gamePlatform: "minecraft",
    gameUsername: "Notch",
    gameExternalId: "8f3a1c92-77de-4b01-9c2e-a1b2c3d4e5f6",
    gameAvatarUrl: null,
  },
  minecraftUnverified: {
    gamePlatform: "minecraft",
    gameUsername: "jeb_",
    gameExternalId: null,
    gameAvatarUrl: null,
  },
  minecraftUnknown: {
    gamePlatform: "minecraft",
    gameUsername: null,
    gameExternalId: null,
    gameAvatarUrl: null,
  },
  robloxVerified: {
    gamePlatform: "roblox",
    gameUsername: "AinoBuilds",
    gameExternalId: 261,
    gameAvatarUrl: null,
  },
  robloxUnverified: {
    gamePlatform: "roblox",
    gameUsername: "joonas_makes",
    gameExternalId: null,
    gameAvatarUrl: null,
  },
  // A topic about no single game account — the chip draws no identity row.
  none: {
    gamePlatform: null,
    gameUsername: null,
    gameExternalId: null,
    gameAvatarUrl: null,
  },
} as const satisfies Record<string, ChipGameIdentity>;

function ParticipantChipRow() {
  return (
    <div className="flex flex-wrap items-start gap-6">
      {/* The real rail width in the groups panel, so the chip is judged at the
          size it actually renders at rather than stretched across the page. */}
      <div className="w-64 space-y-2 rounded-lg border p-3">
        <DemoCaption>On a Minecraft product</DemoCaption>
        <ParticipantChip
          participationId="demo-1"
          participantId={CHIP_PEOPLE.aino}
          firstName="Aino"
          dateOfBirth="2014-03-11"
          gender="girl"
          parentFirstName="Sanna"
          parentLastName="Virtanen"
          {...CHIP_IDENTITY.minecraftVerified}
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
          {...CHIP_IDENTITY.minecraftUnverified}
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
          {...CHIP_IDENTITY.minecraftUnknown}
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
          {...CHIP_IDENTITY.none}
          participantEmail="marja.korhonen@example.com"
        />
      </div>

      {/* The same two children on a Roblox product. The row is the same shape at
          the same height — a Minecraft face render and a Roblox headshot are
          both square — so only the handle and the platform behind it differ. */}
      <div className="w-64 space-y-2 rounded-lg border p-3">
        <DemoCaption>On a Roblox product</DemoCaption>
        <ParticipantChip
          participationId="demo-6"
          participantId={CHIP_PEOPLE.aino}
          firstName="Aino"
          dateOfBirth="2014-03-11"
          gender="girl"
          parentFirstName="Sanna"
          parentLastName="Virtanen"
          {...CHIP_IDENTITY.robloxVerified}
          participantEmail={null}
        />
        <ParticipantChip
          participationId="demo-7"
          participantId={CHIP_PEOPLE.joonas}
          firstName="Joonas"
          dateOfBirth="2012-09-02"
          gender="boy"
          parentFirstName="Petra"
          parentLastName="Nieminen"
          {...CHIP_IDENTITY.robloxUnverified}
          participantEmail={null}
        />
      </div>

      {/* Programming, Esports, Game Studio — a topic about no one game account.
          Worth seeing beside the two columns above: the chip is shorter by
          exactly the row it does not draw, and holds no gap where one was. */}
      <div className="w-64 space-y-2 rounded-lg border p-3">
        <DemoCaption>On a topic with no game account</DemoCaption>
        <ParticipantChip
          participationId="demo-8"
          participantId={CHIP_PEOPLE.aino}
          firstName="Aino"
          dateOfBirth="2014-03-11"
          gender="girl"
          parentFirstName="Sanna"
          parentLastName="Virtanen"
          {...CHIP_IDENTITY.none}
          participantEmail={null}
        />
        <ParticipantChip
          participationId="demo-9"
          participantId={CHIP_PEOPLE.petra}
          firstName="Petra"
          dateOfBirth={null}
          gender={null}
          parentFirstName={null}
          parentLastName={null}
          {...CHIP_IDENTITY.none}
          participantEmail={null}
        />
      </div>

      <div className="w-64 space-y-2 rounded-lg border p-3">
        <DemoCaption>Mid-save</DemoCaption>
        <ParticipantChip
          participationId="demo-4"
          participantId={CHIP_PEOPLE.aino}
          firstName="Aino"
          dateOfBirth="2014-03-11"
          gender="girl"
          parentFirstName="Sanna"
          parentLastName="Virtanen"
          {...CHIP_IDENTITY.minecraftVerified}
          participantEmail={null}
          isPending
        />
      </div>
    </div>
  );
}
