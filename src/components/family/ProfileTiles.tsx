"use client";

import Link from "next/link";
import { Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Identicon } from "@/components/ui/identicon";
import type { FamilyMember } from "@/services/family";
import { cn } from "@/lib/utils";

export type TileSize = "default" | "sm";

const TILE_WIDTH: Record<TileSize, string> = {
  default: "w-16 sm:w-20 md:w-24",
  sm: "w-14 sm:w-16 md:w-20",
};

const ADD_ICON_SIZE: Record<TileSize, string> = {
  default: "h-10 w-10 sm:h-12 sm:w-12",
  sm: "h-8 w-8 sm:h-10 sm:w-10",
};

const SKELETON_LABEL: Record<TileSize, string> = {
  default: "h-4 w-12 sm:h-5 sm:w-16",
  // Heights must match the real ProfileTile label (text-xs → h-4, text-sm → h-5)
  // at each breakpoint so the section doesn't grow when data lands.
  sm: "h-4 w-10 sm:h-5 sm:w-12 md:w-14",
};

/**
 * The name label's ink, by the role whose tile it is — the ruled role families,
 * which `ROLE_BADGE_STYLES` (`src/lib/constants/roles.ts`) spells as fills for
 * the surfaces that badge a role outright: **a parent is harmony, a gamer is
 * amber.** This row is where that grammar earns its keep without a badge in
 * sight, which is the standing direction to reinforce the role colours wherever
 * roles are understood even with no explicit label present (direction 25): the
 * page asking who is entering Sogverse shows every role a family has, side by
 * side, with nothing but a face and a first name to tell them apart.
 *
 * **Ink takes the soft variant where the family has one** — the mechanism the
 * element cards were signed off on — and amber has no strong/soft split, so it
 * is drawn as itself. Measured on the page ground: amber 9.58:1, harmony-soft
 * 7.70:1, both clear of the 4.5:1 body bar.
 *
 * **The colour says who, the ring says where you are**, and the two are kept
 * apart deliberately. The tile's mark is the ring alone — white at four when
 * this is the profile you are on or pointing at, neutral two otherwise — so the
 * label is free to carry identity at rest on every tile, the active one
 * included. It does not repaint on hover either: an identity is not hover
 * feedback, and colour spent behind a cursor never reaches a family on a phone.
 *
 * **The add-a-gamer tile beside these is the deliberate exception, and it keeps
 * its muted-to-foreground hover**: it names an action rather than a person, so
 * there is no identity for it to carry at rest and the hover lift is ordinary
 * affordance feedback in the neutral idiom — the same gray idiom every dashed
 * add affordance in the app wears. A sweep making it match its siblings would be
 * giving a button a role colour.
 *
 * Classes are literal strings because Tailwind scans source text.
 */
const ROLE_INK: Record<FamilyMember["role"], string> = {
  customer: "text-yty-harmony-soft",
  gamer: "text-primary",
};

/**
 * Wrap-on-every-breakpoint, centered. Vertical padding leaves room for the
 * active tile's ring + ring-offset so neither gets clipped by section
 * boundaries.
 */
export function ProfileTilesRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-center gap-3 py-1 sm:gap-5">
      {children}
    </div>
  );
}

type ProfileTileCommonProps = {
  member: FamilyMember;
  size?: TileSize;
  /** Adds the primary-colored ring used to mark the active viewer. */
  isActive?: boolean;
};

/**
 * Navigation tile: renders as a Next.js Link so middle-click / ctrl-click /
 * right-click open-in-new-tab all work. No disabled or loading state — for
 * actions that block the click (e.g. mid-flight account switch), use the
 * onClick variant.
 */
type ProfileTileLinkProps = ProfileTileCommonProps & {
  href: string;
  onClick?: never;
  disabled?: never;
  clickable?: never;
  isLoading?: never;
};

/**
 * Action tile: renders as a button. Used by FamilyProfileSelector, where
 * the click triggers an in-flight switch and needs disabled/loading state.
 */
type ProfileTileButtonProps = ProfileTileCommonProps & {
  href?: never;
  onClick?: () => void;
  /**
   * Sets the underlying button's `disabled` attribute (blocks click). Defaults
   * to false. Visual clickability is controlled separately by `clickable` so
   * the FamilyProfileSelector can keep the hover affordance on
   * still-not-yet-active tiles while another switch is mid-flight.
   */
  disabled?: boolean;
  /**
   * Controls cursor + hover/focus scale. Defaults to `!disabled`. The
   * FamilyProfileSelector overrides this for its active tile (clickable only
   * when an onSelfClick navigator is supplied).
   */
  clickable?: boolean;
  /** Renders a dimming spinner overlay while this tile's action is in flight. */
  isLoading?: boolean;
};

