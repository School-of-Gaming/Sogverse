"use client";

import { useId, useState } from "react";
import { usePathname } from "next/navigation";
import { AudioLines, ExternalLink, Info, Lock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { getPathname } from "@/i18n/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MaybeInertLink } from "@/components/ui/maybe-inert-link";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { resolveInternalPath } from "@/lib/navigation/internal-path";
import type {
  ProductVoiceRoom,
  VoiceJoinInstructions,
} from "@/lib/products/voice-room";
import { cn } from "@/lib/utils";
import {
  INERT_HREF,
  type AppHref,
  type MaybeInertHrefObject,
} from "@/lib/constants/routes";

interface JoinVoiceButtonProps {
  /**
   * How the product's sessions are joined. It changes only what the *open*
   * button does; the locked button is the same for every mode.
   */
  voiceRoom: ProductVoiceRoom;
  /** Whether the voice window is currently open for this product. */
  voiceIsOpen: boolean;
  /** Where the open button navigates. `"#"` keeps the button inert (in-person products). */
  voiceHref: MaybeInertHrefObject;
  /** Pre-formatted "next open" date label, e.g. "Wed, May 28". */
  opensDate: string;
  /** Pre-formatted "next open" time label, e.g. "14:55". */
  opensTime: string;
  /**
   * Optional click handler. When present, the open variant renders as a
   * `<button>` and `onJoinClick` fires instead of navigating to `voiceHref`,
   * opening the external meeting or showing the instructions — whatever the
   * mode. Used on a parent's view of their child's seat, which intercepts the
   * click to open the switch-to-gamer dialog: whoever joins is the child.
   */
  onJoinClick?: () => void;
  /**
   * Where leaving the voice room should land, overriding "the page this button
   * was on".
   *
   * The default — the current pathname — is right for every surface where the
   * page you launched from is the page you want back. It is wrong on the gedu
   * dashboard, where the room belongs to a *group* and the useful destination
   * after a session is that group's workspace, not the tile grid the gedu
   * happened to click from. Gedu call sites therefore name the workspace
   * explicitly, and every other role keeps the pathname default untouched.
   */
  backHref?: AppHref;
  /** Button size variant — defaults to `sm` to match the dashboard card. */
  size?: "sm" | "default";
}

/**
 * The single Join Voice button shared across every surface that joins a
 * group's online session: the family enrollment cards and club pages, the gedu
 * dashboard's prominent group card, and every group card on the gedu
 * session-details page. Outside the session window it is a disabled button
 * with a lock icon + "Opens {date} at {time}", whatever the product's voice
 * room. During the window, what it does follows the product's choice:
 *
 * - **Sogverse room** — an enabled `Link` to `/voice/group/[id]`.
 * - **External meeting** — a link to the meeting, opened in a new tab.
 * - **No room** — a button opening a dialog with the join instructions in the
 *   reader's locale.
 *
 * `onJoinClick`, when passed, wins over all three: a parent on their child's
 * card switches account first, whatever the mode.
 *
 * That is the whole of it: a seat with no group yet renders no button at all —
 * the enrollment card says so in its footer instead — so this component never
 * has to speak for an unplaced gamer. Every surface reaches the three modes
 * through this one component, so no caller branches on the mode itself.
 *
 * Copy is centralized in the `voiceButton.*` translation namespace so
 * every caller speaks the same words — adjusting the label means one edit
 * per locale, not three. On the gedu details page every group on the
 * product shares the same schedule, so each card shows the same locked-
 * state copy when the window is closed; that repetition is intentional
 * (full reuse over a one-off banner).
 *
 * The link carries a `?back=<internal path>` query so leaving the voice room
 * returns the user somewhere useful instead of the role dashboard. It defaults
 * to the page the button is on — most callers pass nothing and get that — and
 * `backHref` overrides it where the launching page is not the right
 * destination.
 *
 * **The value is resolved through `resolveInternalPath` before it is put in the
 * URL**, and it is dropped entirely if it resolves off-origin. The voice route
 * resolves it again on the way out, which is the check that actually protects
 * the redirect; doing it here as well means this button cannot *emit* a link
 * that promises an off-site destination, which is the half a reader hovering
 * over it can see.
 */
export function JoinVoiceButton({
  voiceRoom,
  voiceIsOpen,
  voiceHref,
  opensDate,
  opensTime,
  onJoinClick,
  backHref,
  size = "sm",
}: JoinVoiceButtonProps) {
  const t = useTranslations("voiceButton");
  // **Raw `next/navigation`, deliberately.** This pathname is *embedded in a
  // URL* (`?back=`), not compared against a route, and the wrapped
  // `usePathname` returns the internal template — so on a dynamic route it
  // would put a literal `/parent/clubs/[id]` in the query, which passes every
  // allowlist and then navigates to it verbatim.
  const pathname = usePathname();
  const locale = useLocale();

  if (voiceIsOpen) {
    if (onJoinClick) {
      return (
        <button
          type="button"
          onClick={onJoinClick}
          className={cn(buttonVariants({ size }), "gap-1.5")}
        >
          {voiceRoom.mode === "none" ? (
            <Info className="h-4 w-4" aria-hidden />
          ) : (
            <AudioLines className="h-4 w-4" />
          )}
          {joinLabel(voiceRoom, t)}
        </button>
      );
    }
    if (voiceRoom.mode === "none") {
      return (
        <JoinInstructionsButton
          instructions={voiceRoom.instructions}
          size={size}
        />
      );
    }
    if (voiceRoom.mode === "external") {
      // The link is admin-supplied and the products table's CHECK only admits
      // an http(s) address, so it goes to the anchor as stored. Another site,
      // so a new tab that says so (`src/CLAUDE.md`, "Authored rich text").
      return (
        <a
          href={voiceRoom.url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ size }), "gap-1.5")}
        >
          <AudioLines className="h-4 w-4" aria-hidden />
          {t("joinMeeting")}
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          <span className="sr-only">{` ${t("opensInNewTab")}`}</span>
        </a>
      );
    }
    // An empty fallback is the "nothing safe to say" answer: the query is then
    // omitted and the voice route falls back to the viewer's own dashboard.
    // An override is a typed href, so it becomes a concrete external path
    // here — that is what a `?back=` value has to be, and it is what makes the
    // override usable at all without hand-building one.
    const backCandidate =
      backHref === undefined
        ? pathname
        : getPathname({ href: backHref, locale });
    const back = resolveInternalPath(backCandidate, "");
    const hrefWithBack =
      voiceHref === INERT_HREF || back === ""
        ? voiceHref
        : { ...voiceHref, query: { back } };
    return (
      <MaybeInertLink
        href={hrefWithBack}
        className={cn(buttonVariants({ size }), "gap-1.5")}
      >
        <AudioLines className="h-4 w-4" />
        {t("joinVoice")}
      </MaybeInertLink>
    );
  }

  return (
    <button
      type="button"
      disabled
      className={cn(buttonVariants({ size, variant: "secondary" }), "gap-1.5")}
    >
      <Lock className="h-4 w-4" />
      {t("locked", { date: opensDate, time: opensTime })}
    </button>
  );
}

