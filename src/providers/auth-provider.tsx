"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { User } from "@supabase/supabase-js";
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
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        setUser(session.user);
        const userProfile = await fetchProfile(session.user.id);
        setProfile(userProfile);
      } else if (event === "SIGNED_OUT") {
        setUser(null);
        setProfile(null);
      }
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
