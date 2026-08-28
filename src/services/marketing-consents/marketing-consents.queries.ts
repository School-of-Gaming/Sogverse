"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { MarketingConsentsService } from "./marketing-consents.service";
import type { MarketingConsentType } from "@/types";

/**
 * Two entries under one root, because they are two questions about the same
 * rows asked by two different readers: a parent asking about themselves, and an
 * admin asking about somebody. The parent's own read carries no id — the
 * database supplies it from the session — so it cannot share a key with the
 * keyed one without inventing an id the query does not have.
 *
 * `all` is the parent of both, so a write invalidates the root and whichever of
 * the two entries this browser is holding refreshes. In a parent's session that
 * is `mine()`; in an admin's it is nothing at all, because an admin cannot call
 * the writer.
 */
export const marketingConsentKeys = {
  all: ["marketing-consents"] as const,
  mine: () => [...marketingConsentKeys.all, "mine"] as const,
  byCustomer: (customerId: string) =>
    [...marketingConsentKeys.all, "by-customer", customerId] as const,
};

/**
 * The signed-in parent's own marketing consents.
 *
 * At most two rows, read by primary-key prefix — a near-instant indexed call, so
 * a consumer renders nothing while it flies inside a container that already has
 * its final size rather than a skeleton or a spinner. What a consumer *must*
 * do is treat `undefined` as "not answered yet" and never let an unresolved
 * read decide a write: a control rendered *from* server state (the settings
 * toggle) has to stay disabled until it lands, or it would send the opposite of
 * what is on file, while a control that merely *seeds* from it (the signup
 * panel's optional box) may render immediately and let a reader's own edit
 * outrank a late answer.
 *
 * **`enabled` is not a convenience.** The query is only meaningful for a
 * signed-in customer: `anon` holds no grant on the table at all, and an ADMIN's
 * own SELECT policy widens the unfiltered select to every parent's rows — so a
 * caller that cannot promise a customer session must switch it off rather than
 * pass whatever comes back into a checkbox.
 */
export function useMyMarketingConsents({ enabled = true } = {}) {
  const supabase = getClient();
  const service = new MarketingConsentsService(supabase);

  return useQuery({
    queryKey: marketingConsentKeys.mine(),
    queryFn: () => service.getMyConsents(),
    enabled,
  });
}

/**
 * One customer's marketing consents, for an admin surface.
 *
 * The admin's own SELECT policy is what makes this answerable; a parent calling
 * it with somebody else's id receives an empty list rather than an error, which
 * is RLS working rather than a case to handle.
 */
export function useMarketingConsentsForCustomer(customerId: string) {
  const supabase = getClient();
  const service = new MarketingConsentsService(supabase);

  return useQuery({
    queryKey: marketingConsentKeys.byCustomer(customerId),
    queryFn: () => service.getConsentsForCustomer(customerId),
    enabled: !!customerId,
  });
}

/**
 * Set one of the signed-in parent's own consents.
 *
 * Invalidates the whole root rather than one entry, because the mutation names
 * no subject: the holder is whoever is signed in, and in their own cache the
 * root holds exactly the one entry. Invalidating `byCustomer(uid)` as well
 * would name a key only an admin's browser ever has — and an admin cannot reach
 * this writer at all, since the RPC is guard-first on `assert_role('customer')`.
 *
 * The caller owns the disabled state across the whole click, per the
 * loading-state rule: `isPending` flips false before `onSuccess` runs, so a
 * control must hold its own committing flag set synchronously before `mutate()`.
 */
export function useSetMarketingConsent() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new MarketingConsentsService(supabase);

  return useMutation({
    mutationFn: ({
      consentType,
      granted,
      source,
    }: {
      consentType: MarketingConsentType;
      granted: boolean;
      source: "settings" | "enrolment";
    }) => service.setMyConsent(consentType, granted, source),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: marketingConsentKeys.all }),
  });
}
