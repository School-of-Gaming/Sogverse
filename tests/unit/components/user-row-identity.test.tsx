import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { UserRow } from "@/components/admin/user-row";
import type { GamerSignIn, UserRole } from "@/types";

/**
 * **What an admin row prints under a child's name follows from how that child
 * signs in — and so does whether it can carry an email check at all.**
 *
 * Three answers, one per mode. A child with a real mailbox shows it, and may
 * carry the verified mark like any adult. A child in `username` mode shows the
 * username their parent chose, labelled, so it is not read as a truncated
 * address in a column where every neighbouring line is one. A switch-only child
 * shows nothing: their address is an opaque handle nobody has ever seen, and the
 * previous rule — never print a gamer's address — existed precisely because that
 * was the only kind of address a gamer could have.
 *
 * The check has to be pinned in both directions, because a row that never
 * printed it would pass the two negative cases on its own.
 *
 * Static markup, because none of this depends on an effect: the line is in the
 * server's first frame or it is nowhere.
 */

const USERNAME_LABEL = messages.admin.users.usernameLabel;
const VERIFIED_LABEL = messages.admin.users.emailVerified;

interface RowUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  email_verified_at: string | null;
  role: UserRole;
}

const GAMER: RowUser = {
  id: "8c4f1e57-2d3a-4b19-95e6-7a0d1c2b3f48",
  first_name: "Lily",
  last_name: "",
  email: "g3f2b1c906a4e4d21@gamer.sogverse.internal",
  email_verified_at: null,
  role: "gamer",
};

const PARENT: RowUser = {
  id: "3f2b1c90-6a4e-4d21-9f77-0c8b5a1e2d34",
  first_name: "Marja",
  last_name: "Virtanen",
  email: "marja@example.test",
  email_verified_at: "2026-02-19T17:40:00.000Z",
  role: "customer",
};

function rowHtml(props: {
  user?: RowUser;
  linkedGamers?: RowUser[];
  signIns?: [string, GamerSignIn][];
}): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages}>
      <UserRow
        user={props.user ?? GAMER}
        linkedGamers={props.linkedGamers}
        gamerSignIns={new Map(props.signIns ?? [])}
      />
    </NextIntlClientProvider>,
  );
}

describe("the line under a gamer's name", () => {
  it("prints nothing for a switch-only child", () => {
    const html = rowHtml({ signIns: [[GAMER.id, "parent"]] });

    expect(html).not.toContain("gamer.sogverse.internal");
    expect(html).not.toContain(USERNAME_LABEL);
  });

  it("prints the username, labelled, for a username-mode child", () => {
    const html = rowHtml({
      user: { ...GAMER, email: "lily2015@gamer.sogverse.internal" },
      signIns: [[GAMER.id, "username"]],
    });

    expect(html).toContain(USERNAME_LABEL);
    expect(html).toContain("lily2015");
    expect(html).not.toContain("gamer.sogverse.internal");
  });

  it("prints the mailbox for an email-mode child", () => {
    const html = rowHtml({
      user: { ...GAMER, email: "lily@example.test" },
      signIns: [[GAMER.id, "email"]],
    });

    expect(html).toContain("lily@example.test");
    expect(html).not.toContain(USERNAME_LABEL);
  });

  // An unanswered read is silence, not "switch-only": nothing about the row
  // should assert a mode nobody has told it.
  it("prints nothing when no mode was supplied for this child", () => {
    const html = rowHtml({ user: { ...GAMER, email: "lily@example.test" } });

    expect(html).not.toContain("lily@example.test");
    expect(html).not.toContain(USERNAME_LABEL);
  });

  it("still prints an adult's address with no mode in sight", () => {
    const html = rowHtml({ user: PARENT });

    expect(html).toContain("marja@example.test");
  });
});

describe("the email check on a gamer's row", () => {
  it("is withheld from a child whose address is a synthetic handle", () => {
    const html = rowHtml({
      user: {
        ...GAMER,
        email: "lily2015@gamer.sogverse.internal",
        // Nothing can legitimately set this on a synthetic address; the point is
        // that the row does not print a mark even if something did.
        email_verified_at: "2026-02-19T17:40:00.000Z",
      },
      signIns: [[GAMER.id, "username"]],
    });

    expect(html).not.toContain(VERIFIED_LABEL);
  });

  it("is printed for a child who confirmed a real mailbox", () => {
    const html = rowHtml({
      user: {
        ...GAMER,
        email: "lily@example.test",
        email_verified_at: "2026-02-19T17:40:00.000Z",
      },
      signIns: [[GAMER.id, "email"]],
    });

    expect(html).toContain(VERIFIED_LABEL);
  });
});

describe("the children nested under a parent's row", () => {
  it("describe themselves the same way the top-level row would", () => {
    const lily = { ...GAMER, email: "lily2015@gamer.sogverse.internal" };
    const otso = {
      ...GAMER,
      id: "b71d5c02-9e34-4f8a-8c15-6d2e0a4b7c93",
      first_name: "Otso",
      email: "otso@example.test",
    };

    const html = rowHtml({
      user: PARENT,
      linkedGamers: [lily, otso],
      signIns: [
        [lily.id, "username"],
        [otso.id, "email"],
      ],
    });

    expect(html).toContain("lily2015");
    expect(html).toContain(USERNAME_LABEL);
    expect(html).toContain("otso@example.test");
    expect(html).not.toContain("gamer.sogverse.internal");
  });
});
