# Supabase Auth Lock Fix (Feb 2026)

## The Bug

After leaving the browser tab for even a few minutes and returning, **all data-loading pages get stuck in a permanent loading state**. The UI still shows the user as signed in, but no data ever loads. A hard browser refresh (Ctrl+Shift+R) immediately fixes it.

Affected pages: Products, Users, and any page that makes Supabase data queries via React Query.

### Steps to Reproduce

1. Login
2. Go to Products and see that they load
3. Click Home
4. Shift+Ctrl+R to hard refresh while on Home
5. Leave the tab and do something else for about 5 minutes
6. Come back to the tab and navigate to Products
7. **BUG**: Products fail to load but the UI still shows the user as signed in

Key observations:
- It **never** breaks immediately after a page reload — only after switching away from the tab and coming back
- The network tab shows **no Supabase requests** — requests are queued in JavaScript and never reach the network
- The user is **not** signed out — the UI correctly shows them as authenticated
- A full page reload always fixes it immediately

## Debugging History

### First Theory: `stopAutoRefresh()` Is a No-Op (Wrong Fix)

**Theory**: The browser Supabase client was calling `stopAutoRefresh()` synchronously after `createBrowserClient()`, but GoTrueClient's `initialize()` is async. The init method re-registers the `visibilitychange` listener and starts auto-refresh *after* `stopAutoRefresh()` runs, making it a no-op. On tab return, `_recoverAndRefresh()` would fire, race with the proxy for token rotation, and potentially clear the session.

**Fix attempted**: Changed `client.ts` to use `autoRefreshToken: false` as a constructor option instead of calling `stopAutoRefresh()` after creation.

**Result**: Did not fix the bug. The user confirmed it still reproduced exactly the same way. However, `autoRefreshToken: false` *is* correct and was kept — `stopAutoRefresh()` genuinely is a no-op when called before init completes.

**Why this theory was wrong**: The bug has nothing to do with token expiry or session clearing. The user is NOT signed out — `SIGNED_OUT` never fires. The issue is that all data queries are blocked from executing at all.

### Second Theory: Lock Deadlock from `onAuthStateChange` (Correct)

**Theory**: The `onAuthStateChange` callback in `auth-provider.tsx` was calling `fetchProfile()` (a Supabase data query) when it received a `SIGNED_IN` event. But `SIGNED_IN` can fire from inside `_recoverAndRefresh()`, which holds the GoTrueClient's internal lock. The data query tries to acquire the same lock, creating a deadlock that blocks all subsequent Supabase requests.

**Fix**: Removed `fetchProfile()` from the callback + added post-init `stopAutoRefresh()` to remove the visibility change listener.

**Result**: Fixes the bug.

## Root Cause: The Lock Deadlock

### The Deadlock Chain

```
visibilitychange (tab gains focus)
  → _onVisibilityChanged(false)
    → _acquireLock("lock")           // acquires the GoTrueClient internal lock
      → _recoverAndRefresh()
        → _notifyAllSubscribers('SIGNED_IN')    // fires WHILE holding lock
          → auth-provider's onAuthStateChange callback
            → fetchProfile(userId)
              → supabase.from("profiles").select("*")
                → _getAccessToken()              // every data query calls this
                  → getSession()
                    → await initializePromise    // resolves immediately (init done)
                    → _acquireLock("lock")       // TRIES TO ACQUIRE THE SAME LOCK
                      → lockAcquired is true     // lock is held by _recoverAndRefresh
                      → chains onto pendingInLock
                      → WAITS for _recoverAndRefresh to release lock
                        → _recoverAndRefresh waits for subscriber callback
                          → subscriber waits for fetchProfile()
                            → fetchProfile waits for _acquireLock
                              → CIRCULAR WAIT = DEADLOCK
```

Every subsequent Supabase data query also calls `_getAccessToken()` → `getSession()` → `_acquireLock()`, so they all queue behind the deadlocked lock. The entire app's data layer freezes.

### Why It Works on Initial Page Load

React's `useEffect` runs after paint (macrotask). The GoTrueClient's `initialize()` runs as microtasks and completes before the `useEffect` runs. So `_recoverAndRefresh()` fires `SIGNED_IN` *before* the `onAuthStateChange` listener is registered. No listener = no `fetchProfile()` = no deadlock.

