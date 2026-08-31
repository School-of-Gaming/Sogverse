"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * How wide a dialog is allowed to get.
 *
 * `default` is the width every dialog in the app had before there was a
 * choice; `wide` is for a dialog whose content is a *layout* rather than a
 * message — a browsing grid beside a reference column, where two thirds of a
 * narrow box is two tiles across and unusable.
 */
export type DialogSize = "default" | "wide";

const DIALOG_SIZE_CLASS: Record<DialogSize, string> = {
  default: "max-w-lg",
  wide: "max-w-6xl",
};

/**
 * **The width is capped in two places, so it travels through context rather
 * than through a prop.** The portal's positioning wrapper caps it (that is what
 * centres the dialog and gives the backdrop something to sit behind) and
 * `DialogContent` caps it again (so a caller composing its own content still
 * gets the box). A `size` passed to one and not the other produces a dialog
 * that is wide in its layout and narrow in its card, which is why the two read
 * one value: `Dialog` publishes it and `DialogContent` consumes it. A caller
 * that wants a one-off width still overrides `DialogContent`'s class, exactly
 * as before — `cn` lets the later class win.
 */
const DialogSizeContext = React.createContext<DialogSize>("default");

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Width cap for both the portal wrapper and `DialogContent`. */
  size?: DialogSize;
  children: React.ReactNode;
}

/**
 * **Escape closes one dialog — the one on top.**
 *
 * Every open dialog listens on `document`, because a dialog is a portal and
 * there is no focused subtree to hang the handler off. That is fine until two
 * are open at once, and then one keypress reaches both listeners and closes
 * both: a picker opened from inside a form dialog takes its host down with it,
 * and the parent loses the half-finished thing they were standing in front of.
 *
 * So the open dialogs are held in a module-level register, and a keypress is
 * answered by exactly one of them. Every other dialog sees the same event and
 * declines it.
 *
 * **Which one is on top is read from the tree, not from mount order.** Each
 * dialog publishes its nesting depth through context, so a dialog rendered
 * inside another's children is deeper by construction. Registration order
 * cannot answer this: React runs a child's effects before its parent's, so two
 * dialogs opening in the same commit would register inner-first and hand the
 * keypress to the outer one. Depth is a property of where the dialog *is*,
 * which is the thing the reader can see. Ties — two independent dialogs at the
 * same depth, which nothing in the app currently opens together — fall back to
 * the most recently registered, since that is the one that arrived over the
 * other.
 *
 * **Depth is not the same thing as paint order, and this is the one place that
 * could show.** Both portals mount at `z-50` into `document.body`, so what
 * paints on top is DOM insertion order — which for a *nested* pair agrees with
 * depth, because the inner dialog can only exist once the outer one has. Every
 * pair this app opens is nested, so the two orderings never disagree today. A
 * root-level dialog opened *over* an already-open nested one would be the
 * exception: it would paint on top and still not take Escape, because it is
 * shallower. That is latent rather than broken — no such stacking exists — and
 * it is deliberately not solved here, since comparing portal positions to
 * decide a keypress is real machinery for a case with no caller. If such a
 * stacking ever appears, this is the paragraph to come back to.
 *
 * A single dialog is unaffected: it is the only entry, so it is always the top.
 */
const DialogDepthContext = React.createContext(0);

interface DialogStackEntry {
  depth: number;
  close: () => void;
}

const openDialogs: DialogStackEntry[] = [];

function topmostDialog(): DialogStackEntry | null {
  let top: DialogStackEntry | null = null;
  // `>=` so a tie resolves to the last registered entry.
  for (const entry of openDialogs) {
    if (top === null || entry.depth >= top.depth) top = entry;
  }
  return top;
}

function Dialog({ open, onOpenChange, size = "default", children }: DialogProps) {
  const depth = React.useContext(DialogDepthContext);
  // The register entry has to outlive a re-render with a new `onOpenChange`
  // identity — re-registering would move this dialog to the end of the array
  // and change who wins a tie, for no reason the reader could see. So the
  // handler is read through a ref and the entry is created once per open.
  const onOpenChangeRef = React.useRef(onOpenChange);
  React.useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  });

  React.useEffect(() => {
    if (!open) return;
    const entry: DialogStackEntry = {
      depth,
      close: () => onOpenChangeRef.current(false),
    };
    openDialogs.push(entry);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (topmostDialog() !== entry) return;
      entry.close();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // By identity, not by popping: a dialog can close from the middle of the
      // register (the host of an open picker unmounting, a route change), and
      // popping would evict somebody else's entry.
      const index = openDialogs.indexOf(entry);
      if (index !== -1) openDialogs.splice(index, 1);
    };
  }, [open, depth]);

  if (!open) return null;

  return createPortal(
    <DialogDepthContext.Provider value={depth + 1}>
      <DialogSizeContext.Provider value={size}>
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          // **A submit inside a dialog never reaches the page behind it**, and
          // the portal is the reason that is not already true.
          //
          // The DOM node moves to `document.body`, so a *browser* can never
          // submit a host form from in here. React can: it dispatches on the
          // tree it rendered, not the one the browser laid out, and in that
          // tree the dialog is still a child of whatever opened it. So a dialog
          // carrying a `<form>` of its own, opened from inside another form,
          // hands its submit straight to that form's `onSubmit` —
          // indistinguishable from the user pressing the page's own Save.
          //
          // Not hypothetical: naming a new site from the product form's site
          // picker saved the product — with the *old* site, since the pick
          // lands a round trip later — and navigated off the edit page while
          // the create request was still in the air. `preventDefault` in the
          // inner handler does not touch it; that cancels the browser's default
          // action, and the host's handler is another React listener on the
          // same event.
          //
          // **It is contained here rather than in each dialog** because the
          // trap belongs to portals rather than to any one dialog: it fails
          // silently, only when a dialog is opened from inside a form, and the
          // dialog's author is rarely the person who chose to mount it there.
          // One line at the portal's own root makes the class impossible for
          // every dialog, present and future, and it can cost nothing
          // legitimate — a form inside a dialog is by definition the dialog's
          // own, and every handler *within* the dialog still runs, since those
          // sit below this node rather than above it. `Sheet` carries the same
          // line for the same reason.
          onSubmit={(event) => event.stopPropagation()}
        >
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => onOpenChange(false)}
          />
          <div className={cn("relative z-50 w-full", DIALOG_SIZE_CLASS[size])}>
            {children}
          </div>
        </div>
      </DialogSizeContext.Provider>
    </DialogDepthContext.Provider>,
    document.body
  );
}

function DialogContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const size = React.useContext(DialogSizeContext);
  return (
    <div
      className={cn(
        "w-full rounded-lg border border-border bg-card p-6 shadow-lg",
        DIALOG_SIZE_CLASS[size],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn("text-lg font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function DialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      // The app-wide button order rule (root `CLAUDE.md`, "Button Order"):
      // affirmative on the right in a row, on top in a stack. Footers are
      // authored DOM-order [negative, …, affirmative], and this one class list
      // places them both ways — `sm:flex-row sm:justify-end` reads left→right
      // with the affirmative last (rightmost), and `flex-col-reverse` stacks
      // that same last child on top. `gap-2` (not `space-x`) so the stacked
      // mobile buttons get vertical spacing too.
      className={cn(
        "mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  );
}

export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter };
