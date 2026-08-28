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

## The Fix

The root cause was a single line: `fetchProfile()` was called inside the `onAuthStateChange` callback. Removing it broke the deadlock chain.

### What changed

1. **`src/providers/auth-provider.tsx`** — Removed `fetchProfile()` from `onAuthStateChange` callback. The callback now only does synchronous React state updates (`setUser`, `setProfile(null)`, `queryClient.removeQueries()`).

2. **`src/components/auth/login-form.tsx`** — Changed `router.push()` to `window.location.href` after sign-in. Full page navigation forces the root layout to re-run server-side, hydrating `initialUser`/`initialProfile` correctly. Without this, `profile` stayed null after login because React's `useState(initialProfile)` ignores new props after mount.

3. **`src/services/products/products.service.ts`** + **`src/app/api/admin/create-product/route.ts`** — Product creation moved to a server-side API route (unrelated to the deadlock, but done during the same investigation).

### The rule

**Never make Supabase data queries inside `onAuthStateChange` callbacks.** Only synchronous React state updates are safe. This applies to any Supabase SSR app — the GoTrueClient's internal lock serializes auth operations, and `onAuthStateChange` can fire while the lock is held.
