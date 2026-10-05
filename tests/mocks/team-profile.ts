import type { SupportedLocale } from "@/lib/constants/locales";
import type {
  AdminTeamProfile,
  GeduTeamProfile,
  TeamProfileTranslation,
} from "@/services/team-profiles/team-profiles.types";

/** One written locale of a profile, with words that name the locale. */
export function teamTranslation(locale: SupportedLocale): TeamProfileTranslation {
  return {
    locale,
    shortDescription: `Intro in ${locale}`,
    longDescription: `About me in ${locale}`,
    funFact: null,
  };
}

/** When a mock profile was first saved, unless `createdAt` says otherwise. */
const FIRST_SAVED = "2026-01-01T00:00:00+00:00";

/**
 * A public Gedu profile as the public read returns it: photo served by the
 * app's photo route, written in English unless `locales` says otherwise.
 */
export function publicGeduProfile(
  overrides: Partial<Omit<GeduTeamProfile, "kind" | "translations">> & {
    locales?: SupportedLocale[];
    createdAt?: string;
  } = {},
): GeduTeamProfile & { createdAt: string } {
  const { locales = ["en"], ...rest } = overrides;
  const id = rest.id ?? "eadea095-24f1-40cd-bc31-e898edc9ab3a";
  return {
    kind: "gedu",
    id,
    firstName: "Eetu",
    nickname: "CreeperHug",
    pick: null,
    photo: { src: `/api/team/photos/${id}?v=abc`, width: 800, height: 1000 },
    spokenLanguages: ["fi", "en"],
    createdAt: FIRST_SAVED,
    ...rest,
    translations: locales.map(teamTranslation),
  };
}

/** A public admin profile, the same way. */
export function publicAdminProfile(
  overrides: Partial<Omit<AdminTeamProfile, "kind" | "translations">> & {
    locales?: SupportedLocale[];
    createdAt?: string;
  } = {},
): AdminTeamProfile & { createdAt: string } {
  const { locales = ["en"], ...rest } = overrides;
  const id = rest.id ?? "65fd2cbb-acda-45fd-9dad-b973f75b2579";
  return {
    kind: "admin",
    id,
    firstName: "Laura",
    lastName: "Virtanen",
    nickname: "Nightowl",
    title: "Chief Executive Officer",
    pick: null,
    photo: { src: `/api/team/photos/${id}?v=def`, width: 800, height: 1000 },
    spokenLanguages: ["fi", "en"],
    createdAt: FIRST_SAVED,
    ...rest,
    translations: locales.map(teamTranslation),
  };
}
