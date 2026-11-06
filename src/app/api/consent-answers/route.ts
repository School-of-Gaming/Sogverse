import { after } from "next/server";
import {
  consentAnswerBody,
  type ConsentAnswerBody,
} from "@/lib/consent-answers.contracts";
import { reportableMarketingPage } from "@/lib/marketing-pages";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/consent-answers
 *
 * **The cookie banner's tally.** The banner posts a device's first answer here
 * and this counts it: one more for that answer, on today's UTC day, on that
 * page. Nothing else is stored — no IP, no user agent, no cookie, no session,
 * no account — so the count says how many and never who. That is why it needs
 * no consent of its own, and why it is the one request a refusal makes.
 *
 * **Nothing in the body is trusted beyond its shape.** The answer has to be one
 * of the four; the page is counted under its locale-stripped internal path only
 * when the marketing-page helpers accept it, and under no page otherwise, so a
 * forged path can add a count but never name a page the allowlist does not.
 * Forging counts is open to anyone and accepted: there is no rate limit.
 *
 * **One answer, whatever happened: 204, at once.** The count is written after
 * the response, so a malformed body, a failed write and a counted answer all
 * look the same. The banner fires this and forgets it.
 */
export async function POST(request: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return noContent();
  }
  const parsed = consentAnswerBody.safeParse(raw);
  if (parsed.success) {
    const body = parsed.data;
    after(async () => {
      try {
        await countConsentAnswer(body);
      } catch (error) {
        console.error("[consent-answers] could not count the answer", error);
      }
    });
  }
  return noContent();
}

function noContent(): Response {
  return new Response(null, { status: 204 });
}

async function countConsentAnswer(body: ConsentAnswerBody): Promise<void> {
  const page = reportableMarketingPage(body.pagePath);
  const { error } = await createAdminClient().rpc("count_consent_answer", {
    p_answer: body.answer,
    p_page: page?.internalPath,
  });
  if (error) throw error;
}
