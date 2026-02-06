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
    // Navigate immediately — don't update React state first or the user
    // sees a broken layout flash. The full page navigation to the API route
    // clears cookies server-side, then redirects. All client state (React,
    // query cache, Supabase singleton) is wiped by the page reload.
    window.location.href = "/api/auth/signout";
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
    // this callback. The callback can fire from within _recoverAndRefresh()
    // which holds the GoTrueClient's internal lock. A data query would call
    // getSession() → _acquireLock() → wait for the lock → but the lock is
    // held by _recoverAndRefresh() which is waiting for THIS callback to
    // finish = deadlock. All subsequent data queries queue behind the
    // deadlocked lock and the entire app freezes.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        // Only update the user object from the session — profile is already
        // set from server props (initialProfile) or from initAuth above.
        setUser(session.user);
      } else if (event === "SIGNED_OUT") {
        setUser(null);
        setProfile(null);
        queryClient.removeQueries();
      }
    });

    // Remove the GoTrueClient's visibilitychange listener. It calls
    // _recoverAndRefresh() on tab focus, which fires SIGNED_IN inside
    // the lock (triggering the deadlock described above). The proxy
    // handles session refresh server-side, so this listener is unnecessary.
    // Must run after initializePromise resolves — calling stopAutoRefresh()
    // before init completes is a no-op because init re-registers the listener.
    supabase.auth.initialize().then(() => {
      supabase.auth.stopAutoRefresh();
    });

    return () => {
      subscription.unsubscribe();
    };
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
