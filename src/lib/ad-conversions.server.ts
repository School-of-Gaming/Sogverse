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
 */
export type AdConversion =
  | {
      event: "account_created";
      product?: AdvertisedProductDetails;
      sourcePath: string;
    }
  | {
      event: "enrolment";
      outcome: ReportedEnrolmentOutcome;
      product: AdvertisedProductDetails;
      sourcePath: string;
    };

export async function reportAdConversion(
  request: Request,
  conversion: AdConversion,
  account: ConversionAccount,
): Promise<void> {
  await Promise.all([
    reportMetaConversion(request, forPlatform(conversion, "meta"), account),
    reportRedditConversion(request, forPlatform(conversion, "reddit"), account),
  ]);
}

/** The same conversion, with the product in one platform's fields. */
function forPlatform<Platform extends keyof AdvertisedProductDetails>(
  conversion: AdConversion,
  platform: Platform,
) {
  const { sourcePath } = conversion;
  return conversion.event === "account_created"
    ? {
        event: conversion.event,
        product: conversion.product?.[platform],
        sourcePath,
      }
    : {
        event: conversion.event,
        outcome: conversion.outcome,
        product: conversion.product[platform],
        sourcePath,
      };
}
