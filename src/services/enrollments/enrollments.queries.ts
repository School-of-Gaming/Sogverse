"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { groupKeys } from "@/services/groups/groups.queries";
import { EnrollmentsService } from "./enrollments.service";

export const enrollmentKeys = {
  all: ["enrollments"] as const,
  enrollmentGroups: (productId: string) =>
    [...enrollmentKeys.all, "groups", productId] as const,
};

export function useEnrollmentGroups(productId: string) {
  const supabase = getClient();
  const service = new EnrollmentsService(supabase);

  return useQuery({
    queryKey: enrollmentKeys.enrollmentGroups(productId),
    queryFn: () => service.getEnrollmentGroups(productId),
    enabled: !!productId,
  });
}

export function useEnrollGamer() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new EnrollmentsService(supabase);

  return useMutation({
    mutationFn: ({ gamerId, groupId }: { gamerId: string; groupId: string }) =>
      service.enrollGamer(gamerId, groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: enrollmentKeys.all });
      queryClient.invalidateQueries({ queryKey: groupKeys.mine() });
    },
  });
}