type ProfileTileProps = ProfileTileLinkProps | ProfileTileButtonProps;

export function ProfileTile(props: ProfileTileProps) {
  const { member, size = "default", isActive = false } = props;
  const isLink = "href" in props && props.href !== undefined;
  const isLoading = !isLink && (props.isLoading ?? false);
  const isClickable = isLink
    ? true
    : (props.clickable ?? !(props.disabled ?? false));

  const wrapperClassName = cn(
    "group flex flex-col items-center gap-2 transition-transform duration-150",
    TILE_WIDTH[size],
    isClickable ? "cursor-pointer hover:scale-105 focus-visible:scale-105" : "cursor-default",
  );

  const inner = (
    <>
      <div
        className={cn(
          // The mark is the ring and only the ring: white at four when this is
          // the profile you are on or pointing at, a neutral two otherwise. The
          // amber it used to wear was doing you-are-here work that white does
          // better against a mosaic of coloured identicons, and the /50 rest
          // ring was that amber mixed toward the page. The `border-2` stays and
          // stays transparent — a ring draws with box-shadow and moves nothing,
          // but dropping a border class would move the picture inside it.
          "relative aspect-square w-full overflow-hidden rounded-lg border-2 border-transparent ring-offset-2 ring-offset-background transition-[box-shadow] duration-150",
          isActive
            ? "ring-4 ring-foreground"
            : "ring-2 ring-border group-hover:ring-4 group-hover:ring-foreground group-focus-visible:ring-4 group-focus-visible:ring-foreground",
        )}
      >
        <Identicon id={member.id} size={112} />
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <Loader2 className="h-8 w-8 animate-spin text-white" />
          </div>
        )}
      </div>
      {/* whitespace-nowrap + text-center lets long names spill into the
          gap between tiles instead of truncating. The wrapper itself stays
          a fixed width so avatar layout is unchanged; only the text overflows.

          The ink is the person's **role**, at rest, on every tile — see
          `ROLE_INK`. It replaces a muted-to-white pair that was saying a second
          time what the ring already says: the ring is the you-are-here mark, so
          this line was free to start carrying who somebody is instead. */}
      <span
        className={cn(
          "whitespace-nowrap text-center text-xs font-medium sm:text-sm",
          ROLE_INK[member.role],
        )}
      >
        {member.first_name}
      </span>
    </>
  );

  if (isLink) {
    return (
      <Link
        href={props.href}
        aria-current={isActive ? "true" : undefined}
        className={wrapperClassName}
      >
        {inner}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      aria-current={isActive ? "true" : undefined}
      className={wrapperClassName}
    >
      {inner}
    </button>
  );
}

export function AddGamerTile({
  size = "default",
  onClick,
}: {
  size?: TileSize;
  onClick: () => void;
}) {
  const t = useTranslations("family");
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex flex-col items-center gap-2 transition-transform duration-150 hover:scale-105 focus-visible:scale-105",
        TILE_WIDTH[size],
      )}
      aria-label={t("addGamer")}
    >
      {/* The gray idiom every dashed add affordance in the app wears: the edge
          firms up and a neutral lift comes in behind it. The amber edge and its
          `primary/5` wash are gone — the wash was a brand hue mixed down into a
          surface, and the edge was colour spent behind a cursor that a family
          on a phone never sees. */}
      <div className="relative aspect-square w-full overflow-hidden rounded-lg border-2 border-dashed border-muted-foreground/40 transition-colors duration-150 group-hover:border-foreground/30 group-hover:bg-accent group-focus-visible:border-foreground/30">
        <div className="absolute inset-0 flex items-center justify-center">
          <Plus
            className={cn(
              "text-muted-foreground transition group-hover:text-foreground",
              ADD_ICON_SIZE[size],
            )}
            strokeWidth={1.5}
          />
        </div>
      </div>
      <span className="whitespace-nowrap text-center text-xs font-medium text-muted-foreground group-hover:text-foreground sm:text-sm">
        {t("addGamer")}
      </span>
    </button>
  );
}

export function SkeletonTile({ size = "default" }: { size?: TileSize }) {
  return (
    <div
      aria-hidden
      className={cn("flex flex-col items-center gap-2", TILE_WIDTH[size])}
    >
      <div className="aspect-square w-full animate-pulse rounded-lg bg-muted" />
      <div className={cn("animate-pulse rounded bg-muted", SKELETON_LABEL[size])} />
    </div>
  );
}
