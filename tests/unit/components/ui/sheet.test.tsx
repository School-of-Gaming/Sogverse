import { afterEach, describe, expect, it, vi } from "vitest";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { Sheet, SheetHeader, SheetTitle } from "@/components/ui/sheet";

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
 * close: a sheet that mounts closed has nothing to finish. And a close is the
 * panel's own slide ending, which a transition finishing anywhere else in the
 * panel must not pass for.
 *
 * The header is here for its shape as the sheets using it meet it: a title
 * and Close with nothing else, and, handed actions, those actions set beside
 * Close rather than under the title.
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

  it("is the panel's own slide ending, not a transition inside it or of another property", () => {
    const onExitComplete = vi.fn();
    const { rerender } = render(
      <Sheet open onOpenChange={noop} onExitComplete={onExitComplete}>
        <p>held</p>
      </Sheet>,
    );
    rerender(
      <Sheet open={false} onOpenChange={noop} onExitComplete={onExitComplete}>
        <p>held</p>
      </Sheet>,
    );
    const child = screen.getByText("held");
    const panel = child.parentElement;
    if (!panel) throw new Error("the sheet's content has no panel");

    // A child's slide bubbles up to the panel, and is not the panel's.
    endTransition(child, "translate");
    // The panel's own transition of some other property is not its slide.
    endTransition(panel, "opacity");
    expect(onExitComplete).not.toHaveBeenCalled();

    endTransition(panel, "translate");
    expect(onExitComplete).toHaveBeenCalledTimes(1);
  });
});

/** A transition on `target` finishing, as the browser reports it. */
function endTransition(target: Element, propertyName: string) {
  const event = new Event("transitionend", { bubbles: true });
  Object.defineProperty(event, "propertyName", { value: propertyName });
  act(() => {
    target.dispatchEvent(event);
  });
}

function WithMessages({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider
      locale="en"
      messages={messages}
      timeZone="Europe/Helsinki"
    >
      {children}
    </NextIntlClientProvider>
  );
}

describe("a sheet's header", () => {
  const closeName = messages.common.close;

  it("is the title and Close alone when it is handed no actions", () => {
    render(
      <SheetHeader onClose={noop}>
        <SheetTitle>Pick a gedu</SheetTitle>
      </SheetHeader>,
      { wrapper: WithMessages },
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toBe(screen.getByRole("button", { name: closeName }));
    expect(screen.getByRole("heading", { name: "Pick a gedu" })).toBeTruthy();
  });

  it("sets its actions in Close's group, not in the title's column", () => {
    render(
      <SheetHeader
        onClose={noop}
        actions={
          <button type="button" onClick={noop}>
            Clear
          </button>
        }
      >
        <SheetTitle>Filters</SheetTitle>
      </SheetHeader>,
      { wrapper: WithMessages },
    );
    const closeGroup = screen.getByRole("button", { name: closeName })
      .parentElement;
    if (!closeGroup) throw new Error("Close has no group");
    const action = within(closeGroup).getByRole("button", { name: "Clear" });

    const titleColumn = screen.getByRole("heading", { name: "Filters" })
      .parentElement;
    if (!titleColumn) throw new Error("the title has no column");
    expect(titleColumn.contains(action)).toBe(false);
    expect(within(closeGroup).queryByRole("heading")).toBeNull();
  });
});
