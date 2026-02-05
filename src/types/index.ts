export * from "./database.types";

import type { User } from "@supabase/supabase-js";
import type { Profile, UserRole } from "./database.types";

export interface AuthUser extends User {
  profile?: Profile;
}

export interface SessionUser {
  id: string;
  email: string | null;
  role: UserRole;
  profile: Profile;
}

export interface AuthState {
  user: AuthUser | null;
  profile: Profile | null;
  isLoading: boolean;
  error: Error | null;
}

export interface CreateGamerInput {
  username: string;
  password: string;
  displayName?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface GamerLoginCredentials {
  username: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  displayName?: string;
}

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
