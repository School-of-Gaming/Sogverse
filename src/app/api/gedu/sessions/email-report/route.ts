import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/api/define-route";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTransactionalEmail } from "@/lib/brevo";
import {
  buildSessionReportEmail,
  sessionReportSubject,
} from "@/lib/email-templates/session-report";
import type { SessionReportPhoto } from "@/lib/email-templates/session-photos";
import { sessionImageUrl } from "@/lib/images/session-image-url";
import { getEmailTranslator } from "@/lib/email-templates/translator";
import { SENDER_EMAIL, SENDER_NAME, SUPPORT_EMAIL } from "@/lib/constants";
import { ROUTES } from "@/lib/constants/routes";
import {
  DEFAULT_LOCALE,
  resolveLocale,
  type SupportedLocale,
} from "@/lib/constants/locales";
import {
  resolveFamilyRecipients,
  type FamilyRecipient,
} from "@/lib/email/family-recipients.server";
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
 * One family mail to send — a seat, and one of the people it resolved to.
 * `participationId` is what the link is keyed by and what a failure is logged
 * against; the address itself never reaches a log line.
 *
 * A seat produces one of these per recipient: always the parent (or the adult
 * on their own seat), plus the child when they hold a mailbox of their own. The parent's is the *outcome* — it is what the tally counts and
 * what decides whether the claim stands — and the child's copy rides beside
 * it: logged if it fails, never counted, never a reason to retry the send.
 */
interface SeatMail {
  participationId: string;
  /** The child, or the adult holding their own seat: whoever the mail is about. */
  gamerName: string;
  recipient: FamilyRecipient;
}

/** What every mail of one send shares, before any locale formatting. */
interface SessionFacts {
  sessionId: string;
  startsAt: string;
  endsAt: string;
  reportMarkdown: string;
  groupName: string;
  /**
   * Whoever pressed the button, by first name — the gedu who taught the
   * session, or the admin who sent on their behalf. It is the *sender*, not the
   * report's author: the mail says "here is the report from X", and a wrong
   * name there is a claim about a person rather than a cosmetic slip. Since the
   * claim RPC admits both roles, this is now honestly whichever of them made
   * the send.
   */
  geduName: string;
  productId: string;
  productType: ProductType;
  productTimezone: string;
  productTranslations: { locale: string; name: string }[];
  /**
   * The session's photos as the mail needs them, resolved once for the whole
   * send: the family mails and the staff copy carry the same pictures, because
   * the copy is the same mail behind a banner.
   *
   * **This is the snapshot.** What is here is what the session had at the
   * moment the button was pressed; a photo added afterwards retriggers nothing
   * and a photo removed afterwards simply stops loading, inside a box the
   * template reserved from the stored dimensions rather than from the picture.
   */
  photos: SessionReportPhoto[];
  origin: string;
}

