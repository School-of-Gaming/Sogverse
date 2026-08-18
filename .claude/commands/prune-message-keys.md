---
name: prune-message-keys
description: Find and delete message keys nothing can reach, verifying every deletion with the compiler.
---

Find orphaned keys in `messages/*.json` and delete them. Run this occasionally — it is
hygiene, not a gate. There is deliberately no CI check: the mechanics are easy and the
judgement is not, so this is a reasoning job with the compiler as its proof.

**The one rule that matters: never delete a key that is reachable.** Deleting live copy
breaks a page for real users. Leaving a dead key behind costs a translator a few minutes.
Those are not comparable, so when you cannot tell, keep the key and say so. Finding
two-thirds of them and being certain beats finding all of them and being wrong once.

## Why the compiler is your proof

`src/i18n/types.ts` registers the catalog (`typeof en.json`) as next-intl's
`AppConfig["Messages"]`, so a translator's key parameter is typed as the union of its
namespace's keys. **Deleting a key that is used is therefore a build error**, and that has
been verified by execution for all of:

- literal keys — `t("welcomeParent.subject")`
- keys composed at the call site — `` t(`startModes.${option}`) `` errors and even suggests
  the nearest surviving member
- keys read as plain properties off a catalog object — `messages.metadata.pages.about`
- keys referenced only from `tests/` (tsconfig includes them)

So you do not have to *reason* about whether a candidate is used. You delete it and ask.

**The one exception, verified twice against the real `npx tsc`: `t.raw()` keys are NOT
checked.** Deleting a key reached only through `` t.raw(`sections.${key}.paragraphs`) ``
compiles clean. Every `.raw(` call site today is a legal page — `privacy`, `terms`,
`discipline`, `robloxPrivacy`, `robloxSafeguarding`, `robloxTerms`, and `roblox.hero.title`.
**Treat those namespaces as untouchable**: the compiler will not catch you, and the failure
lands at runtime on a policy page. If you believe a key there is dead, prove it by reading
the page component, and say in your report that the compiler did not back you up.

## Where the orphans actually are

A key is reachable only through a translator scoped to it or to one of its ancestors —
`useTranslations("x")`, `getTranslations("x")`, `createTranslator({ namespace })`. So:

**Start with namespaces nothing ever scopes.** Every key under one is unreachable, whatever
happens elsewhere, because composed keys, `t.raw()` and translators passed to helpers all
operate *inside* a scope they were handed. On the 2026-08-18 sweep this was 86 of 149 — and
all of it was whole namespaces left behind by feature deletions (`admin.forms`,
`admin.groups`, `admin.productLocation`, `checkout`). **If you find a big cluster, look for
a recent feature removal that swept its code and not its copy.**

Two shapes bypass scopes and are reachable anyway: the root translator
(`useTranslations()` with no argument, in `ZoneList.tsx`, called with full dotted paths),
and a catalog object read directly (the Klingon fallback merge in `src/i18n/messages.ts`
spreads `english.metadata.pages`).

Then, for scattered keys inside live namespaces, propose candidates however you like — but
read the traps below first, because a plain text search gets these wrong in both directions.

## Traps

Every one of these has misled a real sweep. The first five make a live key look dead, which
the compiler will catch for you. The last one is the opposite and nothing will catch it:

- **Composed keys appear nowhere in the source text.** `` t(`weekdays.${day}Long`) `` means
  `monLong`…`sunLong` exist only as a union the compiler expands. A grep reports all seven
  as unused. Same for `hints.*Hint`, `startModes.*Description`, `seatLimitModes.*`.
- **A translator handed to another function.** `renderPendingHint(…, t)` — the receiver's
  parameter names its own key union, so the keys are used with no `t("…")` call in sight.
  This is what wrongly condemned `admin.products.list.pendingHint.*`.
- **`t.raw()` reading a whole subtree**, where every key beneath the path is consumed at once.
- **A namespace assembled at runtime** — `` useTranslations(`voice.instant.${reason}`) ``.
- **A `useMemo`/`useCallback` dependency array mentioning `t`** is *not* a use — but it also
  is not evidence of anything. Don't read either way into it.
