"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import type { Profile } from "@/types";

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
  initialUser?: User | null;
  initialProfile?: Profile | null;
}

export function AuthProvider({
  children,
  initialUser = null,
  initialProfile = null,
}: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(initialUser);
  const [profile, setProfile] = useState<Profile | null>(initialProfile);
  const [isLoading, setIsLoading] = useState(!initialUser);

  const supabase = getClient();
  const queryClient = useQueryClient();

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) {
      console.error("Error fetching profile:", error);
      return null;
    }

    return data;
  };

  const refreshProfile = async () => {
    if (user) {
      const newProfile = await fetchProfile(user.id);
      setProfile(newProfile);
    }
  };

  const signOut = async () => {
    // Navigate immediately — don't await signOut() or the onAuthStateChange
    // SIGNED_OUT event will null the profile before the browser navigates,
    // causing the sidebar to flash away. The full page navigation wipes all
    // client state (React, query cache, Supabase singleton) anyway.
    void supabase.auth.signOut();
    window.location.href = "/";
  };

  useEffect(() => {
    const initAuth = async () => {
      if (initialUser) {
        setIsLoading(false);
        return;
      }

      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (currentUser) {
        setUser(currentUser);
        const userProfile = await fetchProfile(currentUser.id);
        setProfile(userProfile);
      }

      setIsLoading(false);
    };

    initAuth();

    // IMPORTANT: Do NOT call fetchProfile() or any Supabase data query inside
    // this callback. It can fire while the GoTrueClient's internal lock is held
    // (e.g., during _recoverAndRefresh on tab focus). A data query would call
    // getSession() → _acquireLock() → deadlock. Only synchronous React state
    // updates are safe here. See docs/supabase-auth-lock-fix.md.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        setUser(session.user);
      } else if (event === "SIGNED_OUT") {
        setUser(null);
        setProfile(null);
        queryClient.removeQueries();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchProfile is not memoized so including it would re-run this effect on every render and re-subscribe to auth state; queryClient is stable from React Query and also intentionally excluded
  }, [initialUser, supabase]);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isLoading,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

/**
 * Like useAuth(), but asserts that user and profile are non-null.
 * Use in dashboard components where routing guarantees authentication.
 */
export function useRequiredAuth() {
  const { user, profile, ...rest } = useAuth();
  if (!user || !profile) {
    throw new Error("useRequiredAuth must be used in an authenticated context");
  }
  return { user, profile, ...rest };
}