/**
 * The roster RPC's ordering when a child has several parent links: earliest
 * `created_at` with NULLs last, then the link row's id. Mirrored rather than
 * approximated — the gedu's roster shows the contact each seat resolves to, and
 * the mail has to reach the same person the roster names.
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
 * in My SOG — and then one copy to the sender with every admin in CC.
 *
 * **A child with a mailbox of their own gets their own copy too**, beside the
 * parent's and never instead of it. Who that is, is decided by the shared
 * family-recipient resolver (the real-email sign-in, whether or not the address
 * has been verified); what changes in the mail is the framing sentence and the
 * My SOG root, since a `/parent` link bounces a signed-in child. The child's copy is not part of the tally: the
 * parent's mail is the outcome the gedu is told about, and the copy's failure
 * is logged and changes nothing.
 *
 * **An admin may press it too** (00200). The same panel now sits on the admin
 * product page, over the same feed component and the same claim, so the route
 * admits both roles. Nothing about the family mail changes: an admin sending is
 * an admin sending *this group's* report, and the families receive exactly what
 * they would have. Three things follow the sender rather than the role, and are
 * handled below: the name the mail is signed with, the staff copy's address
 * list (an admin is already in the CC, so they are not also the To), and the
 * link at the foot of the staff copy, which points at whichever surface the
 * sender can actually open.
 *
 * **The claim is the authorization.** The first thing that happens is a write:
 * `claim_group_session_report_email`, on the USER-bound client, stamps
 * `report_emailed_at` — and it does so only for an admin or the gedu assigned
 * to the group, only when a report is actually written, and only when nobody
 * has sent it yet. Succeeding proves the caller may do this, which is what lets
 * the recipient resolution below run on the admin client without a second gate;
 * and because the claim is one guarded UPDATE, two tabs cannot both send.
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
 * **The sender is never told who was mailed.** The addresses and locales the
 * admin client reads (a child's linked parent, every admin) sit outside a
 * gedu's own view; nothing read here is echoed back, only counted. An admin
 * could read all of it elsewhere, which is not a reason to start returning it
 * from a route whose answer is a tally.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: ["gedu", "admin"],
  // Mailing every family in a group is a trust boundary. Group assignment
  // already implies an admin certified the educator, so this declares the
  // posture rather than narrowing who gets through. The gate applies the
  // certification test only to a caller whose role is `gedu`, so adding admin
  // above widens the roles without weakening anything for educators.
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
          // The participant's sign-in mode rides along because it decides
          // whether the child gets a copy of their own; `gamer_profiles` is
          // one-to-one off `profiles`, so the embed is an object or null (an
          // adult on their own seat has none).
          .select(
            "id, participant_id, customer_id, participant:profiles!participations_participant_id_fkey!inner(first_name, email, role, locale, gamer_profiles(sign_in))",
          )
          .eq("group_id", claim.group_id)
          .eq("status", "active");

      if (participationsError) throw participationsError;

      // The session's photos, in the order every surface shows them —
      // `(created_at, id)`, the same ordering the feed RPCs apply, with the id
      // breaking a sub-tick tie. Read here rather than carried on the claim
      // because the claim is one guarded UPDATE on the session row and has no
      // business growing a join.
      //
      // A read that fails takes the whole send with it, and that is deliberate:
      // the mail is a snapshot and there is no second one, so quietly mailing a
      // photo-less report would lose those pictures for every family
      // permanently. Throwing releases the claim and hands the button back.
      const { data: images, error: imagesError } = await adminClient
        .from("group_session_images")
        .select("id, width, height")
        .eq("session_id", claim.id)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });

      if (imagesError) throw imagesError;

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

      const mails: SeatMail[] = [];
      let skipped = 0;

      for (const participation of participations) {
        const participant = participation.participant;

        // The roster RPC's exact test for "an adult holding their own seat",
        // role check included. Id equality alone would let a row with a gamer's
        // id transposed into `customer_id` put a child's platform-internal
        // handle — which is not a mailbox — in front of a family mail. The
        // roster also shows the gedu which contact each seat resolves to, so
        // the two resolutions have to be one.
        const isSelfSeat =
          participation.participant_id === participation.customer_id &&
          participant.role === "customer";

        const parentLink = earliestParent.get(participation.participant_id);

        // The parent first, always; the child only behind the resolver's
        // own-mailbox gate; nobody at all when there is no parent.
        const recipients = resolveFamilyRecipients({
          parents: isSelfSeat
            ? [
                {
                  email: participant.email,
                  firstName: participant.first_name,
                  locale: participant.locale,
                },
              ]
            : parentLink
              ? [
                  {
                    email: parentLink.parent.email,
                    firstName: parentLink.parent.first_name,
                    locale: parentLink.parent.locale,
                  },
                ]
              : [],
          gamer: isSelfSeat
            ? null
            : {
                email: participant.email,
                firstName: participant.first_name,
                locale: participant.locale,
                signIn: participant.gamer_profiles?.sign_in ?? null,
              },
          fallbackLocale: DEFAULT_LOCALE,
        });

        if (recipients.length === 0) {
          // Neither a linked parent nor an adult's own address. Counted, not
          // failed: nothing went wrong with a send that never had a destination,
          // and the staff copy is how that gap reaches a human.
          skipped += 1;
          continue;
        }

        for (const recipient of recipients) {
          mails.push({
            participationId: participation.id,
            gamerName: participant.first_name,
            recipient,
          });
        }
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
        // Resolved here rather than in the builder, which by rule composes no
        // URLs of its own. The bucket is public and the object's unguessable
        // name is the credential — an email client fetches an image with a bare
        // GET, so this URL has to work with no session behind it, and it is the
        // same URL the app renders.
        //
        // Its origin is the SUPABASE one, not the request's: unlike the links
        // below, an image src carries no token and sends the reader nowhere, so
        // there is nothing for a spoofed Host to steal and nothing to derive
        // from one.
        photos: images.map((image) => ({
          src: sessionImageUrl(image.id),
          width: image.width,
          height: image.height,
        })),
        // The TRUSTED origin, never the raw Host header: these links go to
        // families who have every reason to trust them.
        origin: getOrigin(request),
      };

      // Settled together, so one rejection does not stop the rest and the whole
      // fan-out costs one Brevo round trip of wall time rather than N.
      const outcomes = await Promise.allSettled(
        mails.map((mail) => sendFamilyMail(mail, facts)),
      );

      // The tally counts seats, through the parent's mail: a child's own copy
      // is neither a success to report nor a failure to retry the send over,
      // so it is logged on failure and otherwise left out of the numbers.
      let sent = 0;
      let failed = 0;
      outcomes.forEach((outcome, index) => {
        const { recipient, participationId } = mails[index];
        if (outcome.status === "fulfilled") {
          if (recipient.kind === "parent") sent += 1;
          return;
        }
        if (recipient.kind === "parent") failed += 1;
        // Ids and a class name, never an address and never the provider's own
        // words: the session and the seat are enough to find the family in the
        // admin UI, and Brevo's message can quote the mailbox it rejected. The
        // full provider reply is already in the log — the Brevo wrapper prints
        // the response body itself before it throws.
        console.error(
          `[${ROUTE_LABEL}] family mail (${recipient.kind}) failed for session ${facts.sessionId}, participation ${participationId}: ${failureName(outcome.reason)}`,
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
      //
      // The copy names itself as one, in a banner above the report: staff read
      // their own To and CC as evidence that a family mail exposed the address
      // list, and nothing but the mail saying otherwise reaches them in time.
      try {
        await sendStaffCopy({
          facts,
          senderEmail: profile.email,
          senderLocale: resolveLocale(profile.locale),
          // The sender's own address is dropped from the CC. It matters only
          // when the sender IS an admin, where To and CC would otherwise name
          // the same mailbox and Brevo would deliver the copy twice. Compared
          // case-insensitively because an address is not case-sensitive in
          // practice and a stored capital would defeat the whole check.
          adminEmails: admins
            .map((admin) => admin.email)
            .filter(
              (email) =>
                email.toLowerCase() !== profile.email.toLowerCase(),
            ),
          // The staff copy's link goes wherever the SENDER can actually open
          // this session. A gedu's workspace is role-gated to gedus, so mailing
          // an admin that URL would hand them a link the proxy bounces; the
          // admin product page is the same session record read by the surface
          // they pressed the button on.
          workspacePath:
            profile.role === "admin"
              ? ROUTES.admin.product(facts.productType, facts.productId)
              : ROUTES.gedu.assignedProduct(facts.productType, facts.productId),
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
      "id, gamer_id, created_at, parent:profiles!parent_gamer_parent_id_fkey!inner(first_name, email, locale)",
    )
    .in("gamer_id", gamerIds);

  if (error) throw error;
  return data;
}

/**
 * One family mail. Everything locale-shaped is resolved here, per recipient:
 * the translator, the product's name in their locale, and the date and time
 * range — in the PRODUCT's zone, with the zone named, because a mail is rendered
 * without the reader's own zone and has to say which one it used.
 *
 * Every value that a person typed reaches the HTML escaped: the builder runs the
 * names through `styledName`/`styledProductName` and the facts through
 * `escapeHtml`, and the report goes through the markdown renderer, which escapes
 * every text node and drops links. The one thing embedded raw is the URL, which
 * this function builds.
 *
 * The recipient's `kind` decides two things and nothing else: which My SOG
 * root the button points at, and whether the builder renders the framing
 * sentence to the parent about the child or to the child themselves. The
 * report, the facts and the photos are the same in both.
 */
