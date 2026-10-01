import type { ReactNode } from "react";
import type { useTranslations } from "next-intl";
import type { TeamProfile } from "@/services/team-profiles/team-profiles.types";

/** The `team.profile` translator, from `useTranslations` or `getTranslations`. */
type TeamProfileTranslator = ReturnType<typeof useTranslations<"team.profile">>;

/*
 * **A person is headed in one format wherever they are shown**: the profile
 * page, a Team card, the share card. The headline is the first name and the
 * nickname gamers know them by, the nickname set apart by colour alone, with
 * no quotes (`teamMemberHeadline`); under it, a Gedu's role or an admin's full
 * name beside their title (`teamMemberSubline`). **A Gedu never shows a
 * surname**, here or anywhere.
 *
 * Text that cannot carry colour — a page title, alt text, structured data —
 * names the person in full instead (`teamMemberPlainName`), the nickname in
 * the locale's quotes so it is not read as a surname.
 */

/**
 * **The headline name**: the first name in ink and the nickname drawn by
 * `nick` — the caller's act colour, as a class or an inline style.
 */
export function teamMemberHeadline(
  person: TeamProfile,
  t: TeamProfileTranslator,
  nick: (chunks: ReactNode) => ReactNode,
): ReactNode {
  return person.nickname === null
    ? person.firstName
    : t.rich("headlineName", {
        firstName: person.firstName,
        nickname: person.nickname,
        nick,
      });
}

/** The headline's words as plain text, for measuring them. */
export function teamMemberHeadlineText(
  person: TeamProfile,
  t: TeamProfileTranslator,
): string {
  return person.nickname === null
    ? person.firstName
    : t.markup("headlineName", {
        firstName: person.firstName,
        nickname: person.nickname,
        nick: (chunks) => chunks,
      });
}

/**
 * **A person's full name as plain text**, for text that stands without the
 * line under the headline: an admin with their surname, the nickname in the
 * locale's quotes.
 */
export function teamMemberPlainName(
  person: TeamProfile,
  t: TeamProfileTranslator,
): string {
  const lastName = person.kind === "admin" ? person.lastName : null;
  if (person.nickname === null) {
    return lastName === null ? person.firstName : `${person.firstName} ${lastName}`;
  }
  return lastName === null
    ? t("firstNameWithNickname", {
        firstName: person.firstName,
        nickname: person.nickname,
      })
    : t("nameWithNickname", {
        firstName: person.firstName,
        lastName,
        nickname: person.nickname,
      });
}

/** **What a person does here**: an admin's own title, or the Gedu role glossed. */
export function teamMemberRole(person: TeamProfile, t: TeamProfileTranslator): string {
  return person.kind === "admin" ? person.title : t("geduTitle");
}

/**
 * **The line under a person's headline**: a Gedu's role glossed, or an
 * admin's full name beside their own title — the surname the headline leaves
 * out.
 */
export function teamMemberSubline(
  person: TeamProfile,
  t: TeamProfileTranslator,
): string {
  return person.kind === "admin"
    ? `${person.firstName} ${person.lastName} · ${teamMemberRole(person, t)}`
    : teamMemberRole(person, t);
}
