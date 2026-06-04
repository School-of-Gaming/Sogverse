"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { UsersService } from "./users.service";
import type { ProfileUpdate, UserRole, SpokenLanguage } from "@/types";

const userKeys = {
  all: ["users"] as const,
  lists: () => [...userKeys.all, "list"] as const,
  list: (filters: string) => [...userKeys.lists(), { filters }] as const,
  details: () => [...userKeys.all, "detail"] as const,
  detail: (id: string) => [...userKeys.details(), id] as const,
  byRole: (role: UserRole) => [...userKeys.all, "role", role] as const,
  parentGamerLinks: () => [...userKeys.all, "parent-gamer-links"] as const,
  spokenLanguages: () => [...userKeys.all, "spoken-languages"] as const,
};

export function useProfile(userId: string) {
  const supabase = getClient();
  const service = new UsersService(supabase);

  return useQuery({
    queryKey: userKeys.detail(userId),
    queryFn: () => service.getProfile(userId),
    enabled: !!userId,
  });
}

export function useUsers() {
  const supabase = getClient();
  const service = new UsersService(supabase);

  return useQuery({
    queryKey: userKeys.lists(),
    queryFn: () => service.getAllUsers(),
  });
}

export function useUsersByRole(role: UserRole) {
  const supabase = getClient();
  const service = new UsersService(supabase);

  return useQuery({
    queryKey: userKeys.byRole(role),
    queryFn: () => service.getUsersByRole(role),
  });
}

export function useSearchUsers(query: string) {
  const supabase = getClient();
  const service = new UsersService(supabase);

  return useQuery({
    queryKey: userKeys.list(query),
    queryFn: () => service.searchUsers(query),
    enabled: query.length >= 2,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new UsersService(supabase);

  return useMutation({
    mutationFn: ({ userId, updates }: { userId: string; updates: ProfileUpdate }) =>
      service.updateProfile(userId, updates),
    onSuccess: (data, { userId }) => {
      queryClient.invalidateQueries({ queryKey: userKeys.detail(userId) });
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}

export function useParentGamerLinks() {
  const supabase = getClient();
  const service = new UsersService(supabase);

  return useQuery({
    queryKey: userKeys.parentGamerLinks(),
    queryFn: () => service.getAllParentGamerLinks(),
  });
}

/**
 * Fetch the reference set of spoken languages (human languages) from the
 * `spoken_languages` table. Distinct from `useLocaleControl` (UI locale).
 *
 * `initialData` (optional) is the server-prefetched set from a page's Server
 * Component (see `shop/page.tsx`). When present the language filter row paints
 * with the rest of the page on the first frame instead of popping in after its
 * own client fetch resolves (CLAUDE.md layout-shift rule); the hook still
 * refetches on mount.
 */
export function useSpokenLanguages(options?: {
  initialData?: SpokenLanguage[];
}) {
  const supabase = getClient();
  const service = new UsersService(supabase);

  return useQuery({
    queryKey: userKeys.spokenLanguages(),
    queryFn: () => service.getSpokenLanguages(),
    initialData: options?.initialData,
  });
}

export function useCreateGedu() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new UsersService(supabase);

  return useMutation({
    mutationFn: ({
      email,
      firstName,
      lastName,
      locale,
    }: {
      email: string;
      firstName: string;
      lastName: string | null;
      locale?: string;
    }) => service.createGedu(email, firstName, lastName, locale),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}