Timeline on page load:
```
1. createBrowserClient() → GoTrueClient constructor → schedules initialize()
2. React renders AuthProvider → schedules useEffect
3. initialize() runs (microtask) → _recoverAndRefresh() → SIGNED_IN fires
   → No listener registered yet → nothing happens → lock released
4. useEffect runs (macrotask) → registers onAuthStateChange listener
   → initAuth() fetches profile directly (not inside callback) → works fine
```

### Why It Breaks on Tab Return

By the time the user switches tabs and comes back, the `useEffect` has long since run and the `onAuthStateChange` listener is registered. The `visibilitychange` event fires `_recoverAndRefresh()` which fires `SIGNED_IN` inside the lock, and this time the listener IS there to catch it and call `fetchProfile()` → deadlock.

Timeline on tab return:
```
1. User switches back to tab → visibilitychange fires
2. GoTrueClient's _handleVisibilityChange() calls _onVisibilityChanged()
3. _onVisibilityChanged() → _acquireLock() → _recoverAndRefresh()
4. _recoverAndRefresh() checks session → session is valid (NOT expired)
5. Fires SIGNED_IN with session → subscriber callback runs
6. Callback calls fetchProfile() → supabase data query → getSession() → _acquireLock()
7. Lock is held → DEADLOCK
```

### Why the No-Op Lock Doesn't Prevent This

The `client.ts` has a no-op lock that bypasses `Navigator.locks`:
```typescript
lock: async (_name, _acquireTimeout, fn) => {
  return await fn();
}
```

This prevents the *browser-level* `Navigator.locks` API from blocking, but the GoTrueClient has its **own internal lock mechanism** (`lockAcquired`, `pendingInLock`) that operates independently. The no-op lock config only replaces the outer lock — the inner JavaScript-level lock serialization still operates and still deadlocks.

Looking at the GoTrueClient source:
```javascript
async _acquireLock(acquireTimeout, fn) {
  // ... calls this.lock() (our no-op) but ALSO manages internal state:
  if (this.lockAcquired) {
    // Another operation holds the lock — queue this one
    return this.pendingInLock.push(/* ... */);
  }
  this.lockAcquired = true;
  // ... run fn() ... then process pendingInLock queue
}
```

The no-op replaces `navigator.locks.request()` but the `lockAcquired` / `pendingInLock` logic is in `_acquireLock()` itself, above the `lock()` call. So re-entrant calls still queue.

## What We Changed

### 1. `src/lib/supabase/client.ts` — `autoRefreshToken: false` + no-op lock + timeout

```typescript
auth: {
  autoRefreshToken: false,
  lock: async (_name, _acquireTimeout, fn) => {
    return await fn();
  },
}
```

- **`autoRefreshToken: false`**: Constructor option that prevents the GoTrueClient from ever starting auto-refresh or registering the `visibilitychange` listener during initialization. This MUST be a constructor option — calling `stopAutoRefresh()` after creation is a no-op because `initialize()` is async and completes after `stopAutoRefresh()` runs, re-registering the listener. Data queries still refresh expired tokens on-demand via `__loadSession()` → `_callRefreshToken()`, which is NOT gated by `autoRefreshToken`.
- **No-op lock**: Bypasses `Navigator.locks` so browser-level locks can't block. Partially mitigates the deadlock (but doesn't fully prevent the internal JS-level lock issue — see above).
- **`fetchWithTimeout` (15s)**: Safety net so no request hangs forever.

### 2. `src/providers/auth-provider.tsx` — Remove data queries from callback + post-init stopAutoRefresh

Two critical changes:

**a) Removed `fetchProfile()` from `onAuthStateChange` callback:**

The `SIGNED_IN` event fires from `_recoverAndRefresh()` which holds the GoTrueClient's internal lock. If the callback makes a Supabase data query (like `fetchProfile()`), that query calls `getSession()` → `_acquireLock()` → waits for the lock → but the lock is held by `_recoverAndRefresh()` which is waiting for the callback → **deadlock**. The callback now only does synchronous React state updates:

```typescript
supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_IN" && session?.user) {
    // Only update the user object — NO data queries here
    setUser(session.user);
  } else if (event === "SIGNED_OUT") {
    setUser(null);
    setProfile(null);
    queryClient.removeQueries();
  }
});
```

**b) Remove visibilitychange listener after init:**

```typescript
supabase.auth.initialize().then(() => {
  supabase.auth.stopAutoRefresh();
});
```

This removes the GoTrueClient's `visibilitychange` listener after initialization completes, preventing `_recoverAndRefresh()` from ever running on tab focus. This eliminates the trigger for the deadlock entirely.

This must run *after* `initializePromise` resolves. Calling `stopAutoRefresh()` before init completes is a no-op because init re-registers the listener. The `autoRefreshToken: false` constructor option prevents auto-refresh from *starting* during init, but the `visibilitychange` handler is registered regardless — it needs to be removed explicitly via `stopAutoRefresh()` after init.

### 3. `src/providers/query-provider.tsx` — `refetchOnWindowFocus: false`

React Query's `refetchOnWindowFocus` is disabled to prevent bulk refetches on tab focus. Without this, returning to the tab would trigger all active queries to refetch simultaneously, increasing the chance of hitting the lock contention.

### 4. `src/components/layout/header.tsx` — Remove competing navigation

Removed `router.push("/")` after `signOut()`. The auth provider owns the redirect (navigates to `/api/auth/signout`).

### 5. `src/app/api/auth/signout/route.ts` — Server-side sign-out

Signs out via the server Supabase client (clears cookies) and redirects to `/`. The browser client is never involved in auth operations, avoiding the lock queue entirely.

### 6. `src/services/products/products.service.ts` + `src/app/api/admin/create-product/route.ts`

Moved product creation to a server-side API route. Writes through the browser client were the most visible symptom of the lock issue because mutations don't retry.

## Defense in Depth

The fix has three layers:

1. **`autoRefreshToken: false`** — Prevents auto-refresh from starting, so `_recoverAndRefresh` is never called by the auto-refresh timer
2. **Post-init `stopAutoRefresh()`** — Removes the `visibilitychange` listener so `_recoverAndRefresh` is never called on tab focus
3. **No data queries in `onAuthStateChange`** — Even if `_recoverAndRefresh` somehow fires, the callback can't deadlock because it doesn't acquire the lock

Layer 3 is the most important — it breaks the deadlock chain regardless of how `SIGNED_IN` is triggered.

### 7. `src/components/auth/login-form.tsx` + `src/components/auth/gamer-login-form.tsx` — Full page nav after sign-in

Changed `router.push()` + `router.refresh()` to `window.location.href`. After removing `fetchProfile()` from `onAuthStateChange`, client-side navigation after sign-in left `profile` as null because:

1. Root layout doesn't re-run on client-side navigation
2. React's `useState(initialProfile)` ignores new props after the first render
3. `onAuthStateChange` only sets `user`, not `profile`

The sidebar (`if (!profile?.role) return null`) was invisible until a hard refresh. Full page navigation forces the root layout to re-run server-side, hydrating `initialProfile` correctly.

**Note:** The login forms still use the browser Supabase client for `signInWithPassword()`. Moving sign-in to a server-side API route (like sign-out) is tracked in `TODO.md` as a future improvement.

## What Might Be Revisitable

1. **Is the no-op lock safe long-term?** Safe for single-tab usage. The lock exists to prevent concurrent token refreshes across tabs. Since auto-refresh is disabled and the proxy handles session refresh, there's nothing to serialize.

2. **Should read queries also go through API routes?** Currently `getAllProducts`, `getProduct`, etc. still use the browser Supabase client. The deadlock fix should prevent hangs, but if issues resurface, moving reads server-side is the next step.

3. **Will a Supabase client update fix this?** The `Navigator.locks` behavior is intentional in `@supabase/auth-js`. The Supabase team is aware of SSR token rotation conflicts. A future version may handle this more gracefully, at which point these workarounds could be removed.

4. **`@supabase/ssr` singleton cache**: `createBrowserClient` caches at the module level. Our config options are applied at creation time, so they work. But HMR during development won't reset this singleton — changes to client config require a hard refresh (Ctrl+Shift+R) to take effect.
