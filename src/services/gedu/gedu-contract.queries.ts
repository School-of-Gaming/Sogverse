"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import type { GeduContractAcceptance } from "@/types";
import { GeduContractService } from "./gedu-contract.service";
import { geduContractKeys } from "./gedu-contract.keys";

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
 */
export function useGeduContractAcceptances(
  geduId: string,
  options?: { initialData?: GeduContractAcceptance[] },
) {
  const supabase = getClient();
  const service = new GeduContractService(supabase);

  return useQuery({
    queryKey: geduContractKeys.acceptances(geduId),
    queryFn: () => service.getAcceptances(geduId),
    initialData: options?.initialData,
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
