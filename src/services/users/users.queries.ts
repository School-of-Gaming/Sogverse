"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { UsersService } from "./users.service";
import { minecraftKeys } from "@/services/minecraft/minecraft.queries";
import { robloxKeys } from "@/services/roblox/roblox.queries";
import type { AdminGameAccountBody } from "./users.contracts";
import type { ProfileUpdate, UserRole } from "@/types";

const userKeys = {
  all: ["users"] as const,
  lists: () => [...userKeys.all, "list"] as const,
  list: (filters: string) => [...userKeys.lists(), { filters }] as const,
  details: () => [...userKeys.all, "detail"] as const,
  detail: (id: string) => [...userKeys.details(), id] as const,
  byRole: (role: UserRole) => [...userKeys.all, "role", role] as const,
  parentGamerLinks: () => [...userKeys.all, "parent-gamer-links"] as const,
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

/**
 * An admin editing another account's game username.
 *
 * Invalidates the **stored-row** branch of whichever platform was written, and
 * nothing else. Not the platform root: that also holds the resolved pictures,
 * which cost upstream requests against a shared per-IP budget and did not change
 * because a name did. The account query underneath the admin page's rows is what
 * refetches, which is what feeds the row its new props.
 */
export function useUpdateUserGameAccount() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new UsersService(supabase);

  return useMutation({
    mutationFn: ({
      userId,
      edit,
    }: {
      userId: string;
      edit: AdminGameAccountBody;
    }) => service.updateUserGameAccount(userId, edit),
    onSuccess: (_result, { userId, edit }) => {
      if (edit.platform === "minecraft") {
        queryClient.invalidateQueries({
          queryKey: minecraftKeys.account(userId),
        });
      } else {
        queryClient.invalidateQueries({ queryKey: robloxKeys.account(userId) });
      }
    },
  });
}

/**
 * Send the signed-in user a verification link for their own address.
 *
 * **Nothing is invalidated on success, and that is not an omission.** Sending
 * the mail changes no state this client has read: `email_verified_at` is stamped
 * later, when somebody opens their inbox and follows the link, on a page load
 * that rebuilds the cache from scratch. Refetching the profile here would only
 * confirm what is already on screen.
 *
 * The mutation resolves to a `VerificationEmailSendOutcome`, so `onSuccess`
 * still has to read which of the two happened: being turned away by the per-hour
 * limit is a success as far as the request went, and a different sentence as far
 * as the person is concerned.
 */
export function useSendVerificationEmail() {
  const supabase = getClient();
  const service = new UsersService(supabase);

  return useMutation({
    mutationFn: () => service.sendVerificationEmail(),
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
