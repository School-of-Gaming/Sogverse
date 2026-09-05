"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/providers/auth-provider";
import {
  commitAccountSwitch,
  switchGateFor,
  useFamily,
  useSessionProvenance,
  type FamilyMember,
  type SwitchAccountCredentials,
} from "@/services/family";
import { AddGamerDialog } from "./AddGamerDialog";
import { SwitchProfileDialog } from "./SwitchProfileDialog";
import { SwitchGateDialog, type SwitchGateMode } from "./SwitchGateDialog";
import {
  AddGamerTile,
  ProfileTile,
  ProfileTilesRow,
  SkeletonTile,
} from "./ProfileTiles";
import type { SessionProvenance } from "@/lib/session-provenance";
import { ROUTES, MAX_GAMERS_PER_PARENT } from "@/lib/constants";
import { byFirstName } from "@/lib/family-order";

/**
 * One-shot URL marker that carries a gamer's "Add Gamer" intent across the
 * account switch into a parent. A gamer can't create gamers, so clicking
 * "Add Gamer" must first switch into a parent — which loses the intent and
 * strands them on the parent dashboard to re-click. Instead the switch lands on
 * `/select-profile?action=add-gamer`; the selector reads this marker and
 * auto-opens the dialog (whose PIN gate then handles unlock inline). Kept as a
 * single source of truth so the writer (the SwitchProfileDialog redirectUrl
 * below) and reader (the mount effect) can't drift.
 *
 * NOT a caller-supplied redirect, so the `resolveInternalPath` open-redirect
 * rule (see CLAUDE.md) deliberately does not apply: this is a fixed flag whose
 * value is only ever compared `=== value` and then stripped. It never becomes a
 * navigation destination — the only target is the hardcoded `ROUTES.selectProfile`.
 * A crafted `?action=<anything-else>` simply fails the equality check and
 * is ignored.
 */
const ADD_GAMER_INTENT = { param: "action", value: "add-gamer" } as const;

interface FamilyProfileSelectorProps {
  /**
   * Override behavior when the viewer clicks their own tile. Default (unset)
   * makes the active tile non-interactive — used inside the My Family
   * section, where the viewer is already "where they are". The
   * /select-profile interstitial passes a navigator here so a parent can
   * pick themselves to enter the parent dashboard.
   */
  onSelfClick?: () => void;
  /**
   * When set, honor the `ADD_GAMER_INTENT` URL marker on mount — read it, strip
   * it, and auto-open the Add Gamer dialog once the viewer is known to be a
   * parent. Only the /select-profile interstitial passes this (it's where the
   * gamer→parent switch lands); the My Family section never auto-opens.
   */
  autoOpenAddGamerFromUrl?: boolean;
  /**
   * Server-prefetched family list to seed React Query (see `useFamily`). The
   * /select-profile RSC passes it so the selector paints fully populated on
   * first frame; omitted for in-session mounts (dialogs), which load client-side.
   */
  initialFamily?: FamilyMember[];
  /**
   * The provenance of the viewer's own session, seeded beside the list above.
   *
   * Required in practice wherever a *gamer* can land, because the gate is
   * undecidable without it and an undecided gate takes every tile out of
   * service. /select-profile derives it off the same verified JWT its auth
   * check already read; the My Family section on the parent dashboard omits it,
   * since a customer's switches are never gated.
   */
  initialSessionProvenance?: SessionProvenance;
}

/**
 * Netflix-style profile selector for the current viewer's family.
 *
 * One centered, wrap-on-every-breakpoint row: parents first, then gamers,
 * then the "Add Gamer" tile. Never horizontal-scrolls. The active viewer's
 * tile gets an act-colored ring; clicking another tile signs out and
 * signs in as that account with no confirmation dialog.
 *
 * The "Add Gamer" tile opens AddGamerDialog. useCreateGamer's onSuccess
 * invalidates the family query so the new gamer slots into the row.
 */
