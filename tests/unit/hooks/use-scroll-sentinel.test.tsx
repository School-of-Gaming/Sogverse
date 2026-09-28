import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import type { RefObject } from "react";
import { useScrollSentinel, type ScrollSentinelRoot } from "@/hooks/use-scroll-sentinel";
import {
  FakeIntersectionObserver,
  installFakeIntersectionObserver,
  latestIntersectionObserver,
} from "../../mocks/intersection-observer";

/**
 * The shared sentinel: a hairline below a list, and a call when the reader
 * reaches it.
 *
 * jsdom works out no intersection of its own, so the stub reports on the test's
 * behalf (`tests/mocks/intersection-observer.ts`) and what is asserted here is
 * the hook's bookkeeping around those reports — which is where every way of
 * getting a sentinel wrong lives: firing while disarmed, firing once and never
 * again, or leaving an observer behind after unmount.
 */

interface ProbeProps {
  enabled: boolean;
  onReach: () => void;
  root?: ScrollSentinelRoot;
}

function Probe({ enabled, onReach, root }: ProbeProps) {
  const sentinelRef = useScrollSentinel({
    enabled,
    onReach,
    rootMargin: "800px 0px",
    root,
  });
  return <div data-testid="sentinel" ref={sentinelRef} />;
}

/** Report the observed sentinel as in view, as a browser would. */
function reach(isIntersecting = true) {
  act(() => {
    latestIntersectionObserver()?.deliver(isIntersecting);
  });
}

beforeEach(() => {
  installFakeIntersectionObserver();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useScrollSentinel", () => {
  it("calls onReach when the sentinel is reported in view", () => {
    const onReach = vi.fn();
    const { getByTestId } = render(<Probe enabled onReach={onReach} />);

    const observer = latestIntersectionObserver();
    expect(observer?.targets).toEqual([getByTestId("sentinel")]);
    expect(observer?.rootMargin).toBe("800px 0px");

    reach();

    expect(onReach).toHaveBeenCalledTimes(1);
  });

  it("stays quiet on a report that the sentinel is not in view", () => {
    const onReach = vi.fn();
    render(<Probe enabled onReach={onReach} />);

    reach(false);

    expect(onReach).not.toHaveBeenCalled();
  });

  // The caller's lever for "stop asking": a surface with a page in flight holds
  // this false, and nothing is observed at all while it is.
  it("observes nothing while disabled", () => {
    const onReach = vi.fn();
    render(<Probe enabled={false} onReach={onReach} />);

    expect(FakeIntersectionObserver.instances).toHaveLength(0);
    expect(onReach).not.toHaveBeenCalled();
  });

  // An observer reports a *change* of intersection, so a sentinel still on
  // screen after the reveal it triggered would never fire again — and a run of
  // reveals would stop after one. Releasing and re-observing the target is what
  // asks the question again.
  it("re-arms after a reveal, so a sentinel still in view fires again", () => {
    const onReach = vi.fn();
    render(<Probe enabled onReach={onReach} />);

    reach();
    reach();

    expect(onReach).toHaveBeenCalledTimes(2);
    // The initial arm, plus one re-arm per reveal — and all of it on the one
    // observer, which is what says the re-arm cost no rebuild.
    expect(latestIntersectionObserver()?.observeCalls).toBe(3);
    expect(FakeIntersectionObserver.instances).toHaveLength(1);
  });

  // The other half of the same requirement: a page too short to push the
  // sentinel off screen must reveal the one after it, and what the caller does
  // in that case is disarm for the fetch and arm again when it lands.
  it("re-checks intersection when it is re-enabled while still in view", () => {
    const onReach = vi.fn();
    const { rerender } = render(<Probe enabled onReach={onReach} />);
    const first = latestIntersectionObserver();

    rerender(<Probe enabled={false} onReach={onReach} />);
    expect(first?.disconnectCalls).toBe(1);

    rerender(<Probe enabled onReach={onReach} />);
    const second = latestIntersectionObserver();
    expect(second).not.toBe(first);

    reach();

    expect(onReach).toHaveBeenCalledTimes(1);
  });

  it("disconnects on unmount", () => {
    const { unmount } = render(<Probe enabled onReach={vi.fn()} />);
    const observer = latestIntersectionObserver();

    unmount();

    expect(observer?.disconnectCalls).toBe(1);
    expect(observer?.targets).toEqual([]);
  });

  // A picker's list scrolls inside a sheet body rather than with the page, so
  // "in view" has to be asked of the container.
  it("watches a scroll container when given one, as an element or as a ref", () => {
    const container = document.createElement("div");
    document.body.append(container);

    render(<Probe enabled onReach={vi.fn()} root={container} />);
    expect(latestIntersectionObserver()?.root).toBe(container);

    cleanup();

    const containerRef: RefObject<Element | null> = { current: container };
    render(<Probe enabled onReach={vi.fn()} root={containerRef} />);
    expect(latestIntersectionObserver()?.root).toBe(container);
  });

  it("defaults to the viewport when no container is named", () => {
    render(<Probe enabled onReach={vi.fn()} />);

    expect(latestIntersectionObserver()?.root).toBeNull();
  });

  // A caller passes an inline arrow — every render is a new function, and
  // rebuilding the observer for each of them would drop the armed state the
  // sentinel's whole behaviour depends on.
  it("picks up a fresh onReach without rebuilding the observer", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Probe enabled onReach={first} />);

    rerender(<Probe enabled onReach={second} />);
    expect(FakeIntersectionObserver.instances).toHaveLength(1);

    reach();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
