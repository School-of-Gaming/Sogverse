"use client";

import { memo, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useDraggable } from "@dnd-kit/core";
import { ExternalLink, GripVertical, Mail, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Identicon } from "@/components/ui/identicon";
import { GameUsernameRow } from "@/components/game-account";
import { ROLE_BADGE_STYLES, ROLE_LABEL_KEYS } from "@/lib/constants";
import { computeAge, cn } from "@/lib/utils";
import { useTimezone } from "@/providers";
import type { GenderType } from "@/types";
import type { ChipGameIdentity } from "./panel-rules";

// `satisfies` keeps the record exhaustive over GenderType while the values
// keep their literal types, so t(GENDER_KEY[gender]) typechecks unasserted.
const GENDER_KEY = {
  boy: "genderBoy",
  girl: "genderGirl",
  non_binary: "genderNonBinary",
} as const satisfies Record<GenderType, string>;

/**
 * The chip is dumb about game identities: which platform a product is about,
 * which columns feed the row and where a Roblox render came from are all the
 * panel's business (see `chipGameIdentity` in ./panel-rules). What arrives here
 * is one platform's worth of identity, or `gamePlatform: null` for a product
 * about no game account at all — and then the chip simply has no identity row.
 */
interface ContentProps extends ChipGameIdentity {
  participantId: string;
  firstName: string;
  dateOfBirth: string | null;
  gender: GenderType | null;
  parentFirstName: string | null;
  parentLastName: string | null;
  /**
   * The seat-holder's own address, on an adult seat only — and the chip's whole
   * discriminator. The RPC emits it where participant = customer and nowhere
   * else, so non-null means "this is a parent's own seat".
   */
  participantEmail: string | null;
}

// Memoized purely-visual content: dnd-kit re-renders the wrapper on every
// pointer move, but the inner identicon/text don't need to reconcile.
const ChipContent = memo(function ChipContent({
  participantId,
  firstName,
  dateOfBirth,
  gender,
  parentFirstName,
  parentLastName,
  gamePlatform,
  gameUsername,
  gameExternalId,
  gameAvatarUrl,
  participantEmail,
}: ContentProps) {
  const t = useTranslations("admin.products.groupsPanel");
  const c = useTranslations("common");
  const timeZone = useTimezone();

  const isAdult = participantEmail !== null;

  const detailParts: string[] = [];
  if (dateOfBirth) {
    detailParts.push(t("chip.age", { age: computeAge(dateOfBirth, timeZone) }));
  }
  if (gender) {
    detailParts.push(t(GENDER_KEY[gender]));
  }
  const detail = detailParts.join(" / ");

  const parentName = [parentFirstName, parentLastName].filter(Boolean).join(" ");

  return (
    <>
      <Avatar className="h-7 w-7">
        <Identicon id={participantId} size={28} />
      </Avatar>
      <div className="min-w-0 flex-1">
        {/* A div, not a p: Badge renders a div, and a block element inside a
            p is invalid HTML — the browser closes the p early and hydration
            fails on the mismatch. */}
        <div className="flex min-w-0 items-center gap-1.5 leading-tight">
          <span className="truncate">{firstName}</span>
          {isAdult && (
            /* Read off the shared role constants, the same badge the picker
               and the admin user list draw for a customer profile. An admin
               dragging chips between three columns needs "this one is a
               grown-up" to be the same shape everywhere they meet it. */
            <Badge
              className={cn(
                ROLE_BADGE_STYLES.customer,
                "shrink-0 px-1 py-0 text-[9px] font-normal leading-tight",
              )}
            >
              {c(ROLE_LABEL_KEYS.customer)}
            </Badge>
          )}
        </div>
        {/* An adult seat carries none of the three child-shaped facts — no
            gamer profile, no linked game account — so the chip simply does not
            draw those lines. Three empty rows would read as a chip that failed
            to load, and reserving their height would leave a hole beside
            content that can never sit next to it. What takes their place is the
            one thing the child variant has no room for and no need of: the
            address, because there is no parent to name. */}
        {isAdult ? (
          <p
            className="flex items-center gap-1 text-[10px] leading-tight text-muted-foreground"
            aria-label={t("chip.participantEmail", { email: participantEmail })}
          >
            <Mail className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{participantEmail}</span>
          </p>
        ) : (
          <>
            {detail && (
              <p className="text-[10px] leading-tight text-muted-foreground">
                {detail}
              </p>
            )}
            {parentName && (
              <p
                className="flex items-center gap-1 text-[10px] leading-tight text-muted-foreground"
                aria-label={t("chip.parent", { name: parentName })}
              >
                <User className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">{parentName}</span>
              </p>
            )}
            {/* No platform, no row — the same call the adult variant above
                makes. A product about Programming or Esports is about no single
                account a child holds, so there is nothing to draw and nothing
                that could later appear in that slot; a reserved empty line
                beside content that can never sit next to it would read as a
                chip that failed to load. The chip is simply shorter. */}
            {gamePlatform !== null && (
              <GameUsernameRow
                platform={gamePlatform}
                username={gameUsername}
                externalId={gameExternalId}
                // Three meanings, and the panel picked one: omitted lets a
                // Minecraft row derive the face from the name, a string is the
                // Roblox render the panel's one batched lookup resolved, and
                // null is the placeholder — what an unverified handle, an
                // in-flight batch and a fixture all pass.
                avatarUrl={gameAvatarUrl}
                // The compact figure. The chip is a stack of four short lines in a
                // 16rem rail, and the whole body was taller than the other three put
                // together — the face carries the same identity at roughly the height
                // of the text beside it. Square on both platforms, so the chip's
                // geometry is identical whichever one the product is about.
                figure="head"
                // A picture butting straight against the parent's name reads as
                // cramped. The gap is the call site's, not the row's: only this chip
                // and the admin user page want it, so the component stays unpadded and
                // every other surface keeps its tight rhythm.
                className="mt-2"
              />
            )}
          </>
        )}
      </div>
      <GripVertical className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
    </>
  );
});

