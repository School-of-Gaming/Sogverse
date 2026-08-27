"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
  type DefinedUseQueryResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import type { GeduContractAcceptance } from "@/types";
import { GeduContractService } from "./gedu-contract.service";
import { geduContractKeys } from "./gedu-contract.keys";

/**
 * What a surface that prefetched the rows hands the hook: the rows, and
 * optionally the moment they were read.
 *
 * **`initialDataUpdatedAt` is the seed's own age, and a seed without one is
 * stamped as fetched right now.** That is right for a payload rendered for this
 * navigation and wrong for one served back out of the router cache, which can be
 * minutes old and would otherwise sit unquestioned for the whole 60-second
 * `staleTime`. A caller that stamps its read at the moment it made it lets React
 * Query age the seed honestly; the two are the same rule the family dashboards'
 * `seedAge` states from the other end, where `0` marks a *failed* prefetch stale
 * on arrival.
 */
interface GeduContractAcceptancesOptions {
  initialData?: GeduContractAcceptance[];
  initialDataUpdatedAt?: number;
}

/**
 * Every contract version one gedu has accepted, newest first.
 *
 * Two readers, one query: a gedu asking about themselves, and an admin looking
 * at a candidate. RLS is what tells them apart, so the hook does not — it takes
 * an id and lets the database answer.
 *
 * `initialData` is here for the surface that already fetched the rows on the
 * server; the key it seeds is `geduContractKeys.acceptances(geduId)`, which is
 * why that factory lives outside this `"use client"` file.
 *
 * **Two signatures, because a mandatory seed and an optional one are different
 * promises to the caller.** A surface whose page fails rather than render
 * without the rows (the settings card) passes them unconditionally and gets a
 * `data` that is never `undefined`, so its component has two states rather than
 * three. A surface that degrades when its prefetch failed (the contract page,
 * the admin certification card) passes nothing in that case and keeps handling
 * the unanswered read. The narrowing is React Query's own — `initialData` typed
 * as present is what makes `data` defined — and it is exposed here rather than
 * papered over at a call site with an assertion.
 */
export function useGeduContractAcceptances(
  geduId: string,
  options: {
    initialData: GeduContractAcceptance[];
    initialDataUpdatedAt?: number;
  },
): DefinedUseQueryResult<GeduContractAcceptance[], Error>;
export function useGeduContractAcceptances(
  geduId: string,
  options?: GeduContractAcceptancesOptions,
): UseQueryResult<GeduContractAcceptance[], Error>;
export function useGeduContractAcceptances(
  geduId: string,
  options?: GeduContractAcceptancesOptions,
) {
  const supabase = getClient();
  const service = new GeduContractService(supabase);

  return useQuery({
    queryKey: geduContractKeys.acceptances(geduId),
    queryFn: () => service.getAcceptances(geduId),
    initialData: options?.initialData,
    initialDataUpdatedAt: options?.initialDataUpdatedAt,
  });
}

/**
 * Accept a version of the contract as the signed-in gedu. Resolves to the
 * acceptance timestamp — the stored one, which on a repeat acceptance is the
 * moment of the *first* signature rather than of this call.
 *
 * Invalidates the whole `gedu-contract` root rather than one gedu's entry,
 * because the mutation names no subject: the signer is whoever is signed in,
 * and in their own cache that root holds exactly the one entry.
 *
 * **The admin dashboard's key is deliberately not invalidated here**, and the
 * reason is the line that key's own factory draws: its cache entry only ever
 * exists in an *admin's* browser, so an admin write invalidates it and a write
 * from any other role has nothing there to invalidate. Accepting the contract is
 * a gedu's own act, made in a gedu's session — a session that cannot call the
 * dashboard RPC at all — so an invalidation of that key would be provably dead.
 * The admin's queue picks the new acceptance up on its own next read.
 *
 * The caller owns the disabled/loading state across the success path: this hook
 * returns React Query's `isPending`, which flips false before `onSuccess` runs
 * and before any view swap, so a button must hold its own committing flag set
 * synchronously before `mutate()`.
 */
export function useAcceptGeduContract() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new GeduContractService(supabase);

  return useMutation({
    mutationFn: (version: string) => service.acceptContract(version),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: geduContractKeys.all });
    },
  });
}
