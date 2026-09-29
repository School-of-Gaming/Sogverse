import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useLeaveGuard } from "@/hooks/use-leave-guard";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";

/**
 * The guard a page with unsaved work puts up against being left.
 *
 * The page's router is stood in for twice over: the app's `Link` (the setup's
 * stub, a plain anchor) with a click handler that navigates in code and
 * cancels the browser's own navigation, as the real one does, and a `popstate`
 * listener on the window registered before the
 * guard, as the app router's is. What is pinned is that neither hears of a
 * leave while the guard is asking, that each hears of it once the person
 * answers "leave", and that an inactive guard — a clean form, or one just
 * saved — lets everything through untouched.
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

const EDITOR_PATH = "/admin/library/bb744329-6849-4d79-be8e-da6b5bdec6fa";

/** Whether the browser would ask before unloading the page. */
function unloadIsHeld(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

/** Back, as the browser reports it: the address has already moved. */
function pressBack() {
  act(() => {
    window.history.replaceState(null, "", "/admin/library");
    window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
  });
}

const asking = () => screen.queryByText("asking") !== null;

describe("useLeaveGuard", () => {
  const router = vi.fn();
  let go: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    window.history.replaceState(null, "", EDITOR_PATH);
    window.addEventListener("popstate", router);
    go = vi.spyOn(window.history, "go").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    window.removeEventListener("popstate", router);
    router.mockReset();
    go.mockRestore();
  });

  it("lets everything through while there is nothing to lose", () => {
    const navigate = vi.fn();
    render(<Probe active={false} onNavigate={navigate} />);

    fireEvent.click(screen.getByText("Back to the list"));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(unloadIsHeld()).toBe(false);

    pressBack();
    expect(router).toHaveBeenCalledTimes(1);
    expect(go).not.toHaveBeenCalled();
    expect(asking()).toBe(false);
  });

  it("holds an in-app link and asks, then follows it on leave", () => {
    const navigate = vi.fn();
    render(<Probe active onNavigate={navigate} />);

    fireEvent.click(screen.getByText("Back to the list"));
    expect(navigate).not.toHaveBeenCalled();
    expect(asking()).toBe(true);

    fireEvent.click(screen.getByText("stay"));
    expect(asking()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Back to the list"));
    fireEvent.click(screen.getByText("leave"));
    expect(asking()).toBe(false);
    expect(navigate).toHaveBeenCalledTimes(1);
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

  it("undoes Back before the router hears of it, then takes it on leave", () => {
    render(<Probe active onNavigate={() => {}} />);

    pressBack();
    expect(router).not.toHaveBeenCalled();
    expect(go).toHaveBeenCalledWith(1);
    expect(asking()).toBe(true);

    // The undo landing back on the editor's own entry is nobody's business.
    act(() => {
      window.history.replaceState(null, "", EDITOR_PATH);
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    });
    expect(router).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("leave"));
    expect(go).toHaveBeenLastCalledWith(-1);

    // The step taken again reaches the router this time.
    pressBack();
    expect(router).toHaveBeenCalledTimes(1);
  });

  it("stops asking once the work is saved", () => {
    const navigate = vi.fn();
    const { rerender } = render(<Probe active onNavigate={navigate} />);
    expect(unloadIsHeld()).toBe(true);

    rerender(<Probe active={false} onNavigate={navigate} />);

    expect(unloadIsHeld()).toBe(false);
    fireEvent.click(screen.getByText("Back to the list"));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(asking()).toBe(false);
  });
});