/**
 * What a chip opens when it is clicked, and the *only* reason a chip is
 * clickable at all.
 *
 * A chip is a name and a face in a rail of forty — deliberately too small to
 * carry a seat's whole story — so the story lives one click away instead of
 * being crammed in or, as it was until now, being nowhere. An admin answering a
 * parent who has written in needs the child's age, who stands behind the seat,
 * how to reach them and which game handle to check, and every one of those was a
 * trip to a different page.
 *
 * Omitted on a panel whose chips are not inspectable — the drag overlay above
 * all, where a popover would open under the pointer mid-drag.
 */
export interface ParticipantChipDetails {
  /**
   * The address to answer on: the adult's own on an adult seat, the linked
   * parent's on a child's. `null` where none is recorded.
   *
   * It is resolved by the caller rather than read off the participation, because
   * the groups snapshot carries a parent's *name* and not their address — see
   * the panel's own note. A shell that cannot resolve one passes `null` and the
   * line is simply absent.
   */
  contactEmail: string | null;
  /** The admin user page for this participant. */
  adminUserHref: string;
}

interface ParticipantChipProps extends ContentProps {
  participationId: string;
  /** A move for this seat is saving — greyed out and undraggable until it settles. */
  isPending?: boolean;
  /** Present makes the chip clickable; absent leaves it a plain draggable. */
  details?: ParticipantChipDetails;
}

