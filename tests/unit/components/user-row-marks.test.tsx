import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { UserRow } from "@/components/admin/user-row";
import type { UserRole } from "@/types";

/**
 * **A mark on an admin row is a claim, and only a positive answer prints one.**
 *
 * The certification mark was once driven by an `uncertified` boolean the page
 * computed as `!isError && role === "gedu" && !certified`. Read the failure
 * path: when the certification query *failed*, `uncertified` came out false for
 * everyone, and the row rendered the shield on the strength of it — so a broken
 * read printed "Certified" across every educator on the page.
 *
 * That whole class is gone rather than guarded: the flag is a column of the
 * list's own row now, so there is no second read to fail and no "we could not
 * find out" to represent — a row on screen carries its own verdict. What the
 * cases below still hold is the half that is a property of the component: a
 * `false` and an absent answer both print nothing, a non-gedu is never
 * shielded, and the mark order is fixed.
 *
 * Static markup, because none of this depends on an effect — the shield is in
 * the server's first frame or it is nowhere.
 */

const CERTIFIED_LABEL = messages.admin.users.certification.certified;
const VERIFIED_LABEL = messages.admin.users.emailVerified;

interface RowUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  email_verified_at: string | null;
  role: UserRole;
}

const GEDU: RowUser = {
  id: "3f2b1c90-6a4e-4d21-9f77-0c8b5a1e2d34",
  first_name: "Sam",
  last_name: "Smith",
  email: "sam@example.com",
  email_verified_at: "2026-02-19T17:40:00.000Z",
  role: "gedu",
};

function rowHtml(props: {
  user?: RowUser;
  certified?: boolean;
}): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages}>
      <UserRow user={props.user ?? GEDU} certified={props.certified} />
    </NextIntlClientProvider>,
  );
}

describe("UserRow certification mark", () => {
  it("prints the shield only on a positive answer", () => {
    expect(rowHtml({ certified: true })).toContain(CERTIFIED_LABEL);
  });

  it("withholds the shield from a gedu who is known to be uncertified", () => {
    expect(rowHtml({ certified: false })).not.toContain(CERTIFIED_LABEL);
  });

  it("withholds the shield when nobody passed an answer at all", () => {
    expect(rowHtml({})).not.toContain(CERTIFIED_LABEL);
  });

  it("never shields a non-gedu, whatever the flag says", () => {
    const customer: RowUser = { ...GEDU, role: "customer" };
    expect(rowHtml({ user: customer, certified: true })).not.toContain(
      CERTIFIED_LABEL,
    );
  });

  /**
   * The two marks are independent: an uncertified educator must not lose the
   * email check, which is about an address rather than a person.
   */
  it("still shows the verified-email check on an uncertified educator", () => {
    expect(rowHtml({ certified: false })).toContain(VERIFIED_LABEL);
  });

  it("keeps certification first and verification second when both hold", () => {
    const html = rowHtml({ certified: true });
    expect(html.indexOf(CERTIFIED_LABEL)).toBeLessThan(
      html.indexOf(VERIFIED_LABEL),
    );
  });

  /**
   * A gamer's address is the synthetic `@gamer.sogverse.internal` one their
   * account was created with, so no inbox ever answered for it.
   */
  it("gives a gamer neither mark", () => {
    const gamer: RowUser = {
      ...GEDU,
      role: "gamer",
      email: "abc123@gamer.sogverse.internal",
    };
    const html = rowHtml({ user: gamer, certified: true });
    expect(html).not.toContain(CERTIFIED_LABEL);
    expect(html).not.toContain(VERIFIED_LABEL);
  });
});

/**
 * **The line under a name is the person's address, and a gamer has none worth
 * printing.** A child's stored address is either a synthetic handle nobody has
 * ever seen or a mailbox that belongs to that child's own account, so the list
 * prints a name and the detail page is where credentials are read.
 */
describe("the line under a name on an admin row", () => {
  it("prints an adult's address", () => {
    expect(rowHtml({})).toContain("sam@example.com");
  });

  it("prints no address for a gamer", () => {
    const gamer: RowUser = {
      ...GEDU,
      role: "gamer",
      email: "abc123@gamer.sogverse.internal",
    };
    expect(rowHtml({ user: gamer })).not.toContain("gamer.sogverse.internal");
  });
});
