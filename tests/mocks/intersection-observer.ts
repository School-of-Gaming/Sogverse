import { vi } from "vitest";

/**
 * A drivable `IntersectionObserver` for jsdom, which ships none at all.
 *
 * jsdom implements no layout, so a real implementation would have nothing to
 * report and an inert stub tells a test nothing it can assert. This one records
 * what was observed and lets the test *deliver* a report itself — which is the
 * only way to exercise a sentinel, since intersection is the one thing jsdom can
 * never work out on its own.
 *
 * Every constructed observer is kept, oldest first, because rearming is what a
 * sentinel's behaviour is made of: a test asserts on the observer a re-enable
 * built, not merely on the first one.
 */
export class FakeIntersectionObserver {
  /** Every observer constructed since the last install, oldest first. */
  static instances: FakeIntersectionObserver[] = [];

  /** The elements currently observed, in the order they were observed. */
  readonly targets: Element[] = [];
  /** How many times `observe()` was called — re-arming shows up here. */
  observeCalls = 0;
  /** How many times `disconnect()` was called. */
  disconnectCalls = 0;

  private readonly callback: IntersectionObserverCallback;

  constructor(
    callback: IntersectionObserverCallback,
    readonly options: IntersectionObserverInit = {},
  ) {
    this.callback = callback;
    FakeIntersectionObserver.instances.push(this);
  }

  get root(): Element | Document | null {
    return this.options.root ?? null;
  }

  get rootMargin(): string {
    return this.options.rootMargin ?? "0px";
  }

  get thresholds(): readonly number[] {
    return [0];
  }

  observe(target: Element): void {
    this.observeCalls += 1;
    // A real observer ignores an already-observed target, which is why a
    // re-arm has to release it first. Mirrored here so a hook that forgets the
    // release fails against this stub rather than only in a browser.
    if (!this.targets.includes(target)) this.targets.push(target);
  }

  unobserve(target: Element): void {
    const at = this.targets.indexOf(target);
    if (at >= 0) this.targets.splice(at, 1);
  }

  disconnect(): void {
    this.disconnectCalls += 1;
    this.targets.length = 0;
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  /** Report every observed target as intersecting (or not), as a browser would. */
  deliver(isIntersecting = true): void {
    if (this.targets.length === 0) return;
    const records = this.targets.map((target) => entryFor(target, isIntersecting));
    this.callback(records, this);
  }
}

/** One report about one element. jsdom measures nothing, so the boxes are its zeroes. */
function entryFor(target: Element, isIntersecting: boolean): IntersectionObserverEntry {
  const rect = target.getBoundingClientRect();
  return {
    boundingClientRect: rect,
    intersectionRatio: isIntersecting ? 1 : 0,
    intersectionRect: rect,
    isIntersecting,
    rootBounds: null,
    target,
    time: 0,
  };
}

/**
 * Install the stub as the global `IntersectionObserver` and forget any observer
 * an earlier test built. Pair it with `vi.unstubAllGlobals()` in teardown.
 */
export function installFakeIntersectionObserver(): void {
  FakeIntersectionObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
}

/** The most recently constructed observer, or `undefined` if there is none. */
export function latestIntersectionObserver(): FakeIntersectionObserver | undefined {
  return FakeIntersectionObserver.instances.at(-1);
}
