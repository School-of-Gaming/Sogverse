import "server-only";
import type {
  AdvertisedProductDetails,
  ConversionAccount,
  ReportedEnrolmentOutcome,
} from "@/lib/marketing-events";
import { reportMetaConversion } from "@/lib/meta-conversions.server";
import { reportRedditConversion } from "@/lib/reddit-conversions.server";

/**
 * A conversion our servers report, handed once to every advertising platform.
 *
 * **One call per conversion, every platform behind it.** A route names what it
 * committed and hands it here, so a route cannot report to one platform and
 * forget another, and a new platform is one line below rather than an edit to
 * every caller. The product arrives already described in each platform's
 * fields by `advertisedProductDetails()`, so the platforms are told the same
 * facts about it.
 *
 * Each platform's reporter applies the gates itself — its own switch, the
 * request's consent cookie — and never throws, so one platform refusing,
 * timing out or being switched off changes nothing about another's report.
 * Callers hand this to `after()`, so the response has already gone out.
 *
 * The rules for what each event means and carries live in the reporters and
 * in `@/lib/marketing-events`; this type only has the words a route needs.
 *
 * `eventId` is the id the browser minted for the same moment and sent in the
 * request body (`conversionEventIdValue`), which it pushes its own event under
 * once the route has answered — so a container tag's browser event and this
 * report are one conversion to each platform. Absent, one is minted here, once
 * for every platform. It is untrusted input and is only ever a dedup key.
 *
 * The last three are the browser's own moments — a marketing page reached, a
 * product page's product shown, the click into the sign-up flow — reported
 * here as the server twins of the pushes the browser has already made
 * (`/api/page-events`). They always carry the browser's id, since a twin with
 * no browser event to match has nothing to be the twin of.
 */
export type AdConversion =
  | {
      event: "account_created";
      product?: AdvertisedProductDetails;
      sourcePath: string;
      eventId?: string;
    }
  | {
      event: "child_added";
      product: AdvertisedProductDetails;
      sourcePath: string;
      eventId?: string;
    }
  | {
      event: "enrolment";
      outcome: ReportedEnrolmentOutcome;
      product: AdvertisedProductDetails;
      sourcePath: string;
      eventId?: string;
    }
  | {
      event: "page_view";
      sourcePath: string;
      eventId: string;
    }
  | {
      event: "product_view" | "checkout_start";
      product: AdvertisedProductDetails;
      sourcePath: string;
      eventId: string;
    };

export async function reportAdConversion(
  request: Request,
  conversion: AdConversion,
  account: ConversionAccount,
): Promise<void> {
  const eventId = conversion.eventId ?? crypto.randomUUID();
  await Promise.all([
    reportMetaConversion(
      request,
      forPlatform(conversion, "meta", eventId),
      account,
    ),
    reportRedditConversion(
      request,
      forPlatform(conversion, "reddit", eventId),
      account,
    ),
  ]);
}

/** The same conversion, with the product in one platform's fields. */
function forPlatform<Platform extends keyof AdvertisedProductDetails>(
  conversion: AdConversion,
  platform: Platform,
  eventId: string,
) {
  const { sourcePath } = conversion;
  switch (conversion.event) {
    case "account_created":
      return {
        event: conversion.event,
        product: conversion.product?.[platform],
        sourcePath,
        eventId,
      };
    case "enrolment":
      return {
        event: conversion.event,
        outcome: conversion.outcome,
        product: conversion.product[platform],
        sourcePath,
        eventId,
      };
    case "page_view":
      return { event: conversion.event, sourcePath, eventId };
    case "child_added":
    case "product_view":
    case "checkout_start":
      return {
        event: conversion.event,
        product: conversion.product[platform],
        sourcePath,
        eventId,
      };
  }
}
