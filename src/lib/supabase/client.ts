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
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        fetch: fetchWithTimeout,
      },
      auth: {
        // The proxy refreshes auth tokens server-side on every navigation.
        // Disable auto-refresh to prevent the browser client from competing
        // with the proxy for token rotation. This MUST be set as a constructor
        // option — calling stopAutoRefresh() after creation is a no-op because
        // it runs before the async initialization completes.
        autoRefreshToken: false,
        // Bypass Navigator.locks API which can get stuck during token refresh,
        // causing all Supabase requests to hang until a full page reload.
        // Safe for single-tab usage; the proxy handles session refresh server-side.
        lock: async <R>(
          _name: string,
          _acquireTimeout: number,
          fn: () => Promise<R>
        ): Promise<R> => {
          return await fn();
        },
      },
    }
  );
}

// Singleton instance for client-side usage
let browserClient: ReturnType<typeof createClient> | null = null;

export function getClient() {
  if (!browserClient) {
    browserClient = createClient();
  }
  return browserClient;
}
