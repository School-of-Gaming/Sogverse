"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/providers";
import { ROLE_DASHBOARD_PATHS, type UserRole } from "@/lib/constants";

interface RoleGuardProps {
  children: ReactNode;
  allowedRoles: UserRole[];
  fallback?: ReactNode;
}

export function RoleGuard({
  children,
  allowedRoles,
  fallback,
}: RoleGuardProps) {
  const c = useTranslations('common');
  const { profile, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && profile) {
      if (!allowedRoles.includes(profile.role)) {
        // Redirect to user's own dashboard
        const dashboardPath = ROLE_DASHBOARD_PATHS[profile.role];
        router.push(dashboardPath);
      }
    }
  }, [profile, isLoading, allowedRoles, router]);

  if (isLoading) {
    return (
      fallback || (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      )
    );
  }

  if (!profile || !allowedRoles.includes(profile.role)) {
    return (
      fallback || (
        <div className="flex h-64 items-center justify-center">
          <p className="text-muted-foreground">
            {c('noPermission')}
          </p>
        </div>
      )
    );
  }

  return <>{children}</>;
}
