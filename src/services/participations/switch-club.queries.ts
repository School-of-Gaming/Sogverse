"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseJsonResponse } from "@/lib/api/json-response";
import { groupsKeys, invalidateGroupChange } from "@/services/groups";
import {
  switchClubCheckResponse,
  switchClubCommitResponse,
  switchClubErrorResponse,
  type SwitchClubCheckResponse,
  type SwitchClubCommitResponse,
  type SwitchClubRefusal,
} from "./switch-club.contracts";

/**
 * The admin club switch's two calls, as hooks: the check that fills the dialog,
 * and the commit that moves the seat and swaps the Stripe subscription.
 *
 * **No service class.** Both halves are one `fetch` against one admin route
 * family whose shapes are already owned by `switch-club.contracts.ts`, and
 * neither touches the injected Supabase client — the service-layer split exists
 * to keep RLS-scoped reads and secret-bearing writes apart, and there is no read
 * of the first kind here to separate out.
 */

const switchPath = (productId: string, participationId: string) =>
  `/api/admin/products/${productId}/participations/${participationId}/switch`;

export const switchClubKeys = {
  all: ["switch-club"] as const,
  check: (participationId: string, targetProductId: string) =>
    [...switchClubKeys.all, "check", participationId, targetProductId] as const,
};

/**
 * A commit the route refused, carrying the two fields the dialog branches on.
 *
 * `refusals` is a 400 the dialog can word itself — a hard gate the check either
 * missed or that moved underneath it — and the confirm goes dead. `stripeUpdated`
 * is the one 500 the design plans for: the subscription is already on the new
 * price and the database step failed, so pressing again with the same request id
 * replays a Stripe call that prorates nothing and re-runs the database half. The
 * dialog therefore leaves the confirm live for exactly that case.
 */
export class SwitchClubCommitError extends Error {
  readonly refusals: SwitchClubRefusal[];
  readonly stripeUpdated: boolean;

  constructor(
    message: string,
    options: { refusals?: SwitchClubRefusal[]; stripeUpdated?: boolean },
  ) {
    super(message);
    this.name = "SwitchClubCommitError";
    this.refusals = options.refusals ?? [];
    this.stripeUpdated = options.stripeUpdated ?? false;
  }
}

async function readCommitError(response: Response): Promise<never> {
  const body = switchClubErrorResponse.safeParse(
    await response.json().catch(() => null),
  );
  throw new SwitchClubCommitError(
    body.success ? body.data.error : "Could not switch club",
    body.success
      ? { refusals: body.data.refusals, stripeUpdated: body.data.stripeUpdated }
      : {},
  );
}

/**
 * What the dialog shows for one candidate target, and whether the commit is
 * allowed: the two amounts, and the hard refusals.
 *
 * Disabled until a target is picked, and keyed on the pair — choosing another
 * club is a different question with a different answer, so the previous one is
 * not carried over and the dialog's price block returns to its skeleton. The
 * call reads Stripe, which is the perceptibly-slow category, so the skeleton is
 * immediate and the block it sits in already has its final height.
 *
 * Deliberately no `staleTime`: this is the state of a family's money, read at
 * the moment an admin is about to change it, and a cached answer from earlier in
 * the session is not the same fact.
 */
export function useSwitchClubCheck(
  productId: string,
  participationId: string,
  targetProductId: string | null,
) {
  return useQuery({
    queryKey: switchClubKeys.check(participationId, targetProductId ?? ""),
    queryFn: async (): Promise<SwitchClubCheckResponse> => {
      const response = await fetch(
        `${switchPath(productId, participationId)}?target=${encodeURIComponent(
          targetProductId!,
        )}`,
      );
      if (!response.ok) {
        // A refusal is a 200 with a populated `refusals` array; a non-2xx here
        // is the route itself failing, which is not an answer the dialog can
        // word — it shows its own "could not check" line instead.
        throw new Error("Could not check the switch");
      }
      return parseJsonResponse(response, switchClubCheckResponse);
    },
    enabled: targetProductId !== null,
  });
}

interface CommitVars {
  targetProductId: string;
  /**
   * Minted once per dialog open and reused for every press in that dialog, so a
   * retry after a timeout or a failed database step replays the same Stripe
   * request rather than prorating a second time.
   */
  requestId: string;
}

/**
 * Move the seat and swap the subscription.
 *
 * On success both products' snapshots have changed — the seat left one and
 * landed unassigned on the other — so the invalidation is the groups **root**
 * rather than either product's key, and it rides the panel's shared helper so
 * the admin dashboard's ops queue is refreshed with it.
 */
export function useSwitchClub(productId: string, participationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vars: CommitVars): Promise<SwitchClubCommitResponse> => {
      const response = await fetch(switchPath(productId, participationId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars),
      });
      if (!response.ok) await readCommitError(response);
      return parseJsonResponse(response, switchClubCommitResponse);
    },
    onSuccess: () => invalidateGroupChange(queryClient, groupsKeys.all),
  });
}