export function ParticipantChip({
  participationId,
  participantId,
  firstName,
  dateOfBirth,
  gender,
  parentFirstName,
  parentLastName,
  gamePlatform,
  gameUsername,
  gameExternalId,
  gameAvatarUrl,
  participantEmail,
  isPending,
  details,
}: ParticipantChipProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `participation-${participationId}`,
    data: { participationId, participantId, firstName },
    disabled: isPending,
  });
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on an outside press or Escape — the two gestures every transient
  // overlay in this app answers to. Only mounted while the popover is open, so a
  // rail of forty chips adds no listeners at rest.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && wrapperRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const inspectable = details !== undefined && isPending !== true;

  return (
    // The positioning context for the popover, and nothing else: `relative` on
    // a wrapper rather than on the chip itself, because the chip is what
    // dnd-kit transforms during a drag and a popover anchored to a moving box
    // would travel with it.
    <div ref={wrapperRef} className="relative">
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        aria-disabled={isPending || undefined}
        aria-expanded={inspectable ? open : undefined}
        onClick={inspectable ? () => setOpen((was) => !was) : undefined}
        onKeyDown={
          inspectable
            ? (event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                setOpen((was) => !was);
              }
            : undefined
        }
        className={cn(
          // `py-2` rather than `py-1.5`: the chip carries a picture now, and the
          // extra 2px a side is what keeps the stack from touching its own border.
          "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors",
          isPending
            ? "cursor-progress border-border bg-muted text-foreground opacity-50"
            : // Shared drag-cursor class (globals.css): grab on hover. The grabbing
              // cursor while dragging comes from the DragOverlay's `drag-ghost`.
              "drag-handle border-border bg-muted text-foreground",
          isDragging && "opacity-50",
          open && "border-primary",
        )}
      >
        <ChipContent
          participantId={participantId}
          firstName={firstName}
          dateOfBirth={dateOfBirth}
          gender={gender}
          parentFirstName={parentFirstName}
          parentLastName={parentLastName}
          gamePlatform={gamePlatform}
          gameUsername={gameUsername}
          gameExternalId={gameExternalId}
          gameAvatarUrl={gameAvatarUrl}
          participantEmail={participantEmail}
        />
      </div>

      {open && details !== undefined && (
        <ParticipantChipPopover
          participantId={participantId}
          firstName={firstName}
          dateOfBirth={dateOfBirth}
          gender={gender}
          parentFirstName={parentFirstName}
          parentLastName={parentLastName}
          gamePlatform={gamePlatform}
          gameUsername={gameUsername}
          gameExternalId={gameExternalId}
          gameAvatarUrl={gameAvatarUrl}
          participantEmail={participantEmail}
          details={details}
        />
      )}
    </div>
  );
}

/**
 * The seat's whole story, opened from its chip.
 *
 * It is an overlay rather than an expansion of the chip: chips sit in a wrapping
 * flex rail, so growing one would reflow every chip after it and push the
 * columns below down the page — a change on nobody's schedule but the reader's
 * own click, which is permitted, but which would move forty other chips to show
 * one. Floating above costs nothing and moves nothing.
 */
function ParticipantChipPopover({
  participantId,
  firstName,
  dateOfBirth,
  gender,
  parentFirstName,
  parentLastName,
  gamePlatform,
  gameUsername,
  gameExternalId,
  gameAvatarUrl,
  participantEmail,
  details,
}: ContentProps & { details: ParticipantChipDetails }) {
  const t = useTranslations("admin.products.groupsPanel");
  const c = useTranslations("common");
  const timeZone = useTimezone();

  const isAdult = participantEmail !== null;
  const parentName = [parentFirstName, parentLastName].filter(Boolean).join(" ");
  const contactEmail = participantEmail ?? details.contactEmail;

  return (
    <div
      role="dialog"
      aria-label={t("chip.detailsAria", { name: firstName })}
      className="absolute left-0 top-full z-30 mt-1.5 w-72 rounded-lg border border-border bg-popover p-3 text-xs font-normal shadow-lg"
    >
      <div className="flex items-center gap-2">
        <Avatar className="h-9 w-9">
          <Identicon id={participantId} size={36} />
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{firstName}</p>
          {isAdult && (
            <Badge
              className={cn(
                ROLE_BADGE_STYLES.customer,
                "px-1 py-0 text-[9px] font-normal leading-tight",
              )}
            >
              {c(ROLE_LABEL_KEYS.customer)}
            </Badge>
          )}
        </div>
      </div>

      <dl className="mt-3 space-y-1.5">
        {dateOfBirth !== null && (
          <DetailRow label={t("chip.details.age")}>
            {t("chip.age", { age: computeAge(dateOfBirth, timeZone) })}
          </DetailRow>
        )}
        {gender !== null && (
          <DetailRow label={t("chip.details.gender")}>
            {t(GENDER_KEY[gender])}
          </DetailRow>
        )}
        {!isAdult && parentName !== "" && (
          <DetailRow label={t("chip.details.parent")}>{parentName}</DetailRow>
        )}
        {contactEmail !== null && (
          <DetailRow label={t("chip.details.contact")}>
            <span className="break-all">{contactEmail}</span>
          </DetailRow>
        )}
      </dl>

      {gamePlatform !== null && (
        <div className="mt-3 border-t border-border pt-3">
          <GameUsernameRow
            platform={gamePlatform}
            username={gameUsername}
            externalId={gameExternalId}
            avatarUrl={gameAvatarUrl}
            figure="head"
          />
        </div>
      )}

      <Link
        href={details.adminUserHref}
        className="mt-3 inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
      >
        <ExternalLink aria-hidden className="h-3 w-3" />
        {t("chip.details.openUser")}
      </Link>
    </div>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}
