"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { getClient } from "@/lib/supabase/client";
import { resolveLocale } from "@/lib/constants/locales";
import { expandAssignedProductsToCards } from "@/lib/assigned-products";
import { useNow } from "@/providers";
import type { GroupCardProps } from "@/components/gedu/GroupCard";
import {
  AssignmentsService,
  type MyAssignedProductSessionRow,
} from "./assignments.service";

export const assignmentKeys = {
  all: ["assignments"] as const,
  myAssignedProducts: () => [...assignmentKeys.all, "my-assigned-products"] as const,
};

/**
 * Drives the gedu dashboard's "My Groups" section. Fetches the signed-in
 * gedu's product assignments + product-wide aggregates, then expands each
 * one into a `GroupCardProps` keyed off the soonest upcoming session for
 * the product. Products with no future occurrence are dropped (mirroring
 * the parent/gamer Sessions section behavior); the open-room window flips
 * `voiceIsOpen` on the live card without a refetch via `useNow()`.
 *
 * `initialData` is required — the gedu page server-prefetches the rows so
 * the section paints on first frame with no loading state.
 */
export function useMyAssignedProducts(options: {
  initialData: MyAssignedProductSessionRow[];
}): GroupCardProps[] {
  const supabase = getClient();
  const service = new AssignmentsService(supabase);
  const locale = resolveLocale(useLocale());
  const now = useNow();

  const query = useQuery({
    queryKey: assignmentKeys.myAssignedProducts(),
    queryFn: () => service.getMyAssignedProducts(),
    initialData: options.initialData,
  });

  return useMemo(
    () => expandAssignedProductsToCards(query.data, now, locale),
    [query.data, now, locale],
  );
}