export function FamilyProfileSelector({
  onSelfClick,
  autoOpenAddGamerFromUrl = false,
  initialFamily,
  initialSessionProvenance,
}: FamilyProfileSelectorProps = {}) {
  const t = useTranslations("family");
  const locale = useLocale();
  const { user, profile } = useAuth();
  const { data: family, isLoading, error } = useFamily({
    initialData: initialFamily
      ? { family: initialFamily, sessionProvenance: initialSessionProvenance }
      : undefined,
  });
  /**
   * Out of the same cache entry as the list above, so it is non-null on the very
   * first frame wherever the page seeded it — which is what keeps a gamer's
   * tiles from starting disabled and then enabling themselves a round trip
   * later. Unseeded it is `null`, and `null` still means *wait*: guessing would
   * prompt for a credential the route refuses. A parent is unaffected either
   * way, because their gate is `none` whatever the provenance turns out to be.
   */
  const provenance = useSessionProvenance();
  const [committingTargetId, setCommittingTargetId] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [addGamerOpen, setAddGamerOpen] = useState(false);
  const [pendingAddGamerIntent, setPendingAddGamerIntent] = useState(false);
  const [switchToParentOpen, setSwitchToParentOpen] = useState(false);
  /** The switch a credential gate is standing in front of, while it stands. */
  const [gated, setGated] = useState<{
    member: FamilyMember;
    mode: SwitchGateMode;
  } | null>(null);

  const currentUserId = user?.id ?? null;
  const viewerIsCustomer = profile?.role === "customer";

  /**
   * What a switch costs from this session, from the one helper all three switch
   * surfaces share. The viewer's own tile is never a switch, so it is never
   * gated — which is the only thing about a tile that changes the answer.
   */
  function gateFor(member: FamilyMember) {
    if (member.id === currentUserId) return { kind: "none" } as const;
    return switchGateFor(profile?.role, provenance.data);
  }

  // Honor the gamer→parent "Add Gamer" intent: read the URL marker once on
  // mount and strip it (so a refresh/back doesn't reopen), recording a pending
  // intent. We can't open here — the viewer's role isn't known yet — so the
  // render derives the open state from `pendingAddGamerIntent && viewerIsCustomer`
  // below. window.location (not useSearchParams) avoids forcing a Suspense
  // boundary, matching unlock-gate's ?redirect= read.
  useEffect(() => {
    if (!autoOpenAddGamerFromUrl) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get(ADD_GAMER_INTENT.param) !== ADD_GAMER_INTENT.value) return;
    params.delete(ADD_GAMER_INTENT.param);
    const rest = params.toString();
    window.history.replaceState(
      null,
      "",
      rest ? `${window.location.pathname}?${rest}` : window.location.pathname,
    );
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot mount-time URL read, mirrors unlock-gate
    setPendingAddGamerIntent(true);
  }, [autoOpenAddGamerFromUrl]);

  async function handleSwitch(target: FamilyMember) {
    if (committingTargetId) return;

    if (target.id === currentUserId) {
      if (!onSelfClick) return;
      // Hold the spinner through the full-page nav initiated by onSelfClick
      // — same loading-state contract as the cross-account switch below.
      setCommittingTargetId(target.id);
      onSelfClick();
      return;
    }

    const gate = gateFor(target);
    if (gate.kind === "unknown") return;
    if (gate.kind === "pin" || gate.kind === "signOut") {
      setSwitchError(null);
      setGated({ member: target, mode: gate.kind });
      return;
    }

    setSwitchError(null);
    setCommittingTargetId(target.id);

    try {
      await commitAccountSwitch(target);
    } catch (err) {
      setCommittingTargetId(null);
      // The reader gets the translated line; the server's own words (always
      // English, and often a bare HTTP status) go to the console for whoever
      // is debugging it. Same policy on all three switch surfaces.
      console.error("[family-profile-selector] account switch failed:", err);
      setSwitchError(t("switchFailed"));
    }
  }

  if (error) {
    return (
      <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
        {error.message || t("loadFailed")}
      </div>
    );
  }

  if (isLoading || !family) {
    return (
      <ProfileTilesRow>
        <SkeletonTile />
        <SkeletonTile />
        <SkeletonTile />
      </ProfileTilesRow>
    );
  }

  const parents = family
    .filter((m) => m.role === "customer")
    .sort(byFirstName(locale));
  const gamers = family
    .filter((m) => m.role === "gamer")
    .sort(byFirstName(locale));

  // The Steven Brown Rule (UI-only cap) — see MAX_GAMERS_PER_PARENT for lore.
  const underStevenBrownLimit = gamers.length < MAX_GAMERS_PER_PARENT;
  // Gamers can also see the tile. Clicking from a gamer's dashboard opens a
  // confirm-switch dialog into their parent (only parents can create gamers)
  // instead of the form. Defensively hide the tile if a gamer has no linked
  // parents (shouldn't happen in practice).
  const canTriggerAddGamer = viewerIsCustomer
    ? underStevenBrownLimit
    : underStevenBrownLimit && parents.length > 0;

  function handleAddGamerClick() {
    if (viewerIsCustomer) {
      setAddGamerOpen(true);
    } else {
      setSwitchToParentOpen(true);
    }
  }

  // A pending gamer→parent intent opens the dialog as soon as we know the viewer
  // is the parent (post-switch). Deriving it here — rather than in a second
  // effect — keeps the role-gating reactive without another set-state-in-effect.
  const showAddGamer = addGamerOpen || (pendingAddGamerIntent && viewerIsCustomer);

  function handleAddGamerOpenChange(next: boolean) {
    if (next) {
      setAddGamerOpen(true);
    } else {
      // Closing clears both the manual flag and any honored intent so it can't
      // re-open on the next render.
      setAddGamerOpen(false);
      setPendingAddGamerIntent(false);
    }
  }

  const isAnyCommitting = !!committingTargetId;

  return (
    <div className="space-y-4">
      {switchError && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {switchError}
        </div>
      )}

      {/* Single wrap-on-every-breakpoint row: parents first, then gamers,
          then "Add Gamer". Wraps to multiple lines as needed on narrow
          viewports — never horizontal-scrolls. */}
      <ProfileTilesRow>
        {[...parents, ...gamers].map((member) => {
          const isActive = member.id === currentUserId;
          const activeIsClickable = !!onSelfClick;
          const gate = gateFor(member);
          // The only thing that takes a tile out of service: a gate whose
          // answer has not landed. Every family member is on screen and every
          // one of them is clickable — a switch that needs a sign-out says so
          // in the dialog the click opens.
          const blockedByGate = gate.kind === "unknown";
          // Non-active tiles stay visually clickable even while a switch is
          // in flight — only the active tile (when it has no self navigator)
          // shows the default cursor.
          const clickable = (!isActive || activeIsClickable) && !blockedByGate;
          return (
            <ProfileTile
              key={member.id}
              member={member}
              isActive={isActive}
              clickable={clickable}
              disabled={
                (isActive && !activeIsClickable) ||
                isAnyCommitting ||
                blockedByGate
              }
              isLoading={committingTargetId === member.id}
              onClick={() => handleSwitch(member)}
            />
          );
        })}
        {canTriggerAddGamer && (
          <AddGamerTile onClick={handleAddGamerClick} />
        )}
      </ProfileTilesRow>

      {/* The gate for a tile the viewer clicked. Mounted only while it stands,
          so the digits typed into it are discarded on close rather than
          waiting to greet the next switch. */}
      {gated && (
        <SwitchGateDialog
          open
          onOpenChange={(next) => {
            if (!next) setGated(null);
          }}
          target={gated.member}
          // The gate only ever stands for a gamer viewer, and `gateFor` cannot
          // answer anything but `unknown` until that viewer's profile has
          // landed — so the fallback is unreachable and exists for the type.
          viewerFirstName={profile?.first_name ?? ""}
          mode={gated.mode}
          onCommit={(credentials: SwitchAccountCredentials) =>
            commitAccountSwitch(gated.member, credentials)
          }
        />
      )}

      <AddGamerDialog open={showAddGamer} onOpenChange={handleAddGamerOpenChange} />
      {/* Gamer → parent switch so a gamer can land on a parent who's allowed to
          create gamers. The redirect carries the add-gamer intent marker, so the
          dialog (past its PIN gate) auto-opens on /select-profile rather than
          dumping the parent on /parent. The UI links exactly one parent per
          gamer today (parents.length > 0 gates the tile), so we target the first
          — revisit this if multi-parent linking ever returns. */}
      {!viewerIsCustomer && parents[0] && (
        <SwitchProfileDialog
          open={switchToParentOpen}
          onOpenChange={setSwitchToParentOpen}
          target={parents[0]}
          // A gamer reaching for a parent pays the same gate as any other
          // switch; the dialog folds it in as a second step so the intent
          // marker still rides along on the redirect.
          gate={gateFor(parents[0])}
          viewerFirstName={profile?.first_name ?? ""}
          redirectUrl={`${ROUTES.selectProfile}?${ADD_GAMER_INTENT.param}=${ADD_GAMER_INTENT.value}`}
          title={t("switchToParentToAddGamer.title", { name: parents[0].first_name })}
          oneWayWarning={t("switchToParentToAddGamer.oneWayWarning")}
        />
      )}
    </div>
  );
}
