import { afterEach, describe, expect, it, vi } from "vitest";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { act, cleanup, render, screen } from "@testing-library/react";
import { Sheet } from "@/components/ui/sheet";

/**
 * **A sheet can stand mounted on a page the server renders.**
 *
 * A sheet portals into `document.body`, and a server render has no body to
 * portal into — so a sheet kept mounted while closed, which is what lets it
 * slide rather than appear, has to render nothing on the server and arrive on
 * the client. That arrival must not be a hydration mismatch: the server's HTML
 * holds nothing where the sheet is, and the first client render has to agree
 * before the portal appears.
 *
 * The other half of standing mounted is knowing when a close has finished,
 * which a caller holding content in the sheet needs so it can let that content
 * go once nobody can see it. That report is for the end of a close, and only a
 * close: a sheet that mounts closed has nothing to finish.
 */

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const noop = () => {};

describe("a sheet on a server-rendered page", () => {
  it.each([false, true])(
    "renders nothing on the server (open: %s)",
    (open) => {
      expect(
        renderToString(
          <Sheet open={open} onOpenChange={noop}>
            <p>held</p>
          </Sheet>,
        ),
      ).toBe("");
    },
  );

  it("portals into the body on the client, outside the tree that rendered it", () => {
    render(
      <div data-testid="host">
        <Sheet open={false} onOpenChange={noop}>
          <p>held</p>
        </Sheet>
      </div>,
    );
    expect(screen.getByTestId("host").textContent).toBe("");
    expect(document.body.textContent).toContain("held");
  });

  it("arrives after hydration without a mismatch", async () => {
    const tree = (
      <div>
        <Sheet open={false} onOpenChange={noop}>
          <p>held</p>
        </Sheet>
      </div>
    );
    const host = document.createElement("div");
    host.innerHTML = renderToString(tree);
    document.body.appendChild(host);
    expect(document.body.textContent).not.toContain("held");

    const onRecoverableError = vi.fn();
    let root: Root | undefined;
    await act(async () => {
      root = hydrateRoot(host, tree, { onRecoverableError });
    });

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(host.textContent).toBe("");
    expect(document.body.textContent).toContain("held");

    act(() => root?.unmount());
    host.remove();
  });
});

describe("the end of a close", () => {
  it("is reported once a close has run its course, and not for a sheet mounted closed", () => {
    vi.useFakeTimers();
    const onExitComplete = vi.fn();
    const { rerender } = render(
      <Sheet open={false} onOpenChange={noop} onExitComplete={onExitComplete}>
        <p>held</p>
      </Sheet>,
    );
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onExitComplete).not.toHaveBeenCalled();

    rerender(
      <Sheet open onOpenChange={noop} onExitComplete={onExitComplete}>
        <p>held</p>
      </Sheet>,
    );
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onExitComplete).not.toHaveBeenCalled();

    rerender(
      <Sheet open={false} onOpenChange={noop} onExitComplete={onExitComplete}>
        <p>held</p>
      </Sheet>,
    );
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onExitComplete).toHaveBeenCalledTimes(1);
  });
});
