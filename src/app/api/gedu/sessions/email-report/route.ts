import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/api/define-route";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTransactionalEmail } from "@/lib/brevo";
import {
  buildSessionReportEmail,
  sessionReportSubject,
} from "@/lib/email-templates/session-report";
import { getEmailTranslator } from "@/lib/email-templates/translator";
import { SENDER_EMAIL, SENDER_NAME, SUPPORT_EMAIL } from "@/lib/constants";
import { ROUTES } from "@/lib/constants/routes";
import { resolveLocale, type SupportedLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { formatDate, formatTimeRange } from "@/lib/utils";
import { getOrigin } from "@/lib/url";
import { ApiError } from "@/lib/api/api-error";
import {
  emailSessionReportBody,
  emailSessionReportResponse,
  sessionReportEmailClaim,
  SESSION_REPORT_ALREADY_SENT_SQLSTATE,
  SESSION_REPORT_NO_REPORT_SQLSTATE,
} from "@/services/gedu-sessions/gedu-sessions.contracts";
import type { ProductType } from "@/types";

const ROUTE_LABEL = "/api/gedu/sessions/email-report";

/** The service-role client, named so the helpers below can take one. */
type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * One recipient of one family mail — a seat resolved to somebody who can be
 * written to. `participationId` is what the link is keyed by and what a failure
 * is logged against; the address itself never reaches a log line.
 */
interface FamilyRecipient {
  participationId: string;
  /** The child, or the adult holding their own seat: whoever the mail is about. */
  gamerName: string;
  email: string;
  locale: SupportedLocale;
}

/** What every mail of one send shares, before any locale formatting. */
interface SessionFacts {
  sessionId: string;
  startsAt: string;
  endsAt: string;
  reportMarkdown: string;
  groupName: string;
  geduName: string;
  productId: string;
  productType: ProductType;
  productTimezone: string;
  productTranslations: { locale: string; name: string }[];
  origin: string;
}

/**
 * The roster RPC's ordering when a child has several parent links: earliest
 * `created_at` with NULLs last, then the link row's id. Mirrored rather than
 * approximated — the gedu's roster is where the confirm dialog's count comes
 * from, and the two have to name the same person.
 */
function earlierLink<T extends { created_at: string | null; id: string }>(
  a: T,
  b: T,
): T {
  if (a.created_at !== b.created_at) {
    if (a.created_at === null) return b;
    if (b.created_at === null) return a;
    return a.created_at < b.created_at ? a : b;
  }
  return a.id < b.id ? a : b;
}

/**
 * Give the session back: clear the stamp the claim wrote, so the gedu's button
 * returns and the send can be tried again.
 *
 * **Guarded on the exact timestamp that was claimed**, always — a release must
 * never undo a *different* send that landed in between. Every path that
 * abandons a claim goes through here, so there is one shape of the guard rather
 * than one per exit. `group_sessions` grants nothing to `authenticated` and
 * carries no policies, so this is the service-role client's to do.
 *
 * Its own failure is logged and swallowed: the caller is already on its way to
 * an error answer, and a claim left standing is a stuck button rather than a
 * lost mail.
 */
async function releaseClaim(
  adminClient: AdminClient,
  sessionId: string,
  claimedAt: string,
): Promise<void> {
  const { error } = await adminClient
    .from("group_sessions")
    .update({ report_emailed_at: null, report_emailed_by: null })
    .eq("id", sessionId)
    .eq("report_emailed_at", claimedAt);

  if (error) {
    console.error(
      `[${ROUTE_LABEL}] failed to release the claim on session ${sessionId}:`,
      error,
    );
  }
}

/**
 * The two fields a release needs, read off the raw RPC result without trusting
 * the rest of it. Only reached when the claim's own schema has already refused
 * the row: the stamp is written and committed by then, so the session has to be
 * handed back with whatever can still be read safely.
 */
function readClaimStamp(
  raw: unknown,
): { id: string; reportEmailedAt: string } | null {
  if (typeof raw !== "object" || raw === null) return null;
  if (!("id" in raw) || !("report_emailed_at" in raw)) return null;
  const { id, report_emailed_at: claimedAt } = raw;
  return typeof id === "string" && typeof claimedAt === "string"
    ? { id, reportEmailedAt: claimedAt }
    : null;
}

/**
 * All a family-mail failure may say about itself in a log line.
 *
 * The Brevo wrapper throws `new Error(body.message)` and the provider's message
 * can quote the address it rejected, so the reason is never passed through. The
 * class name is a value this route controls; the provider's full reply is
 * already logged, body and all, by the wrapper itself.
 */
function failureName(reason: unknown): string {
  return reason instanceof Error ? reason.name : typeof reason;
}

/**
 * POST /api/gedu/sessions/email-report
 *
 * The gedu presses **Send to parents** on a past session's card, and this route
 * mails that session's report to every family in the group — one mail per active
 * participation, each in its reader's locale, each linking that child's own page
 * in My SOG — and then one copy to the gedu with every admin in CC.
 *
 * **The claim is the authorization.** The first thing that happens is a write:
 * `claim_group_session_report_email`, on the USER-bound client, stamps
 * `report_emailed_at` — and it does so only for the gedu assigned to the group,
 * only when a report is actually written, and only when nobody has sent it yet.
 * Succeeding proves the caller may do this, which is what lets the recipient
 * resolution below run on the admin client without a second gate; and because
 * the claim is one guarded UPDATE, two tabs cannot both send.
 *
 * **The claim is committed before anything is sent, so every way out of the
 * window between them hands it back.** A group that will not read, an admin
 * list that errors, a roster query that times out, a claim row that fails its
 * own schema: each of those would otherwise leave a session stamped as emailed
 * with not one family mailed, and the next press would be told it had already
 * been sent. So the whole window is wrapped, and a throw releases the claim
 * before it becomes the answer.
 *
 * **A send the user asked for is the outcome, so its failure is the answer.** If
 * every family mail fails, the claim is released and the route answers 502:
 * nobody received anything and the gedu may retry. If only some fail, the claim
 * stands — the families who did receive it must not receive it twice — and the
 * counts come back in the 200. That is the deliberate opposite of the follow-on
 * mails, which swallow their failures by rule. The staff copy is the one part
 * here that still swallows: it is the record, not the outcome.
 *
 * **The gedu is never told who was mailed.** The addresses and locales the admin
 * client reads (a child's linked parent, every admin) sit outside the caller's
 * own view; nothing read here is echoed back, only counted.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: ["gedu"],
  // Mailing every family in a group is a trust boundary. Group assignment
  // already implies an admin certified the educator, so this declares the
  // posture rather than narrowing who gets through.
  requireCertifiedGedu: true,
  body: emailSessionReportBody,
  response: emailSessionReportResponse,

  handler: async ({ request, supabase, profile, body }) => {
    // --- 1. Claim the send -------------------------------------------------
    const { data: claimed, error: claimError } = await supabase.rpc(
      "claim_group_session_report_email",
      { p_group_id: body.groupId, p_session_date: body.sessionDate },
    );

    if (claimError) {
      // Two refusals the gedu can act on, told apart by SQLSTATE rather than by
      // message: a reworded RAISE must never silently reclassify one. Answered
      // here rather than through the shared error table because that table maps
      // a code to a status, and these two share a status while needing
      // different things said about them.
      if (claimError.code === SESSION_REPORT_NO_REPORT_SQLSTATE) {
        return NextResponse.json(
          {
            error: "This session has no saved report to email.",
            code: SESSION_REPORT_NO_REPORT_SQLSTATE,
          },
          { status: 409 },
        );
      }
      if (claimError.code === SESSION_REPORT_ALREADY_SENT_SQLSTATE) {
        return NextResponse.json(
          {
            error: "This session's report has already been emailed.",
            code: SESSION_REPORT_ALREADY_SENT_SQLSTATE,
          },
          { status: 409 },
        );
      }
      // Everything else takes the shared table: a 42501 (not this gedu's group)
      // becomes a 403, anything unexpected a logged, generic 500.
      throw claimError;
    }

    // The service-role client from here down. What it reads is the group's
    // families' addresses and locales and every admin's address — none of it in
    // an educator's own view, and none of it returned to them. Created before
    // the parse because the parse is itself inside the claimed window: the row
    // is already stamped, so even a shape this route cannot read has to be
    // handed back.
    const adminClient = createAdminClient();

    const parsedClaim = sessionReportEmailClaim.safeParse(claimed);
    if (!parsedClaim.success) {
      const stamp = readClaimStamp(claimed);
      if (stamp) {
        await releaseClaim(adminClient, stamp.id, stamp.reportEmailedAt);
      } else {
        // Nothing to guard a release on. Logged loudly rather than guessed at:
        // clearing the stamp unguarded could undo a send that did happen.
        console.error(
          `[${ROUTE_LABEL}] the claim result carried no readable id and timestamp, so the stamp could not be released`,
        );
      }
      throw parsedClaim.error;
    }

    const claim = parsedClaim.data;

    try {
      // --- 2. Resolve the recipients ---------------------------------------
      const { data: group, error: groupError } = await adminClient
        .from("product_groups")
        .select(
          "name, product:products!inner(id, product_type, timezone, product_translations(locale, name))",
        )
        .eq("id", claim.group_id)
        .single();

      if (groupError) {
        // The claim already proved this group exists and that the caller teaches
        // it, so a miss here is a broken invariant rather than a bad request —
        // a logged 500, not the 404 the shared table would give PGRST116.
        throw new ApiError(
          `claimed session ${claim.id} has no readable group: ${groupError.message}`,
          500,
        );
      }

      const { data: admins, error: adminsError } = await adminClient
        .from("profiles")
        .select("email")
        .eq("role", "admin");

      if (adminsError) throw adminsError;

      const { data: participations, error: participationsError } =
        await adminClient
          .from("participations")
          .select(
            "id, participant_id, customer_id, participant:profiles!participations_participant_id_fkey!inner(first_name, email, role, locale)",
          )
          .eq("group_id", claim.group_id)
          .eq("status", "active");

      if (participationsError) throw participationsError;

      // A seat whose holder is not their own paying customer belongs to
      // somebody's child, and the contact is the parent linked earliest. Read
      // for every seat in one trip rather than per seat — a group is a handful
      // of rows — and not at all when there are no seats: an `IN ()` over an
      // empty list is a round trip whose answer is already known.
      const parentLinks =
        participations.length === 0
          ? []
          : await readParentLinks(
              adminClient,
              participations.map((participation) => participation.participant_id),
            );

      const earliestParent = new Map<string, (typeof parentLinks)[number]>();
      for (const link of parentLinks) {
        const held = earliestParent.get(link.gamer_id);
        earliestParent.set(
          link.gamer_id,
          held === undefined ? link : earlierLink(held, link),
        );
      }

      const recipients: FamilyRecipient[] = [];
      let skipped = 0;

      for (const participation of participations) {
        const participant = participation.participant;

        // The roster RPC's exact test for "an adult holding their own seat",
        // role check included. Id equality alone would let a row with a gamer's
        // id transposed into `customer_id` put the synthetic
        // `@gamer.sogverse.internal` handle — which is not a mailbox — in front
        // of a family mail. The roster is also where the confirm dialog counts
        // the seats it is about to mail, so the two resolutions have to be one.
        const isSelfSeat =
          participation.participant_id === participation.customer_id &&
          participant.role === "customer";

        const contact = isSelfSeat
          ? { email: participant.email, locale: participant.locale }
          : earliestParent.get(participation.participant_id)?.parent;

        if (!contact) {
          // Neither a linked parent nor an adult's own address. Counted, not
          // failed: nothing went wrong with a send that never had a destination,
          // and the staff copy is how that gap reaches a human.
          skipped += 1;
          continue;
        }

        recipients.push({
          participationId: participation.id,
          gamerName: participant.first_name,
          email: contact.email,
          locale: resolveLocale(contact.locale),
        });
      }

      // --- 3. The family mails, all at once --------------------------------
      const facts: SessionFacts = {
        sessionId: claim.id,
        startsAt: claim.starts_at,
        endsAt: claim.ends_at,
        reportMarkdown: claim.report,
        groupName: group.name,
        geduName: profile.first_name,
        productId: group.product.id,
        productType: group.product.product_type,
        productTimezone: group.product.timezone,
        productTranslations: group.product.product_translations,
        // The TRUSTED origin, never the raw Host header: these links go to
        // families who have every reason to trust them.
        origin: getOrigin(request),
      };

      // Settled together, so one rejection does not stop the rest and the whole
      // fan-out costs one Brevo round trip of wall time rather than N.
      const outcomes = await Promise.allSettled(
        recipients.map((recipient) => sendFamilyMail(recipient, facts)),
      );

      let sent = 0;
      let failed = 0;
      outcomes.forEach((outcome, index) => {
        if (outcome.status === "fulfilled") {
          sent += 1;
          return;
        }
        failed += 1;
        // Ids and a class name, never an address and never the provider's own
        // words: the session and the seat are enough to find the family in the
        // admin UI, and Brevo's message can quote the mailbox it rejected. The
        // full provider reply is already in the log — the Brevo wrapper prints
        // the response body itself before it throws.
        console.error(
          `[${ROUTE_LABEL}] family mail failed for session ${facts.sessionId}, participation ${recipients[index].participationId}: ${failureName(outcome.reason)}`,
        );
      });

      // --- 4. Nobody got it → release the claim ----------------------------
      if (sent === 0 && failed > 0) {
        await releaseClaim(adminClient, claim.id, claim.report_emailed_at);

        return NextResponse.json(
          {
            error:
              "No family received the report — every email failed to send. Nothing was recorded; please try again.",
          },
          { status: 502 },
        );
      }

      // --- 5. The staff copy ------------------------------------------------
      //
      // One mail, not one per family: the gedu keeps a record of what went out
      // and the admins can see reports reaching families, at a seventh of the
      // inbox noise a BCC on every send would cost. Its failure is logged and
      // changes nothing — the families are the outcome, this is the record.
      try {
        await sendStaffCopy({
          facts,
          geduEmail: profile.email,
          geduLocale: resolveLocale(profile.locale),
          adminEmails: admins.map((admin) => admin.email),
        });
      } catch (error) {
        console.error(
          `[${ROUTE_LABEL}] staff copy failed for session ${facts.sessionId}:`,
          error,
        );
      }

      return { sent, failed, skipped };
    } catch (error) {
      // Anything that threw between the stamp and the tally leaves a session
      // marked as emailed with nobody mailed, so the claim goes back before the
      // failure becomes the answer. The 502 above has already returned by this
      // point, so a released claim is never released twice.
      await releaseClaim(adminClient, claim.id, claim.report_emailed_at);
      throw error;
    }
  },
});

/**
 * Every parent link for a set of children, with the parent profile embedded.
 * A function rather than an inline read so the empty-roster case can skip it
 * without the call site having to name the row shape the select produces.
 */
async function readParentLinks(adminClient: AdminClient, gamerIds: string[]) {
  const { data, error } = await adminClient
    .from("parent_gamer")
    .select(
      "id, gamer_id, created_at, parent:profiles!parent_gamer_parent_id_fkey!inner(email, locale)",
    )
    .in("gamer_id", gamerIds);

  if (error) throw error;
  return data;
}

/**
 * One family's mail. Everything locale-shaped is resolved here, per recipient:
 * the translator, the product's name in their locale, and the date and time
 * range — in the PRODUCT's zone, with the zone named, because a mail is rendered
 * without the reader's own zone and has to say which one it used.
 *
 * Every value that a person typed reaches the HTML escaped: the builder runs the
 * names through `styledName`/`styledProductName` and the facts through
 * `escapeHtml`, and the report goes through the markdown renderer, which escapes
 * every text node and drops links. The one thing embedded raw is the URL, which
 * this function builds.
 */
async function sendFamilyMail(
  recipient: FamilyRecipient,
  facts: SessionFacts,
): Promise<void> {
  const t = await getEmailTranslator(recipient.locale);
  const productName =
    resolveTranslation(facts.productTranslations, recipient.locale)?.name ?? "";

  const params = {
    gamerName: recipient.gamerName,
    geduName: facts.geduName,
    productName,
    groupName: facts.groupName,
    sessionDate: formatDate(facts.startsAt, recipient.locale, {
      dateStyle: "full",
      timeZone: facts.productTimezone,
    }),
    sessionTime: formatTimeRange(
      facts.startsAt,
      facts.endsAt,
      recipient.locale,
      facts.productTimezone,
    ),
    reportMarkdown: facts.reportMarkdown,
    // Keyed by participation, not by product: two siblings in one club have two
    // pages, and this mail is about one of them. Always the `/parent` root —
    // every recipient here is an adult, including one on a seat of their own.
    productUrl: `${facts.origin}${ROUTES.customer.enrollment(facts.productType, recipient.participationId)}`,
  };

  await sendTransactionalEmail({
    fromEmail: SENDER_EMAIL,
    fromName: SENDER_NAME,
    toEmail: recipient.email,
    subject: sessionReportSubject(t, params),
    htmlContent: buildSessionReportEmail(t, recipient.locale, params),
    // Product mail to a family: a parent who replies has a question for us, not
    // for the unattended sending address.
    replyToEmail: SUPPORT_EMAIL,
    // No cc and no bcc, by omission and asserted in the integration test: a
    // parent's mail is theirs alone.
  });
}

/**
 * The same template once more, for the people who sent it. The group's name
 * takes the child's slot in the intro ("here's Marianne's report from
 * Kettukallio"), and the link is the gedu workspace's page for the PRODUCT — the
 * gedu routes are keyed by product, and the page resolves the gedu's own group.
 */
async function sendStaffCopy({
  facts,
  geduEmail,
  geduLocale,
  adminEmails,
}: {
  facts: SessionFacts;
  geduEmail: string;
  geduLocale: SupportedLocale;
  adminEmails: string[];
}): Promise<void> {
  const t = await getEmailTranslator(geduLocale);
  const productName =
    resolveTranslation(facts.productTranslations, geduLocale)?.name ?? "";

  const params = {
    gamerName: facts.groupName,
    geduName: facts.geduName,
    productName,
    groupName: facts.groupName,
    sessionDate: formatDate(facts.startsAt, geduLocale, {
      dateStyle: "full",
      timeZone: facts.productTimezone,
    }),
    sessionTime: formatTimeRange(
      facts.startsAt,
      facts.endsAt,
      geduLocale,
      facts.productTimezone,
    ),
    reportMarkdown: facts.reportMarkdown,
    productUrl: `${facts.origin}${ROUTES.gedu.assignedProduct(facts.productType, facts.productId)}`,
  };

  await sendTransactionalEmail({
    fromEmail: SENDER_EMAIL,
    fromName: SENDER_NAME,
    toEmail: geduEmail,
    cc: adminEmails,
    subject: sessionReportSubject(t, params),
    htmlContent: buildSessionReportEmail(t, geduLocale, params),
    // Product mail, so the support inbox as everywhere else — an admin reading
    // the copy who hits reply is asking us something, not writing to the gedu.
    replyToEmail: SUPPORT_EMAIL,
  });
}
