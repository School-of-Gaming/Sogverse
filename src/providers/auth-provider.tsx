"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
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
  refreshProfile: () => Promise<void>;
  /**
   * Stops AuthProvider from reacting to further auth-state events until the
   * document unloads. Call this right before kicking off a full-page
   * navigation after sign-in/sign-up so the current page's chrome (Header,
   * etc.) doesn't briefly re-render as "signed in" before the new document
   * paints. The flag is reset implicitly: the next page load mounts a fresh
   * AuthProvider with `initialUser` hydrated from the server.
   */
  freezeUntilNavigation: () => void;
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
  // Ref (not state) so the `onAuthStateChange` closure below reads the latest
  // value on every fire — a state value would be captured at mount.
  const frozenRef = useRef(false);

  const supabase = getClient();
  const queryClient = useQueryClient();

  const freezeUntilNavigation = useCallback(() => {
    frozenRef.current = true;
  }, []);

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
      // Once a sign-in/up flow has committed to a full-page navigation,
      // ignore further auth events so the outgoing page's chrome doesn't
      // flash the post-sign-in state before the new document paints. See
      // `freezeUntilNavigation` above.
      if (frozenRef.current) return;
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
        refreshProfile,
        freezeUntilNavigation,
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
