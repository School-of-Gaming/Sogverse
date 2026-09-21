"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { substitutionRequestFailureKey } from "@/services/session-substitution";
import { SessionCardMenu } from "./SessionCardMenu";
import {
  SessionSubstitutionRequestDialog,
  type SessionSubstitutionRequestDraft,
} from "./SessionSubstitutionRequestDialog";

/**
 * The gedu's own row in the card's overflow menu: **"I need to cancel"**, and
 * the dialog behind it.
 *
 * The menu itself is `SessionCardMenu`, shared with the admin card — this is
 * the one item a gedu's own session carries, plus the form it opens and the
 * committing state that form needs.
 *
 * **The row and the dialog it opens say different things on purpose.** The row
 * is the gedu's own words for what they are doing — cancelling *their*
 * attendance — and it is short because it sits in a menu. The dialog is titled
 * "I can't make this session" and its first sentence says the session still
 * runs and the office looks for a substitute, which is what stops the shorter
 * row being read as cancelling the session itself *(owner, 2026-09)*.
 *
 * **Filing an absence is deliberately quiet.** It is rare — most gedus will
 * never press it — and a full-width control repeating that offer on every
 * future card of a fifty-week feed spent a band of every card on the least
 * likely thing anybody would do with it. So the offer is folded into a `⋯`
 * button in the header's trailing cluster, where a reader looking for
 * "what else can I do with this session" already is, and the card is shorter
 * than it was rather than taller *(owner, 2026-09)*.
 *
 * **The glyph is small and the hit box is not.** The button is 44×44 CSS px —
 * the thumb target the rest of the app is moving towards — and absorbs the
 * extra height into the row's own padding with a negative margin, so the header
 * cluster grows by nothing a reader can see while the tap target is the full
 * size. Growing the glyph instead would make the quietest control on the card
 * the loudest thing in the row.
 *
 * **There is no dropdown primitive in the kit**, so this follows the account
 * menu's idiom exactly (`src/components/layout/CLAUDE.md`): a `relative`
 * wrapper, `useClickOutside`, an absolutely-positioned `role="menu"` panel,
 * Escape closing it with focus handed back to the trigger, and arrow keys
 * moving across the rows. Two call sites shared nothing but `useClickOutside`
 * before this one, and a third is not yet a primitive — extracting one is a
 * decision about the menu's *shape*, which nobody has made.
 */
export function SessionSubstitutionMenu({
  onRequestSubstitution,
}: {
  /**
   * File "I can't make this session". **Awaited**: the dialog holds its own
   * committing flag from the click until this settles, and closes only when it
   * resolves — so a refused write leaves the reason and the note where the gedu
   * can try again.
   */
  onRequestSubstitution: (
    draft: SessionSubstitutionRequestDraft,
  ) => void | Promise<void>;
}) {
  const t = useTranslations("gedu.sessionFeed");
  const [requestOpen, setRequestOpen] = useState(false);
  /**
   * Live from the click that starts the filing write until the document the
   * write changes comes back.
   *
   * It belongs to the request dialog, which carries a form and therefore holds
   * its committing state out here where the draft's own fields can read it.
   * Set synchronously before the mutation runs, so there is no render between
   * the click and the disabled control in which a second press could land, and
   * cleared on settle whichever way it settles — this menu survives its own
   * write only long enough to be replaced by the status block the write puts on
   * the card, and a flag left set would disable the dialog on the way out.
   */
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * The wrapper the menu drew, so the dialog can hand focus back to its trigger
   * on the way out — the row that opened it went with the panel.
   */
  const menuRef = useRef<HTMLDivElement>(null);

  const fileSubstitution = async (draft: SessionSubstitutionRequestDraft) => {
    setError(null);
    setCommitting(true);
    try {
      await onRequestSubstitution(draft);
      setRequestOpen(false);
    } catch (refusal) {
      // A refusal keeps the dialog up with the reason and the note where the
      // gedu left them, and names what went wrong inside the dialog they are
      // still standing in front of — through the same mapper the page's picker
      // reads, so one write cannot be explained two ways.
      setError(t(substitutionRequestFailureKey(refusal)));
    } finally {
      setCommitting(false);
    }
  };

  const items = [
    {
      key: MENU_ITEM_KEY,
      label: t("substitutionRequestAction"),
      onSelect: () => {
        setError(null);
        setRequestOpen(true);
      },
    },
  ];

  /**
   * The `⋯` the menu drew, while it is still on the card.
   *
   * The row that opened the dialog went with the panel, so closing it would
   * otherwise land focus on `<body>` and restart the next Tab at the top of the
   * page. A successful write takes this whole control off the card, and then
   * there is nothing to hand focus back to.
   */
  const trigger = () =>
    menuRef.current?.querySelector<HTMLElement>(MENU_TRIGGER_SELECTOR) ?? null;

  return (
    // The dialog is a **sibling** of the menu wrapper, never a child of it: a
    // portal still bubbles its events through the React tree it was rendered
    // into, so a dialog mounted inside would hand every arrow key typed at the
    // form to this menu's own key handler.
    <>
      <div ref={menuRef}>
        <SessionCardMenu label={t("substitutionMenuLabel")} items={items} />
      </div>

      <SessionSubstitutionRequestDialog
        open={requestOpen}
        onOpenChange={(next) => {
          if (committing) return;
          setRequestOpen(next);
          // Focus goes back where the reader was two clicks ago — see
          // `trigger` above for why it can be gone.
          const back = trigger();
          if (!next && back?.isConnected === true) back.focus();
        }}
        committing={committing}
        error={error}
        onConfirm={(draft) => void fileSubstitution(draft)}
      />
    </>
  );
}

/** React's key for the one row — never rendered, never read by anybody. */
const MENU_ITEM_KEY = "request";

/** How the wrapper finds the `⋯` the menu drew inside it. */
const MENU_TRIGGER_SELECTOR = '[aria-haspopup="menu"]';