/** The open button's words, which name what the Join does in each mode. */
function joinLabel(
  voiceRoom: ProductVoiceRoom,
  t: ReturnType<typeof useTranslations<"voiceButton">>,
): string {
  switch (voiceRoom.mode) {
    case "sogverse":
      return t("joinVoice");
    case "external":
      return t("joinMeeting");
    case "none":
      return t("howToJoin");
  }
}

/**
 * The open button of a product with no voice room: it opens a dialog holding
 * the join instructions the team wrote, in the reader's locale or the nearest
 * one written. The text is plain and its line breaks are kept.
 */
function JoinInstructionsButton({
  instructions,
  size,
}: {
  instructions: readonly VoiceJoinInstructions[];
  size: "sm" | "default";
}) {
  const t = useTranslations("voiceButton");
  const c = useTranslations("common");
  const locale = resolveLocale(useLocale());
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const text = resolveTranslation(instructions, locale)?.text ?? "";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={cn(buttonVariants({ size }), "gap-1.5")}
      >
        <Info className="h-4 w-4" aria-hidden />
        {t("howToJoin")}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent role="dialog" aria-modal aria-labelledby={titleId}>
          <DialogHeader>
            <DialogTitle id={titleId}>{t("howToJoin")}</DialogTitle>
          </DialogHeader>
          <p className="mt-4 whitespace-pre-line break-words text-sm">{text}</p>
          <DialogFooter>
            <Button type="button" autoFocus onClick={() => setOpen(false)}>
              {c("close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
