"use client";

import { useState } from "react";
import {
  CornerUpLeft,
  Lock,
  MoreHorizontal,
  Pencil,
  SmilePlus,
  Trash2,
  Undo2,
  Unlock,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { ChatReactionCode } from "@/lib/constants/chat";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import type { ChatMessageCapabilities } from "./capabilities";
import { ChatPopover } from "./ChatPopover";
import { ChatReactionPicker } from "./ChatReactionRow";
import type { ChatAccount } from "./types";

/**
 * Everything a reader can do to one message.
 *
 * **Absolutely positioned, and therefore free.** The bar appears on hover, on
 * keyboard focus and on a tap, and takes no space in the row, so nothing on
 * screen moves when it arrives — which matters more here than anywhere else in
 * the app, because it arrives as a pointer passes over a *scrolling log* and a
 * row that grew under a moving cursor would push the next message out from
 * under it.
 *
 * **`revealed` is the touch half of the same affordance, and it is a state
 * class beside the hover one rather than a second bar.** A phone has no hover,
 * so without it every action on this surface — reply, react, edit, remove,
 * lock — is unreachable for the families who mostly meet the product on one.
 * Whoever renders the bar holds the state (one row's bar at a time) and the
 * geometry is identical either way, so a tap reveals exactly what a mouse
 * reveals and moves nothing.
 *
 * **Hidden means untouchable, not merely invisible.** The bar straddles its
 * row's top edge, so an `opacity-0` bar that still hit-tests is a strip of
 * invisible buttons over the bottom of the message *above* it — harmless with a
 * cursor that reveals whatever it passes over, and on a phone a tap that opens
 * a reaction picker out of nowhere. So `pointer-events` travels with the
 * opacity. Keyboard reach is untouched: `pointer-events: none` takes nothing
 * out of the tab order, and focus turns both back on together.
 *
 * **What it offers comes from the capability module, never from a role test
 * written here.** Edit and delete are the sender's own, remove-for-everyone and
 * the chat lock are a moderator's, a removed message offers only putting it
 * back, and a locked member is offered nothing that writes. Those rules live in
 * one pure function so the composer, this bar and the wire-up's guards cannot
 * drift into three different answers.
 */
export function ChatMessageActions({
  sender,
  capabilities,
  unsent = false,
  revealed = false,
  onReply,
  onToggleReaction,
  onStartEdit,
  onDelete,
  onHide,
  onRestore,
  onSetLock,
  className,
}: {
  sender: ChatAccount | null;
  capabilities: ChatMessageCapabilities;
  /**
   * Whether the server never took this message — the `failed` echo a sender is
   * allowed to take back.
   *
   * It changes what deleting *means*, so it changes whether deleting is
   * confirmed. A sent message leaves a tombstone other people read, which is
   * what the confirmation warns about; an unsent one leaves nothing, because
   * nobody but the sender has ever seen it. Confirming that would ask somebody
   * to think about a consequence that does not exist, in words ("everyone will
   * see that a message was removed") that would not be true.
   */
  unsent?: boolean;
  /**
   * Whether a tap is holding this bar open — the touch counterpart of hover.
   *
   * Held by whoever renders the bar rather than here, because only one row's
   * bar may be open at a time and a bar cannot know about its neighbours.
   */
  revealed?: boolean;
  onReply: () => void;
  onToggleReaction: (code: ChatReactionCode) => void;
  onStartEdit: () => void;
  onDelete: () => void;
  onHide: () => void;
  onRestore: () => void;
  onSetLock: (locked: boolean) => void;
  className?: string;
}) {
  const t = useTranslations("chat.message");
  const m = useTranslations("chat.moderation");
  const r = useTranslations("chat.reactions");
  const rp = useTranslations("chat.reply");

  // The overlays hang off the button that opened them, and *which* button that
  // was is state rather than a ref: it decides what renders, and a ref read
  // during render is both a lint error and a real staleness hazard.
  const [reactAnchor, setReactAnchor] = useState<HTMLElement | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [confirming, setConfirming] = useState<"delete" | "hide" | null>(null);

  const picking = reactAnchor !== null;
  const menuOpen = menuAnchor !== null;

  const name = sender?.name ?? "";
  const hasMenu =
    capabilities.canEdit ||
    capabilities.canDelete ||
    capabilities.canHide ||
    capabilities.canRestore ||
    capabilities.lockControl !== null;

  if (!capabilities.canReact && !capabilities.canReply && !hasMenu) return null;

  return (
    <>
      <div
        // The state, readable from outside: what the scene shows a reviewer and
        // what a test asserts on, so neither has to read a class list.
        data-chat-actions={revealed ? "open" : "closed"}
        className={cn(
          // Pinned to the row's right edge, straddling its top boundary. The
          // fixed edge is deliberate — a bar that followed the end of the text
          // would be somewhere different on every message, and a predictable
          // position is what lets the hand learn it. Straddling the boundary
          // is what visually attaches the bar to *this* row at full width,
          // and keeps it off the row's own first line on narrow screens.
          "absolute -top-3 right-0 flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5 shadow-sm",
          // Present for a pointer on hover, for a finger on a tap, for a
          // keyboard on focus, and whenever one of its own overlays is up —
          // otherwise opening the menu would hide the button that opened it.
          // `pointer-events` moves with the opacity in every one of those: an
          // invisible bar must not be a strip of invisible buttons.
          "pointer-events-none opacity-0 transition-opacity",
          "focus-within:pointer-events-auto focus-within:opacity-100",
          "group-hover:pointer-events-auto group-hover:opacity-100",
          revealed && "pointer-events-auto opacity-100",
          (picking || menuOpen) && "pointer-events-auto opacity-100",
          className,
        )}
      >
        {capabilities.canReact && (
          <ActionButton
            label={r("add")}
            onClick={(event) => {
              setMenuAnchor(null);
              setReactAnchor(picking ? null : event.currentTarget);
            }}
          >
            <SmilePlus className="h-3.5 w-3.5" aria-hidden />
          </ActionButton>
        )}
        {capabilities.canReply && (
          <ActionButton label={rp("action")} onClick={onReply}>
            <CornerUpLeft className="h-3.5 w-3.5" aria-hidden />
          </ActionButton>
        )}
        {hasMenu && (
          <ActionButton
            label={t("actions")}
            onClick={(event) => {
              setReactAnchor(null);
              setMenuAnchor(menuOpen ? null : event.currentTarget);
            }}
          >
            <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
          </ActionButton>
        )}
      </div>

      {picking && (
        <ChatPopover anchor={reactAnchor} onClose={() => setReactAnchor(null)}>
          <ChatReactionPicker
            onPick={(code) => {
              onToggleReaction(code);
              setReactAnchor(null);
            }}
          />
        </ChatPopover>
      )}

      {menuOpen && (
        <ChatPopover anchor={menuAnchor} onClose={() => setMenuAnchor(null)}>
          <div className="min-w-48 rounded-md border border-border bg-card p-1 shadow-lg">
            {capabilities.canEdit && (
              <MenuItem
                icon={<Pencil className="h-3.5 w-3.5" aria-hidden />}
                label={t("edit")}
                onClick={() => {
                  setMenuAnchor(null);
                  onStartEdit();
                }}
              />
            )}
            {capabilities.canDelete && (
              <MenuItem
                icon={<Trash2 className="h-3.5 w-3.5" aria-hidden />}
                label={t("delete")}
                destructive
                onClick={() => {
                  setMenuAnchor(null);
                  // Nothing to warn about on a message that never went, so it
                  // goes straight through — see `unsent` above.
                  if (unsent) onDelete();
                  else setConfirming("delete");
                }}
              />
            )}
            {capabilities.canHide && (
              <MenuItem
                icon={<Trash2 className="h-3.5 w-3.5" aria-hidden />}
                label={t("hide")}
                destructive
                onClick={() => {
                  setMenuAnchor(null);
                  setConfirming("hide");
                }}
              />
            )}
            {capabilities.canRestore && (
              <MenuItem
                icon={<Undo2 className="h-3.5 w-3.5" aria-hidden />}
                label={t("restore")}
                onClick={() => {
                  setMenuAnchor(null);
                  onRestore();
                }}
              />
            )}
            {capabilities.lockControl !== null && (
              <MenuItem
                icon={
                  capabilities.lockControl === "lock" ? (
                    <Lock className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <Unlock className="h-3.5 w-3.5" aria-hidden />
                  )
                }
                label={
                  capabilities.lockControl === "lock"
                    ? m("lock", { name })
                    : m("unlock", { name })
                }
                onClick={() => {
                  const locking = capabilities.lockControl === "lock";
                  setMenuAnchor(null);
                  onSetLock(locking);
                }}
              />
            )}
          </div>
        </ChatPopover>
      )}

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
        title={confirming === "hide" ? m("hideTitle") : m("deleteTitle")}
        description={confirming === "hide" ? m("hideBody") : m("deleteBody")}
        confirmLabel={confirming === "hide" ? m("hideConfirm") : m("deleteConfirm")}
        onConfirm={() => {
          if (confirming === "hide") onHide();
          else onDelete();
        }}
      />
    </>
  );
}

function ActionButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act"
    >
      {children}
    </button>
  );
}

function MenuItem({
  icon,
  label,
  destructive,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
        destructive === true ? "text-destructive" : "text-foreground",
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">{label}</span>
    </button>
  );
}
