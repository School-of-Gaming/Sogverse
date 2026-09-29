import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useLeaveGuard } from "@/hooks/use-leave-guard";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";

/**
 * The guard a page with unsaved work puts up against being left.
 *
 * jsdom keeps a real session history for one document: `pushState`, `back()`
 * and a `popstate` that arrives a task later all behave as a browser's do, so
 * the sentinel entry is exercised for real — pushed while the guard is active,
 * popped by Back without the address moving, pushed again on "stay", and taken
 * off when the guard stands down. What jsdom cannot show is the browser's own
 * Back button, which only ever does what `history.back()` does here, nor the
 * App Router's handling of the landing; a `popstate` listener registered
 * before the guard stands in for the router and records where it was sent.
 *
 * The app's `Link` is the setup's stub, a plain anchor, with a click handler
 * that navigates in code and cancels the browser's own navigation, as the real
 * one does.
 */

function Probe({ active, onNavigate }: { active: boolean; onNavigate: () => void }) {
  const guard = useLeaveGuard(active);
  return (
    <div>
      <Link
        href={ROUTES.admin.library}
        onClick={(event) => {
          event.preventDefault();
          onNavigate();
        }}
      >
        Back to the list
      </Link>
      <Link
        href={ROUTES.library}
        target="_blank"
        onClick={(event) => {
          event.preventDefault();
          onNavigate();
        }}
      >
        In a new tab
      </Link>
      {guard.asking && <p>asking</p>}
      <button type="button" onClick={guard.stay}>
        stay
      </button>
      <button type="button" onClick={guard.leave}>
        leave
      </button>
    </div>
  );
}

const LIST_PATH = "/admin/library";
const EDITOR_PATH = "/admin/library/bb744329-6849-4d79-be8e-da6b5bdec6fa";
/** The router's own fields on the editor's entry, which the sentinel must keep. */
const ROUTER_STATE = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: "editor" } };

const isSentinel = () => {
  const state: unknown = window.history.state;
  return (
    typeof state === "object" &&
    state !== null &&
    Object.keys(state).some((key) => key.includes("Sentinel"))
  );
};

/** Resolves on the next `popstate`, after every listener registered before it. */
function popped(): Promise<void> {
  return new Promise((resolve) => {
    window.addEventListener("popstate", () => resolve(), { once: true });
  });
}

/** Waits for a history step something else has already asked for. */
async function landing() {
  await act(() => popped());
}

/** Back, as the browser takes it. */
async function pressBack() {
  await act(async () => {
    const landed = popped();
    window.history.back();
    await landed;
  });
}

/** Whether the browser would ask before unloading the page. */
function unloadIsHeld(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

const asking = () => screen.queryByText("asking") !== null;

describe("useLeaveGuard", () => {
  const routedTo: string[] = [];
  const router = () => routedTo.push(window.location.pathname);

  beforeEach(() => {
    // The list, then the editor opened from it: Back has somewhere to go.
    window.history.replaceState(null, "", LIST_PATH);
    window.history.pushState(ROUTER_STATE, "", EDITOR_PATH);
    window.addEventListener("popstate", router);
  });

  afterEach(async () => {
    // An active guard unmounting steps off its sentinel; let that land before
    // the next test builds its history.
    const stepping = isSentinel();
    cleanup();
    if (stepping) await landing();
    window.removeEventListener("popstate", router);
    routedTo.length = 0;
  });

  it("lets everything through while there is nothing to lose", async () => {
    const navigate = vi.fn();
    const length = window.history.length;
    render(<Probe active={false} onNavigate={navigate} />);

    expect(window.history.length).toBe(length);
    expect(isSentinel()).toBe(false);

    fireEvent.click(screen.getByText("Back to the list"));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(unloadIsHeld()).toBe(false);

    await pressBack();
    expect(window.location.pathname).toBe(LIST_PATH);
    expect(routedTo).toEqual([LIST_PATH]);
    expect(asking()).toBe(false);
  });

  it("puts a sentinel for the same address on top, keeping the router's state", () => {
    const length = window.history.length;
    render(<Probe active onNavigate={() => {}} />);

    expect(window.history.length).toBe(length + 1);
    expect(window.location.pathname).toBe(EDITOR_PATH);
    expect(isSentinel()).toBe(true);
    expect(window.history.state).toMatchObject(ROUTER_STATE);
  });

  it("asks on Back without the address moving, and pushes the sentinel again on stay", async () => {
    render(<Probe active onNavigate={() => {}} />);

    await pressBack();
    expect(asking()).toBe(true);
    expect(window.location.pathname).toBe(EDITOR_PATH);
    // The router heard of it, and was sent to the page it is already showing.
    expect(routedTo).toEqual([EDITOR_PATH]);
    expect(isSentinel()).toBe(false);

    fireEvent.click(screen.getByText("stay"));
    expect(asking()).toBe(false);
    expect(isSentinel()).toBe(true);
    expect(window.history.state).toMatchObject(ROUTER_STATE);

    // And the next Back is caught the same way.
    await pressBack();
    expect(asking()).toBe(true);
    expect(window.location.pathname).toBe(EDITOR_PATH);
  });

  it("goes back on leave", async () => {
    render(<Probe active onNavigate={() => {}} />);

    await pressBack();
    expect(asking()).toBe(true);

    const landed = popped();
    fireEvent.click(screen.getByText("leave"));
    await act(() => landed);

    expect(asking()).toBe(false);
    expect(window.location.pathname).toBe(LIST_PATH);
    expect(routedTo).toEqual([EDITOR_PATH, LIST_PATH]);
    expect(unloadIsHeld()).toBe(false);
  });

  it("holds an in-app link and asks, then steps off the sentinel and follows it on leave", async () => {
    const navigate = vi.fn();
    render(<Probe active onNavigate={navigate} />);

    fireEvent.click(screen.getByText("Back to the list"));
    expect(navigate).not.toHaveBeenCalled();
    expect(asking()).toBe(true);

    fireEvent.click(screen.getByText("stay"));
    expect(asking()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    expect(isSentinel()).toBe(true);

    fireEvent.click(screen.getByText("Back to the list"));
    const landed = popped();
    fireEvent.click(screen.getByText("leave"));
    expect(asking()).toBe(false);
    // The click is replayed only once the sentinel is off the history.
    expect(navigate).not.toHaveBeenCalled();
    await act(() => landed);

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(isSentinel()).toBe(false);
    expect(window.location.pathname).toBe(EDITOR_PATH);
  });

  it("leaves a link that opens elsewhere alone", () => {
    const navigate = vi.fn();
    render(<Probe active onNavigate={navigate} />);

    fireEvent.click(screen.getByText("In a new tab"));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(asking()).toBe(false);
  });

  it("has the browser ask before the page unloads", () => {
    render(<Probe active onNavigate={() => {}} />);
    expect(unloadIsHeld()).toBe(true);
  });

  it("takes the sentinel off once the work is saved, and lets Back through", async () => {
    const navigate = vi.fn();
    const { rerender } = render(<Probe active onNavigate={navigate} />);
    expect(unloadIsHeld()).toBe(true);

    rerender(<Probe active={false} onNavigate={navigate} />);
    await landing();

    expect(isSentinel()).toBe(false);
    expect(window.location.pathname).toBe(EDITOR_PATH);
    expect(unloadIsHeld()).toBe(false);
    fireEvent.click(screen.getByText("Back to the list"));
    expect(navigate).toHaveBeenCalledTimes(1);

    // One Back now leaves: no duplicate of the editor is left behind.
    await pressBack();
    expect(window.location.pathname).toBe(LIST_PATH);
    expect(asking()).toBe(false);
  });

  it("arms again only once a step off has landed, so the step never takes the new sentinel", async () => {
    // React's development double-mount stands the guard down and up again in
    // one tick, with the step off the first sentinel still on its way.
    render(
      <StrictMode>
        <Probe active onNavigate={() => {}} />
      </StrictMode>,
    );
    await landing();

    expect(asking()).toBe(false);
    expect(isSentinel()).toBe(true);
    expect(window.location.pathname).toBe(EDITOR_PATH);

    // Exactly one sentinel: one Back asks, and leaving goes to the list.
    await pressBack();
    expect(asking()).toBe(true);
    const landed = popped();
    fireEvent.click(screen.getByText("leave"));
    await act(() => landed);
    expect(window.location.pathname).toBe(LIST_PATH);
  });
});
