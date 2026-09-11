"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { GamerPhotoConsentsService } from "./gamer-photo-consents.service";
import type { GamerPhotoConsentType } from "@/types";

/**
 * Two entries under one root, and both of them are keyed — which is where this
 * factory departs from its marketing twin. There the parent's own read carried
 * no id because the database supplied it from the session; here the subject is
 * a *child*, so every read names whose answer it is asking about, whoever is
 * asking.
 *
 * `forGamers` **sorts the ids**, so two callers holding the same roster in
 * different orders share one cache entry rather than fetching the same rows
 * twice. A roster arrives ordered by whatever the surface sorted it by, and
 * that ordering is a rendering decision that has no business reaching the cache
 * key. The copy before sorting is not optional: `toSorted` is avoided so the
 * key does not depend on the runtime's array methods, and sorting the caller's
 * array in place would reorder the roster they are rendering.
 *
 * `all` is the parent of both, so a write invalidates the root and every entry
 * this browser is holding refreshes — including a gedu-shaped roster read that
 * happens to include the child just answered for.
 */
export const gamerPhotoConsentKeys = {
  all: ["gamer-photo-consents"] as const,
  forGamer: (gamerId: string) =>
    [...gamerPhotoConsentKeys.all, "for-gamer", gamerId] as const,
  forGamers: (gamerIds: readonly string[]) =>
    [
      ...gamerPhotoConsentKeys.all,
      "for-gamers",
      [...gamerIds].sort(),
    ] as const,
};

/**
 * One gamer's photo consents.
 *
 * At most one row, read by primary-key prefix — a near-instant indexed call, so
 * a consumer renders nothing while it flies inside a container that already has
 * its final size rather than a skeleton or a spinner. What a consumer *must* do
 * is treat `undefined` as "not answered yet" and never let an unresolved read
 * decide a write: a control rendered *from* server state (the parent's toggle
 * on the manage-gamer page) has to stay disabled until it lands, or it would
 * send the opposite of what is on file, while a control that merely *seeds*
 * from it may render immediately and let a reader's own edit outrank a late
 * answer.
 *
 * `enabled` is there for the caller who does not have an id yet; the query is
 * pointless without one, and RLS rather than this flag decides whether the
 * answer comes back non-empty.
 */
export function useGamerPhotoConsents(
  gamerId: string,
  { enabled = true } = {},
) {
  const supabase = getClient();
  const service = new GamerPhotoConsentsService(supabase);

  return useQuery({
    queryKey: gamerPhotoConsentKeys.forGamer(gamerId),
    queryFn: () => service.getForGamer(gamerId),
    enabled: enabled && !!gamerId,
  });
}

/**
 * The same rows for a whole roster, in one request.
 *
 * The read a gedu's session editor makes: it needs every gamer on the roster
 * marked allowed or not allowed, and an id with no row back is "not allowed"
 * rather than "still loading" — the service's doc comment says why that
 * collapse is the feature rather than a shortcut.
 *
 * Left enabled on an empty list on purpose: the service answers `[]` without a
 * request, so the query resolves in the same tick and the consumer renders its
 * settled empty state instead of an indefinite pending one.
 */
export function useGamerPhotoConsentsForGamers(
  gamerIds: readonly string[],
  { enabled = true } = {},
) {
  const supabase = getClient();
  const service = new GamerPhotoConsentsService(supabase);

  return useQuery({
    queryKey: gamerPhotoConsentKeys.forGamers(gamerIds),
    queryFn: () => service.getForGamers(gamerIds),
    enabled,
  });
}

/**
 * Answer one photo consent for one of the signed-in parent's own children.
 *
 * Invalidates the whole root rather than the one gamer's entry, because the
 * answer shows up in more places than the key that names the child: a parent's
 * manage-gamer page, the gamer's own settings row, and any roster-shaped read
 * that happens to include them. Naming `forGamer(gamerId)` alone would leave a
 * roster entry in this browser holding the previous answer with nothing to
 * invalidate it, and the root is cheap — a browser holds at most a handful of
 * these entries.
 *
 * The caller owns the disabled state across the whole click, per the
 * loading-state rule: `isPending` flips false before `onSuccess` runs, so a
 * control must hold its own committing flag set synchronously before `mutate()`.
 */
export function useSetGamerPhotoConsent() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new GamerPhotoConsentsService(supabase);

  return useMutation({
    mutationFn: ({
      gamerId,
      consentType,
      granted,
      source,
    }: {
      gamerId: string;
      consentType: GamerPhotoConsentType;
      granted: boolean;
      source: "settings" | "enrolment";
    }) => service.setConsent(gamerId, consentType, granted, source),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: gamerPhotoConsentKeys.all }),
  });
}
