import type { Metadata } from "next";
import { CalendarClock } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { SeatOfferResponse } from "@/components/seat-offer/seat-offer-response";
import { SUPPORT_EMAIL } from "@/lib/constants";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/lib/constants/locales";
import { SEAT_OFFER_WINDOW_DAYS } from "@/lib/constants/seat-offer";
import { resolveSeatOfferLink } from "@/lib/seat-offer.server";
import { formatDate } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return {
    title: t("seatOffer"),
    // A one-shot landing page carrying a token in its URL has nothing to index
    // and every reason not to be crawled.
    robots: { index: false, follow: false },
  };
}

/**
 * Landing page for the seat-offer email link (`/seat-offer?token=…`).
 *
 * **Nothing happens on the GET, and that is the one thing this page has that
 * `/verify-email` does not.** That page redeems its token during render because
 * the write is idempotent and grants nothing, so a mail scanner following the
 * link loses nobody anything. Accepting a seat grants something and cannot be
 * undone by clicking again, so the answers are POSTs behind buttons the family
 * presses themselves.
 *
 * Public and session-agnostic: the signed token is the authorization, so the
 * page renders identically for a reader who is signed out, signed in, or —
 * the case that actually happens on a family tablet — signed in as their own
 * child. It is in the proxy's public list and PIN-exempt for that reason.
 *
 * **The state is resolved here, before the first frame**, so a dead link says
 * so immediately rather than asking a question and then taking it back. The
 * respond route repeats every check, so this is the UI gate and nothing more.
 */
export default async function SeatOfferPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[]; answer?: string | string[] }>;
}) {
  const { token, answer } = await searchParams;
  // A repeated `?token=a&token=b` is not a token — the same idiom the other two
  // token landing pages use, which rejects that case for free.
  const tokenStr = typeof token === "string" ? token : null;

  const rawLocale = await getLocale();
  const locale = isSupportedLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const state = await resolveSeatOfferLink(tokenStr, locale);

  if (state.kind !== "offer") {
    const t = await getTranslations("seatOffer");
    return (
      <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <CalendarClock className="h-12 w-12 text-muted-foreground" />
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">{t("invalid.title")}</h1>
          <p className="text-muted-foreground">
            {t("invalid.body", {
              days: SEAT_OFFER_WINDOW_DAYS,
              supportEmail: SUPPORT_EMAIL,
            })}
          </p>
        </div>
      </div>
    );
  }

  return (
    <SeatOfferResponse
      // `tokenStr` is non-null on this branch — `resolveSeatOfferLink` answers
      // `invalid` for a null token, and that branch returned above.
      token={tokenStr ?? ""}
      participantName={state.participantName}
      isSelfSeat={state.isSelfSeat}
      productName={state.productName}
      // The product's zone, with the zone named, matching the mail exactly. A
      // page could use the reader's own zone and the mail cannot; two different
      // clock faces for one deadline is worse than one that is explicit about
      // which zone it is in. Explicit components rather than dateStyle, because
      // `Intl` refuses to combine that with `timeZoneName`.
      deadline={formatDate(state.deadline, locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
        timeZone: state.timeZone,
      })}
      initialIntent={answer === "accept" || answer === "decline" ? answer : null}
    />
  );
}