async function sendFamilyMail(
  { participationId, gamerName, recipient }: SeatMail,
  facts: SessionFacts,
): Promise<void> {
  const t = await getEmailTranslator(recipient.locale);
  const productName =
    resolveTranslation(facts.productTranslations, recipient.locale)?.name ?? "";
  const gamerCopy = recipient.kind === "gamer";

  const params = {
    gamerName,
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
    photos: facts.photos,
    // Keyed by participation, not by product: two siblings in one club have two
    // pages, and this mail is about one of them. The root follows the reader —
    // `/parent` for the parent or an adult on their own seat, `/gamer` for the
    // child's own copy, because role routing bounces a child off the other.
    productUrl: `${facts.origin}${
      gamerCopy
        ? ROUTES.gamer.enrollment(facts.productType, participationId)
        : ROUTES.customer.enrollment(facts.productType, participationId)
    }`,
    gamerCopy,
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
    // No cc and no bcc, by omission and asserted in the integration test: each
    // recipient's mail is theirs alone — the child's copy is a separate send,
    // not the parent's mail with a second address on it.
  });
}

/**
 * The same template once more, for the people who sent it. The group's name
 * takes the child's slot in the intro ("here's Marianne's report from
 * Kettukallio"), and the link is whichever product surface the sender can open
 * — the gedu workspace for an educator (keyed by product; the page resolves
 * their own group), the admin product page for an admin. The caller decides
 * that, because the caller is what knows who sent it.
 *
 * **It asks for the staff variant, and that is the one thing about this mail a
 * reader has to be told.** Its To and CC are full of colleagues, and staff kept
 * reading that as a family mail that had leaked the whole address list — so the
 * variant opens with a banner saying this is the copy, and that each family's
 * mail was its own. The flag is set here rather than inferred in the builder
 * because this function is the only place that knows the mail is going to
 * staff; every other render of this template is a family's.
 */
