import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { UserRow } from "@/components/admin/user-row";
import type { UserRole } from "@/types";

/**
 * **A mark on an admin row is a claim, and the absence of an answer is not one.**
 *
 * The certification mark used to be driven by an `uncertified` boolean that the
 * page computed as `!isError && role === "gedu" && !certified`. Read the failure
 * path: when the certification query *failed*, `uncertified` came out false for
 * everyone, and the row rendered the shield on the strength of it — so a broken
 * read printed "Certified" across every educator on the page. That is the exact
 * inverse of what the page's own comment said it was doing, and it is the reason
 * the signal is three-valued now: `true`, `false`, and `null` for "we could not
 * find out". Only `true` prints.
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
  certified?: boolean | null;
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

  // The regression this file exists for.
  it("withholds the shield when the certification read failed", () => {
    expect(rowHtml({ certified: null })).not.toContain(CERTIFIED_LABEL);
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
   * The two marks are independent: an unknown certification must not swallow the
   * email check, which is read straight off the row and never in doubt.
   */
  it("still shows the verified-email check while certification is unknown", () => {
    expect(rowHtml({ certified: null })).toContain(VERIFIED_LABEL);
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
