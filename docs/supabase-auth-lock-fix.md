# Supabase Auth Lock Fix (Feb 2026)

## The Bug

Three related symptoms, all intermittent:

1. **Product creation hangs** on "Creating..." indefinitely
2. **Pages stuck loading** during SPA navigation (dashboard -> Products), but load instantly after a full page reload
3. **Broken sign-out state** — header shows signed out, but dashboard content still visible without sidebar

The key observation: **it never hangs immediately after a page reload**, only during SPA navigation. And when stuck, the network tab shows no Supabase requests — the requests were queued in JavaScript and never reached the network.

## Root Cause

The Supabase browser client (`@supabase/auth-js` GoTrueClient) uses an internal lock queue (`Navigator.locks` API) to serialize auth operations like token refresh. When a token refresh gets stuck or times out inside this lock, **every subsequent Supabase request queues behind it and never executes**. A full page reload clears the JS state and the lock, which is why refreshing always fixed it.

## Why This App Specifically?

Most Supabase apps don't hit this because they rely solely on the browser client for session management. This app has a **dual refresh architecture**:

- **`proxy.ts`** (server-side, runs on every navigation) refreshes the auth token via `supabase.auth.getUser()` and writes updated cookies
- **Browser client** (`@supabase/ssr` `createBrowserClient`) runs `autoRefreshToken` by default, which fires `_autoRefreshTokenTick` every ~30 seconds

Both independently try to refresh the same token. Supabase uses **refresh token rotation** — each refresh token is single-use. When the proxy and browser client race to refresh the same token, one wins and the other gets an invalid/already-used token. The loser's refresh call can fail or hang inside the lock queue, poisoning all subsequent requests.

This is a known tension in Next.js + Supabase SSR setups where the server (middleware/proxy) and client both manage auth. Apps that don't do server-side session refresh, or that run on older Supabase client versions without `Navigator.locks`, don't hit this.

## What We Changed

### 1. `src/lib/supabase/client.ts` — Bypass lock + stop auto-refresh + add timeout

```typescript
auth: {
  lock: async (_name, _acquireTimeout, fn) => {
    return await fn();
  },
}
// ...
client.auth.stopAutoRefresh();
```

- **No-op lock**: Bypasses `Navigator.locks` so auth operations can't deadlock the request queue. Safe because we're single-tab and the proxy handles session refresh.
- **`stopAutoRefresh()`**: Prevents the browser client from refreshing tokens at all — the proxy already does this server-side on every navigation. Eliminates the race condition entirely.
- **`fetchWithTimeout` (15s)**: Safety net so no request hangs forever even if something unexpected happens.

### 2. `src/providers/auth-provider.tsx` — Server-side sign-out + remove aggressive cache invalidation

- **Server-side sign-out**: `signOut()` immediately navigates to `/api/auth/signout` — no React state updates, no browser Supabase client calls. The API route calls `signOut()` server-side (clearing cookies in the response) and redirects to `/`. The full page navigation wipes all client state (React, query cache, Supabase singleton). This avoids two problems: (1) GoTrueClient's `signOut()` can fail silently if the session is stale (user was away from the tab), leaving cookies intact, and (2) updating React state before navigation causes a flash of broken UI (dashboard without sidebar).
- **Removed `queryClient.invalidateQueries()` from `SIGNED_IN` and `TOKEN_REFRESHED`**: The previous commit (`0489be3`) added these to fix stale cache, but unscoped invalidation triggers refetches on every token event, which compounds the lock queue problem.

### 3. `src/providers/query-provider.tsx` — Restore `refetchOnWindowFocus: false`

Commit `0489be3` removed this, causing React Query to refetch all queries on tab focus. Combined with the lock issue, this increased the chance of hitting the stuck state.

### 4. `src/components/layout/header.tsx` — Remove competing navigation

Removed `router.push("/")` after `signOut()`. The auth provider now owns the redirect (navigates to `/api/auth/signout`), so there's no race between Next.js client-side navigation and the server-side sign-out flow.

### 6. `src/app/api/auth/signout/route.ts` (new) — Server-side sign-out

Signs out via the server Supabase client (which clears cookies in the response) and redirects to `/`. Mirrors the existing `/api/auth/callback` pattern for sign-in. The browser client is never involved in auth operations.

### 5. `src/services/products/products.service.ts` + `src/app/api/admin/create-product/route.ts` (new)

Moved product creation from the browser Supabase client to a server-side API route. The API route:
- Authenticates via server client
- Checks admin role
- Inserts via admin client (bypasses RLS)

This follows the same pattern as the existing `/api/admin/create-gedu` route. Writes through the browser client were the most visible symptom because mutations don't retry.

## What Might Be Revisitable

1. **Is the no-op lock safe long-term?** It's safe for single-tab usage. If multi-tab support becomes important, this would need revisiting. The lock exists to prevent concurrent token refreshes across tabs — but since we disabled auto-refresh entirely, there's nothing to serialize.

2. **Is `stopAutoRefresh()` sufficient on its own?** Possibly. If `stopAutoRefresh()` fully prevents all background auth operations, the no-op lock and `fetchWithTimeout` may be unnecessary safety nets. Worth testing in isolation.

3. **Should read queries also go through API routes?** Currently `getAllProducts`, `getProduct`, etc. still use the browser Supabase client. They haven't been reported as failing, but they could theoretically be affected by the same lock issue. The no-op lock + stopAutoRefresh should prevent this, but if hangs resurface, moving reads server-side is the next step.

4. **Will a Supabase client update fix this?** The `Navigator.locks` behavior is intentional in `@supabase/auth-js`. The Supabase team is aware of SSR token rotation conflicts. A future version may handle this more gracefully, at which point these workarounds could be removed.

5. **`@supabase/ssr` singleton cache**: `createBrowserClient` caches at the module level (`cachedBrowserClient`). Our options (like `stopAutoRefresh()`) are applied after creation, so they work. But be aware that HMR during development won't reset this singleton — changes to client config require a hard refresh (Ctrl+Shift+R) to take effect.