- **A short or generic key name will match something unrelated and look alive.** `title`,
  `loading`, `live`, `age`, `join`, `duration`, `settings`, `cta` — in a codebase this size
  every one of those appears as a different namespace's key, a query cache key, or a local
  variable. Note which way this cuts: unlike the traps above it makes a dead key look
  *reachable*, so it never reaches the compiler for judgement and you simply never find it.
  When a namespace has only one or two call sites, **open them and read which keys they
  use** — that is faster and more certain than any search, and it is how the last sweep
  found 18 orphans its own grep had cleared.

## The procedure

0. **Check what is already uncommitted.** `git status` and `git diff --stat messages/`
   first. A catalog with uncommitted changes is not ground truth: someone may be part-way
   through restoring copy, or through a prune of their own, and keys that look dead right
   now may be dead only because their consumer is not written yet. If the catalogs are
   dirty and you did not dirty them, find out why before deleting anything — quietly
   discarding a colleague's in-flight work is the most plausible way to do real damage
   here, and the compiler will not object, because it agrees the key is unreferenced.
1. **Propose candidates.** Cheapest high-value pass: list every namespace scoped anywhere
   (grep the three scope functions for their literal arguments), then find catalog
   namespaces absent from that list. Add any other suspicions you have.
   For scattered keys inside namespaces that *are* scoped, check every direct child and
   every once-nested child at minimum — one level is not enough, and a real orphan cluster
   was found two levels down (`productDetail.geduGroups.*`).
2. **Delete the whole candidate set** from all five catalogs, and **write each file once**
   — settle the set first, then apply it from a pristine copy. Deleting and restoring
   incrementally lands each restored key at the end of its parent object instead of where
   it was, which turns a clean diff into an unreviewable one. Edit with a throwaway script,
   never by hand: every `messages/*.json` round-trips byte-identically through
   `JSON.stringify(parsed, null, 2) + "\n"`, so a script cannot reflow the file, and a hand
   edit will. Prune emptied parent objects. `tlh` legitimately lacks some keys — tolerate a
   miss there rather than erroring.
3. **Run `npx tsc --noEmit`.** Every key it names is live: restore it and repeat from step 3.
   Errors name the key *relative* to its namespace, so match by dotted suffix.
   - If you hit `Argument of type 'string' is not assignable to parameter of type 'never'`,
     you have emptied a namespace that still has call sites, so it can no longer name its
     own keys. Restore that namespace and work through it by hand.
   - Resist "restore the whole sibling group to converge faster" — measured, that spares
     86% of the real orphans.
4. **Loop until `tsc` is clean.** What is still deleted is proven unreachable.
5. **Gates, all of them:** `npx tsc --noEmit`, `npm run lint`, `npm run check-translations`,
   `npm run test`. Note that `check-translations` only *warns* about stale keys in the
   non-English catalogs — so confirm yourself that all five files lost the same keys.
6. **Commit** on a branch off `dev`, and report: what was deleted grouped by namespace, what
   you left behind and why (the `t.raw()` namespaces, anything ambiguous), and any cluster
   that points at an earlier incomplete removal.

## Two things not to do

- **Do not run `npm run dev`** — it is already running and being watched.
- **Do not add a CI check for this.** It was tried on 2026-08-18 and deliberately dropped:
  the fast version could only ever prove the whole-namespace subset, and the thorough
  version needed a pile of special cases modelling next-intl's type internals, which is
  exactly the kind of thing that rots into false positives. The compiler already guards the
  direction that can break production (a key used but missing). This direction is a
  cleanup, and it is fine for it to be occasional and deliberate.

## History

- **2026-08-18** — 149 keys removed (2100 → 1951). Sources: the v1 product teardown (`c313039c`, which
  deleted the group-change email builders and pages but not their copy) and the Sorg token
  drop (`073e42db`, the enrollment mails). The last 10 of those were found only on a
  cold-read run of this command, by reading call sites where a search had said the key was
  alive — which is why the generic-name trap above is written down.
