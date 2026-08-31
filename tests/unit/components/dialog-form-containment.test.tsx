import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";

/**
 * **A submit inside an overlay never reaches the page behind it.**
 *
 * This is the one bug class portals create and nothing else warns about. The
 * portal moves the overlay's DOM node to `document.body`, so a *browser* cannot
 * submit a host form from inside one — but React dispatches on the tree it
 * rendered rather than the one the browser laid out, and in that tree the
 * overlay is still a child of whatever opened it. An overlay carrying a `<form>`
 * of its own, opened from inside another form, therefore hands its submit to
 * that form's `onSubmit`, indistinguishable from the user pressing the page's
 * own Save button.
 *
 * It shipped: naming a new site in the product form's site picker saved the
 * product — with the *old* site, since the pick lands a round trip later — and
 * navigated off the edit page while the create request was still in the air.
 *
 * The containment lives on the overlay primitives, so these are the tests that
 * say the *class* is closed. `product-site-picker-flow` covers the real chain
 * that found it; these cover every dialog and sheet that will ever be mounted
 * in a form, including the ones nobody has written yet.
 *
 * **What is not testable here**: a browser's *implicit* submission — Enter in a
 * lone text input — which jsdom does not perform at all. That path is a native
 * DOM event on the overlay's own form and never crosses the portal either, but
 * it has to be checked in a real browser.
 */

afterEach(cleanup);

/** A form on the page, with an overlay opened from inside it holding its own. */
function HostForm({
  overlay,
  onHostSubmit,
  onOverlaySubmit,
}: {
  overlay: "dialog" | "sheet";
  onHostSubmit: (event: React.FormEvent) => void;
  onOverlaySubmit: (event: React.FormEvent) => void;
}) {
  const inner = (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onOverlaySubmit(event);
      }}
    >
      <button type="submit">overlay save</button>
    </form>
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onHostSubmit(event);
      }}
    >
      <button type="submit">host save</button>
      {overlay === "dialog" ? (
        <Dialog open onOpenChange={vi.fn()}>
          <DialogContent>{inner}</DialogContent>
        </Dialog>
      ) : (
        <Sheet open onOpenChange={vi.fn()}>
          <SheetContent>{inner}</SheetContent>
        </Sheet>
      )}
    </form>
  );
}

describe.each(["dialog", "sheet"] as const)("a %s inside a form", (overlay) => {
  it("submits itself without submitting the form it was opened from", () => {
    const onHostSubmit = vi.fn();
    const onOverlaySubmit = vi.fn();
    render(
      <HostForm
        overlay={overlay}
        onHostSubmit={onHostSubmit}
        onOverlaySubmit={onOverlaySubmit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "overlay save" }));

    expect(onOverlaySubmit).toHaveBeenCalledTimes(1);
    expect(onHostSubmit).not.toHaveBeenCalled();
  });

  it("still lets the host form submit itself", () => {
    // The containment is not allowed to be a blanket one: the page's own Save
    // is the whole reason the form is there, and it is a sibling of the overlay
    // rather than a descendant of it.
    const onHostSubmit = vi.fn();
    const onOverlaySubmit = vi.fn();
    render(
      <HostForm
        overlay={overlay}
        onHostSubmit={onHostSubmit}
        onOverlaySubmit={onOverlaySubmit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "host save" }));

    expect(onHostSubmit).toHaveBeenCalledTimes(1);
    expect(onOverlaySubmit).not.toHaveBeenCalled();
  });
});
