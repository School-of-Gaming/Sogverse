"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { deleteCookie, setCookie } from "@/lib/cookies";
import {
  CONSENT_COOKIE_NAME,
  CONSENT_MAX_AGE_SECONDS,
  clearPixelStorage,
  consentForChoice,
  isWithdrawal,
  PIXEL_COOKIE_NAMES,
  serialiseConsent,
  type ConsentChoice,
  type ConsentState,
} from "@/lib/consent";

/**
 * Who is allowed to run, and the one place that answer changes.
 *
 * Seeded from the server's read of the consent cookie, so the first client
 * render agrees with the SSR HTML about which scripts exist. `null` is *not
 * answered yet* — the banner shows, and nothing beyond the strictly necessary
 * cookies runs.
 */
interface ConsentContextValue {
  /** The stored answer, or `null` when the question is still open. */
  consent: ConsentState | null;
  /** Whether the banner is being shown again on request. */
  isOpen: boolean;
  /** Re-ask. What the footer's Privacy choices link calls. */
  open: () => void;
  /** Record an answer. Writes the cookie; see the withdrawal note below. */
  choose: (choice: ConsentChoice) => void;
}

const ConsentContext = createContext<ConsentContextValue | undefined>(
  undefined,
);

interface ConsentProviderProps {
  /**
   * The server's parse of the `sog_consent` cookie. Seeded once and never
   * re-synced: this provider is the only writer, so a later server render
   * cannot know anything it does not.
   */
  initial: ConsentState | null;
  children: ReactNode;
}

export function ConsentProvider({ initial, children }: ConsentProviderProps) {
  const [consent, setConsent] = useState<ConsentState | null>(initial);
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const choose = useCallback(
    (choice: ConsentChoice) => {
      const next = consentForChoice(choice);
      setCookie(CONSENT_COOKIE_NAME, serialiseConsent(next), {
        maxAge: CONSENT_MAX_AGE_SECONDS,
      });

      // **A downgrade is a full reload, an upgrade is just state.** Mounting a
      // gated component is enough to start a script; unmounting it is not
      // enough to stop one, because the script has already installed its own
      // listeners, timers and globals on this document and will go on using
      // them. The only thing that reliably unloads it is a new document — so a
      // purpose that was granted and is now refused takes the pixel's own
      // cookies and stored state with it and reloads. Granting a purpose needs
      // none of that:
      // the gated components mount and the scripts arrive.
      if (isWithdrawal(consent, next)) {
        for (const name of PIXEL_COOKIE_NAMES) deleteCookie(name);
        // The other half of what the pixel left behind. Best-effort, and both
        // steps can fail: reading `window.localStorage` throws outright where
        // site data is blocked, which is a browser that has nothing of Meta's to
        // clear anyway. Nothing about the withdrawal depends on it — the cookie
        // above is the answer, and the reload below is what stops the script.
        try {
          clearPixelStorage(window.localStorage);
        } catch (error) {
          console.error("[consent] could not clear the pixel's storage", error);
        }
        // Deliberately no `setConsent`/`setIsOpen` before this: the document is
        // on its way out, and the banner's own committing flag is what keeps
        // its buttons disabled until it goes. A state update here would repaint
        // the page for the frames before the unload.
        window.location.reload();
        return;
      }

      setConsent(next);
      setIsOpen(false);
    },
    [consent],
  );

  const value = useMemo<ConsentContextValue>(
    () => ({ consent, isOpen, open, choose }),
    [consent, isOpen, open, choose],
  );

  return (
    <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>
  );
}

/**
 * The consent context, or `null` where no provider sits above.
 *
 * The nullable form exists for the footer's Privacy choices link, which renders
 * inside every route group's footer — including any render that has not been
 * wrapped yet. A link that cannot open the banner renders as nothing rather
 * than crashing the page it sits at the bottom of.
 */
export function useConsentOptional(): ConsentContextValue | null {
  return useContext(ConsentContext) ?? null;
}

/** The consent context. Throws outside a `ConsentProvider`. */
export function useConsent(): ConsentContextValue {
  const ctx = useContext(ConsentContext);
  if (ctx === undefined) {
    throw new Error("useConsent must be used within a ConsentProvider");
  }
  return ctx;
}
