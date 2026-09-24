"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { deleteCookie, setCookie } from "@/lib/cookies";
import {
  advertisingCookieNames,
  CONSENT_COOKIE_NAME,
  CONSENT_MAX_AGE_SECONDS,
  clearAdvertisingStorage,
  consentForChoice,
  isWithdrawal,
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

/**
 * Take away everything an advertising script left on this browser: its cookies,
 * and what either vendor keeps in web storage.
 *
 * Both stores are swept although only one of them has ever been seen to hold
 * anything. They are blocked together, cleared together and cost one call
 * each, so sweeping the pair is what stops the empty one from being a standing
 * promise to go and look at a real browser again.
 *
 * Both callers below hand it the same job, so it is one function rather than
 * two copies — and the failure is owned here because it is the same failure
 * either way. Reading either store **throws outright** where site data is
 * blocked, which is a browser that has nothing stored to clear anyway, so the
 * cookies above it are already done by the time it can fail and nothing either
 * caller does depends on it.
 */
function clearAdvertisingTraces(): void {
  // Read back off the document rather than expired from a fixed list: the
  // container's analytics cookies carry a property id in their names.
  for (const name of advertisingCookieNames(document.cookie)) {
    deleteCookie(name);
  }
  try {
    clearAdvertisingStorage(window.localStorage);
    clearAdvertisingStorage(window.sessionStorage);
  } catch (error) {
    console.error(
      "[consent] could not clear the advertising scripts' storage",
      error,
    );
  }
}

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
      // purpose that was granted and is now refused takes the advertising
      // scripts' own cookies and stored state with it and reloads. Granting a
      // purpose needs none of that:
      // the gated components mount and the scripts arrive.
      if (isWithdrawal(consent, next)) {
        // Best-effort and immediate, which is the half of the pair this one
        // can be: it races the very scripts it is clearing up after. A tag
        // container writes its session cookie on activity, including as the
        // page is torn down, so a name expired here can be written straight
        // back before the reload lands. Worth doing all the same — it narrows
        // the window to a few hundred milliseconds, and for the pixel, which
        // does not rewrite on unload, it is the whole of the clean-up. The
        // guarantee is the mount effect below, in the document after this one.
        clearAdvertisingTraces();
        // Deliberately no `setConsent`/`setIsOpen` before this: the document is
        // on its way out, and the banner's own committing flag is what keeps
        // its buttons disabled until it goes. A state update here would repaint
        // the page for the frames before the unload.
        window.location.reload();
        return;
      }

      // Nothing was taken away, so this document keeps everything it already
      // has and the state update is the whole of what an addition needs: the
      // gated components mount, and each script is handed the new answer as it
      // loads. Nothing has to be told anything after the fact — an advertising
      // script only ever runs here under the fullest answer, so an addition is
      // always an addition to a document that had none of them running.
      setConsent(next);
      setIsOpen(false);
    },
    [consent],
  );

  // **Advertising cookies may exist only in a document where marketing is
  // granted**, and this is where that is made true rather than hoped for.
  //
  // It is stated as a standing invariant, checked on every mount, instead of as
  // a step bolted onto the withdrawal above, because the withdrawal cannot win
  // its own race: it runs while the scripts are still in the document, and a
  // tag container rewrites its session cookie on the way out, after the
  // deletion and before the reload. Here there is nothing to race — marketing
  // is not granted, so the components that load those scripts loaded none of
  // them, and no code of either vendor's is running to put anything back.
  //
  // Two things fall out of it that the withdrawal path never covered. Cookies
  // already stranded on real browsers by that race are cleared on the visitor's
  // next page, with nothing to migrate; and so are cookies this app never set,
  // which matters because the legacy sog.gg site does not gate its tags behind
  // consent and writes on the registrable domain our pages can read and expire.
  //
  // Not granted covers a refusal, analytics-only, *and* a visitor who has not
  // answered yet — the answer is only ever `marketing: true` or nothing doing.
  // The inverse is the part that would be dangerous to get wrong: where
  // marketing *is* granted the scripts are about to run in this very document,
  // and clearing here would be clearing their state out from under them.
  //
  // React runs child effects before parent effects, so the gated components'
  // effects have already run by the time this one does. That is safe rather
  // than lucky, and it is not an ordering to "fix": those components load a
  // script only when marketing is `true`, this clears only when it is not, so
  // no document can ever see both act.
  const marketingGranted = consent?.marketing === true;
  useEffect(() => {
    if (marketingGranted) return;
    clearAdvertisingTraces();
  }, [marketingGranted]);

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
