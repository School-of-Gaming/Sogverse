"use client";

import type { ReactNode } from "react";
import { QueryProvider } from "./query-provider";
import { AuthProvider } from "./auth-provider";
import { CurrencyProvider } from "./currency-provider";
import { ThemeProvider } from "./theme-provider";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "@/types";

interface ProvidersProps {
  children: ReactNode;
  initialUser?: User | null;
  initialProfile?: Profile | null;
}

export function Providers({
  children,
  initialUser,
  initialProfile,
}: ProvidersProps) {
  return (
    <ThemeProvider>
      <QueryProvider>
        <AuthProvider initialUser={initialUser} initialProfile={initialProfile}>
          <CurrencyProvider>
            {children}
          </CurrencyProvider>
        </AuthProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}

export { useAuth } from "./auth-provider";
export { QueryProvider } from "./query-provider";
export { ThemeProvider } from "./theme-provider";
export { AuthProvider } from "./auth-provider";
export { CurrencyProvider, useCurrency } from "./currency-provider";
