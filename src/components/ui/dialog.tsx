"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

function Dialog({ open, onOpenChange, children }: DialogProps) {
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
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm"
          onClick={() => onOpenChange(false)}
        />
        <div className="relative z-50 w-full max-w-lg">{children}</div>
      </div>
    </DialogDepthContext.Provider>,
    document.body
  );
}

function DialogContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-lg",
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
      // Button order convention: footers are authored DOM-order [secondary, …,
      // primary]. On desktop (sm:flex-row sm:justify-end) that reads left→right
      // as secondary…primary (primary on the right). On mobile we keep the same
      // order with plain `flex-col` — secondary on top, primary on the bottom
      // (thumb-reachable) — so the primary action is the "last" one in both
      // layouts (rightmost ≙ bottommost). `gap-2` (not `space-x`) so the stacked
      // mobile buttons get vertical spacing too.
      className={cn("mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter };
