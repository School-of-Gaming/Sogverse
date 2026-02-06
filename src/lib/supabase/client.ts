"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";

const FETCH_TIMEOUT_MS = 15_000;

/**
 * Wraps fetch with a timeout to prevent requests from hanging indefinitely
 * when the Supabase client's auth state gets stuck during token refresh.
 */
function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  // Respect any existing signal from the caller
  if (init?.signal) {
    init.signal.addEventListener("abort", () => controller.abort());
  }

  return fetch(input, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timeout)
  );
}

export function createClient() {
  const client = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        fetch: fetchWithTimeout,
      },
      auth: {
        // Bypass Navigator.locks API which can get stuck during token refresh,
        // causing all Supabase requests to hang until a full page reload.
        // Safe for single-tab usage; the proxy handles session refresh server-side.
        lock: async (
          _name: string,
          _acquireTimeout: number,
          fn: () => Promise<unknown>
        ) => {
          return await fn();
        },
      },
    }
  );

  // The proxy refreshes auth tokens server-side on every navigation.
  // Stop the browser client's auto-refresh to prevent token rotation conflicts
  // where both the proxy and client compete to refresh the same token.
  client.auth.stopAutoRefresh();

  return client;
}

// Singleton instance for client-side usage
let browserClient: ReturnType<typeof createClient> | null = null;

export function getClient() {
  if (!browserClient) {
    browserClient = createClient();
  }
  return browserClient;
}
