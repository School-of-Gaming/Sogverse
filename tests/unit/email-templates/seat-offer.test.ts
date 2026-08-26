import { describe, it, expect, beforeAll } from "vitest";
import {
  buildSeatOfferEmail,
  seatOfferSubject,
} from "@/lib/email-templates/seat-offer";
import {
  buildSeatOfferStaffEmail,
  seatOfferStaffSubject,
} from "@/lib/email-templates/seat-offer-staff";
import {
  getEmailTranslator,
  type EmailTranslator,
} from "@/lib/email-templates/translator";

let t: EmailTranslator;

beforeAll(async () => {
  t = await getEmailTranslator("en");
});

const ACCEPT_URL = "https://sogverse.sog.gg/seat-offer?token=abc123&answer=accept";
const DECLINE_URL = "https://sogverse.sog.gg/seat-offer?token=abc123&answer=decline";
const DEADLINE = "Sunday, 31 August at 14:20 GMT+3";

const offer = {
  participantName: "Aino",
  isSelfSeat: false,
  productName: "Minecraft 101",
  deadline: DEADLINE,
  acceptUrl: ACCEPT_URL,
  declineUrl: DECLINE_URL,
};

describe("buildSeatOfferEmail", () => {
  it("names the child and the product, and carries both answers", () => {
    const html = buildSeatOfferEmail(t, "en", offer);
    expect(html).toContain("Aino");
    expect(html).toContain("Minecraft 101");
    expect(html).toContain(`href="${ACCEPT_URL}"`);
    expect(html).toContain(`href="${DECLINE_URL}"`);
    expect(html).toContain("<!DOCTYPE html>");
  });

  /**
   * The deadline is the one thing in this mail that stops being true, so it is
   * stated as a date and never as a countdown. A mail is read whenever it is
   * read: a family opening this on Thursday must not be told "five days" when
   * what they have is until Sunday.
   */
  it("states an absolute deadline and never a relative window", () => {
    const html = buildSeatOfferEmail(t, "en", offer);
    expect(html).toContain(DEADLINE);
    expect(html).not.toMatch(/\b5 days\b/);
    expect(html).not.toMatch(/\bfive days\b/i);
  });

  /**
   * Two buttons, one ask. `ctaButtonRow` forbids two filled brand buttons, so
   * the emphasis has to land on exactly one of them — and it is Accept, because
   * the mail wants an answer either way but is asking them to come.
   */
  it("emphasizes Accept and outlines Decline", () => {
    const html = buildSeatOfferEmail(t, "en", offer);
    // Only the row's own cells are `width="50%"`, so this picks out the two
    // buttons and nothing else on the page. Asserting on the border rather than
    // on a colour keeps this test about the arrangement rather than the palette,
    // which `house-style.test.ts` already owns: the outlined button is the one
    // that draws a border, the emphasized one is the one that does not.
    const cells = [
      ...html.matchAll(/<td width="50%"[^>]*style="([^"]*)"[^>]*>\s*<a href="([^"]*)"/g),
    ].map((match) => ({ style: match[1], href: match[2] }));

    expect(cells).toHaveLength(2);
    expect(cells[0].href).toBe(ACCEPT_URL);
    expect(cells[0].style).not.toContain("border:1px solid");
    expect(cells[1].href).toBe(DECLINE_URL);
    expect(cells[1].style).toContain("border:1px solid");
  });

  it("speaks in the second person when the seat is the parent's own", () => {
    const html = buildSeatOfferEmail(t, "en", { ...offer, isSelfSeat: true });
    expect(html).toContain("you can join us");
    expect(html).not.toContain("Aino");
  });

  it("escapes HTML in the names", () => {
    const html = buildSeatOfferEmail(t, "en", {
      ...offer,
      participantName: "<script>xss</script>",
    });
    expect(html).not.toContain("<script>xss</script>");
    expect(html).toContain("&lt;script&gt;xss&lt;/script&gt;");
  });

  it("names the child and the product in the subject", () => {
    expect(seatOfferSubject(t, offer)).toBe(
      "Aino: a seat has opened in Minecraft 101",
    );
    expect(seatOfferSubject(t, { ...offer, isSelfSeat: true })).toBe(
      "A seat has opened in Minecraft 101",
    );
  });
});

const staff = {
  reason: "declined" as const,
  participantName: "Aino",
  contactName: "Marja Virtanen",
  contactEmail: "marja@example.com",
  productName: "Minecraft 101",
  productSchedule: "Tue 16:00, Thu 16:00 (Europe/Helsinki)",
  offeredAt: "Tue, 26 Aug, 14:20 GMT+3",
  adminProductUrl: "https://sogverse.sog.gg/admin/municipality-clubs/abc",
};

describe("buildSeatOfferStaffEmail", () => {
  it("carries every fact an admin needs to place the run", () => {
    const html = buildSeatOfferStaffEmail(t, "en", staff);
    expect(html).toContain("Aino");
    expect(html).toContain("Marja Virtanen");
    expect(html).toContain("Minecraft 101");
    expect(html).toContain("Tue 16:00, Thu 16:00 (Europe/Helsinki)");
    expect(html).toContain("Tue, 26 Aug, 14:20 GMT+3");
    expect(html).toContain(`href="${staff.adminProductUrl}"`);
  });

  /** A product with no slots drops the row rather than showing an empty one. */
  it("omits the schedule row when there is no schedule", () => {
    const html = buildSeatOfferStaffEmail(t, "en", {
      ...staff,
      productSchedule: null,
    });
    expect(html).not.toContain("Schedule");
  });

  /**
   * The address is shown and never linked. Replying is how a staff member
   * answers this family, and the mail's Reply-To is already their address — a
   * second, differently-styled route to the same place is a question about
   * which one is real, and a client that invents the link paints it in a colour
   * we did not choose.
   */
  it("defuses the family's address rather than linking it", () => {
    const html = buildSeatOfferStaffEmail(t, "en", staff);
    expect(html).not.toContain('href="mailto:marja@example.com"');
    expect(html).not.toContain("marja@example.com<");
  });

  it("says which of the two things happened, in the body and the subject", () => {
    const declined = buildSeatOfferStaffEmail(t, "en", staff);
    expect(declined).toContain("A seat offer was declined");
    expect(seatOfferStaffSubject(t, staff)).toBe(
      "Aino declined a seat in Minecraft 101",
    );

    const lapsed = { ...staff, reason: "no_response" as const };
    const html = buildSeatOfferStaffEmail(t, "en", lapsed);
    expect(html).toContain("A seat offer ran out");
    expect(html).not.toContain("A seat offer was declined");
    expect(seatOfferStaffSubject(t, lapsed)).toBe(
      "No answer to a seat offer for Aino in Minecraft 101",
    );
  });

  it("escapes HTML in the contact's name", () => {
    const html = buildSeatOfferStaffEmail(t, "en", {
      ...staff,
      contactName: "<script>xss</script>",
    });
    expect(html).not.toContain("<script>xss</script>");
    expect(html).toContain("&lt;script&gt;xss&lt;/script&gt;");
  });
});
