import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useState } from "react";
import { fireEvent, render } from "@testing-library/react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Sheet } from "@/components/ui/sheet";

/**
 * **An open modal holds the document's scroll, and the page under it does not
 * move sideways.**
 *
 * The document is this app's single scroll container, so the lock is
 * `overflow: hidden` on the root element and nothing else — but hiding the
 * overflow takes the scrollbar away and hands its width to the content, which
 * would shift the whole page under the dialog. So the width the root actually
 * reclaims is measured across the lock and paid back as padding.
 *
 * The measurements are what a test has to stand in for: jsdom lays nothing out,
 * so `clientWidth` here is a stub that widens exactly when the overflow is
 * hidden, which is what a real scrollbar-bearing document does. A page holding
 * the stable gutter open is the same stub with nothing to reclaim.
 *
 * The rest is the counter: two modals up at once are one lock, and it is the
 * last one to leave that hands the page back — by whatever route it leaves,
 * including being unmounted while still open.
 */

const VIEWPORT = 1000;
const SCROLLBAR = 15;

const root = () => document.documentElement;
const isLocked = () => root().style.overflow === "hidden";

/**
 * Stand in for layout: the root's content box is the viewport less the
 * scrollbar until something hides the overflow, and the whole viewport after.
 * `reclaims` is 0 for a page that reserves the gutter, where the scrollbar's
 * width never returns to the content.
 */
function stubMeasurements(reclaims: number) {
  Object.defineProperty(root(), "clientWidth", {
    configurable: true,
    get: () => (isLocked() ? VIEWPORT : VIEWPORT - reclaims),
  });
}

beforeEach(() => {
  stubMeasurements(SCROLLBAR);
});

afterEach(() => {
  Reflect.deleteProperty(root(), "clientWidth");
  root().style.removeProperty("overflow");
  root().style.removeProperty("padding-right");
});

describe("the document scroll lock", () => {
  it("locks the document while a dialog is open and pays back the scrollbar's width", () => {
    const view = render(
      <Dialog open onOpenChange={() => {}}>
        <DialogContent>body</DialogContent>
      </Dialog>,
    );

    expect(root().style.overflow).toBe("hidden");
    expect(root().style.paddingRight).toBe(`${SCROLLBAR}px`);

    view.unmount();
  });

  it("adds no padding on a page that already reserves the gutter", () => {
    Reflect.deleteProperty(root(), "clientWidth");
    stubMeasurements(0);

    const view = render(
      <Dialog open onOpenChange={() => {}}>
        <DialogContent>body</DialogContent>
      </Dialog>,
    );

    expect(root().style.overflow).toBe("hidden");
    expect(root().style.paddingRight).toBe("");

    view.unmount();
  });

  it("restores the exact inline values that were there before, not empty ones", () => {
    root().style.overflow = "scroll";
    root().style.paddingRight = "7px";

    function Host() {
      const [open, setOpen] = useState(true);
      return (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <button type="button" onClick={() => setOpen(false)}>
              close
            </button>
          </DialogContent>
        </Dialog>
      );
    }
    const view = render(<Host />);

    // The padding it was already carrying is added to, not replaced.
    expect(root().style.paddingRight).toBe(`${7 + SCROLLBAR}px`);

    fireEvent.click(view.getByText("close"));

    expect(root().style.overflow).toBe("scroll");
    expect(root().style.paddingRight).toBe("7px");

    view.unmount();
  });

  it("keeps the lock until the last of two nested dialogs closes", () => {
    function Host() {
      const [outer, setOuter] = useState(true);
      const [inner, setInner] = useState(true);
      return (
        <Dialog open={outer} onOpenChange={setOuter}>
          <DialogContent>
            <button type="button" onClick={() => setOuter(false)}>
              close outer
            </button>
            <Dialog open={inner} onOpenChange={setInner}>
              <DialogContent>
                <button type="button" onClick={() => setInner(false)}>
                  close inner
                </button>
              </DialogContent>
            </Dialog>
          </DialogContent>
        </Dialog>
      );
    }
    const view = render(<Host />);

    expect(isLocked()).toBe(true);
    // The second dialog changed nothing — one lock, one gutter's worth of
    // padding, however many modals are stacked on it.
    expect(root().style.paddingRight).toBe(`${SCROLLBAR}px`);

    fireEvent.click(view.getByText("close inner"));
    expect(isLocked()).toBe(true);

    fireEvent.click(view.getByText("close outer"));
    expect(isLocked()).toBe(false);
    expect(root().style.paddingRight).toBe("");

    view.unmount();
  });

  it("releases when an open dialog is unmounted", () => {
    const view = render(
      <Dialog open onOpenChange={() => {}}>
        <DialogContent>body</DialogContent>
      </Dialog>,
    );
    expect(isLocked()).toBe(true);

    view.unmount();

    expect(isLocked()).toBe(false);
    expect(root().style.paddingRight).toBe("");
  });

  it("is the same lock a sheet takes, so one closing over the other holds it", () => {
    function Host() {
      const [sheet, setSheet] = useState(true);
      return (
        <Dialog open onOpenChange={() => {}}>
          <DialogContent>
            <button type="button" onClick={() => setSheet(false)}>
              close sheet
            </button>
            <Sheet open={sheet} onOpenChange={setSheet}>
              <p>panel</p>
            </Sheet>
          </DialogContent>
        </Dialog>
      );
    }
    const view = render(<Host />);

    expect(isLocked()).toBe(true);
    expect(root().style.paddingRight).toBe(`${SCROLLBAR}px`);

    fireEvent.click(view.getByText("close sheet"));

    // The dialog behind it is still up.
    expect(isLocked()).toBe(true);

    view.unmount();
    expect(isLocked()).toBe(false);
  });
});
