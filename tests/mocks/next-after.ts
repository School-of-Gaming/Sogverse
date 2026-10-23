/**
 * `next/server` with `after()` running its work at once, for suites asserting
 * what deferred work does: outside a request the real `after()` throws, and
 * inside one the work runs only once the response has gone.
 *
 * The work starts synchronously at the `after()` call; `settleAfter()` waits
 * for every piece started so far, for assertions on what it does once its own
 * awaits resolve (a log line after a failed fetch).
 *
 *   vi.mock("next/server", async (importOriginal) =>
 *     (await import("../mocks/next-after")).nextServerWithImmediateAfter(importOriginal));
 */

type Work = Promise<unknown> | (() => unknown);

const started: Promise<unknown>[] = [];

export async function nextServerWithImmediateAfter(importOriginal: <T>() => Promise<T>) {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (work: Work) => {
      started.push(Promise.resolve(typeof work === "function" ? work() : work));
    },
  };
}

/** Wait for every piece of `after()` work started so far. */
export async function settleAfter(): Promise<void> {
  await Promise.all(started.splice(0));
}
