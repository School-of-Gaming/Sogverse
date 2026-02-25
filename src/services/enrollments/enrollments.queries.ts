"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { tokenKeys } from "@/services/tokens";
import { EnrollmentsService } from "./enrollments.service";

export const enrollmentKeys = {
  all: ["enrollments"] as const,
  myEnrollments: () => [...enrollmentKeys.all, "mine"] as const,
  enrollmentGroups: (productId: string) =>
    [...enrollmentKeys.all, "groups", productId] as const,
};

export function useMyEnrollments() {
  const supabase = getClient();
  const service = new EnrollmentsService(supabase);

  return useQuery({
    queryKey: enrollmentKeys.myEnrollments(),
    queryFn: () => service.getMyEnrollments(),
  });
}

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
      queryClient.invalidateQueries({ queryKey: tokenKeys.all });
    },
  });
}

export function useUnenrollGamer() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new EnrollmentsService(supabase);

  return useMutation({
    mutationFn: (enrollmentId: string) => service.unenrollGamer(enrollmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: enrollmentKeys.all });
      queryClient.invalidateQueries({ queryKey: tokenKeys.all });
    },
  });
}
