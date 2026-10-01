import type { useTranslations } from "next-intl";
import type { TeamProfile } from "@/services/team-profiles/team-profiles.types";

/** The `team.profile` translator, from `useTranslations` or `getTranslations`. */
type TeamProfileTranslator = ReturnType<typeof useTranslations<"team.profile">>;

/**
 * **A person's name as plain text** — the words of the profile heading
 * without its colour, for a page title, a card, a share card or alt text.
 * An admin is named in full; **a Gedu never shows a surname**, here or
 * anywhere. The nickname gamers know them by follows in the locale's quotes.
 *
 * `withSurname: false` drops an admin's surname too, for a line that carries
 * it elsewhere — the share card's headline, whose surname sits beside the
 * title under the rule.
 */
export function teamMemberPlainName(
  person: TeamProfile,
  t: TeamProfileTranslator,
  { withSurname = true }: { withSurname?: boolean } = {},
): string {
  const lastName =
    person.kind === "admin" && withSurname ? person.lastName : null;
  if (person.nickname === null) {
    return lastName === null ? person.firstName : `${person.firstName} ${lastName}`;
  }
  return lastName === null
    ? t.markup("firstNameWithNickname", {
        firstName: person.firstName,
        nickname: person.nickname,
        nick: (chunks) => chunks,
      })
    : t.markup("nameWithNickname", {
        firstName: person.firstName,
        lastName,
        nickname: person.nickname,
        nick: (chunks) => chunks,
      });
}