async function sendStaffCopy({
  facts,
  senderEmail,
  senderLocale,
  adminEmails,
  workspacePath,
}: {
  facts: SessionFacts;
  senderEmail: string;
  senderLocale: SupportedLocale;
  /** Every admin except the sender — see the call site for why. */
  adminEmails: string[];
  /** Path (not URL) to the sender's own view of this product. */
  workspacePath: string;
}): Promise<void> {
  const t = await getEmailTranslator(senderLocale);
  const productName =
    resolveTranslation(facts.productTranslations, senderLocale)?.name ?? "";

  const params = {
    gamerName: facts.groupName,
    geduName: facts.geduName,
    productName,
    groupName: facts.groupName,
    sessionDate: formatDate(facts.startsAt, senderLocale, {
      dateStyle: "full",
      timeZone: facts.productTimezone,
    }),
    sessionTime: formatTimeRange(
      facts.startsAt,
      facts.endsAt,
      senderLocale,
      facts.productTimezone,
    ),
    reportMarkdown: facts.reportMarkdown,
    // The same photos the families were sent: the copy is a record of what went
    // out, and a record with the pictures missing is a different mail.
    photos: facts.photos,
    productUrl: `${facts.origin}${workspacePath}`,
    staffCopy: true,
  };

  await sendTransactionalEmail({
    fromEmail: SENDER_EMAIL,
    fromName: SENDER_NAME,
    toEmail: senderEmail,
    cc: adminEmails,
    subject: sessionReportSubject(t, params),
    htmlContent: buildSessionReportEmail(t, senderLocale, params),
    // Product mail, so the support inbox as everywhere else — an admin reading
    // the copy who hits reply is asking us something, not writing to the gedu.
    replyToEmail: SUPPORT_EMAIL,
  });
}
