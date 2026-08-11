import { DARK_THEME, STATUS } from "@/lib/constants/colors";
import { wrapInLayout } from "./layout";
import { escapeHtml, heading, paragraph, styledName, styledProductName } from "./utils";
import type { EmailTranslator } from "./translator";

// --- Minecraft status snippet ---

function minecraftSkinImage(username: string): string {
  const url = `https://mc-heads.net/body/${encodeURIComponent(username)}/64`;
  return `<div style="text-align:center;margin:8px 0;"><img src="${url}" alt="${escapeHtml(username)}'s Minecraft skin" width="64" style="display:inline-block;" /></div>`;
}

function minecraftStatusSnippet(t: EmailTranslator, username: string | null, uuid: string | null): string {
  if (username && uuid) {
    return paragraph(`${t("minecraft.label")} <span style="color:${STATUS.success};">${t("minecraft.verified", { username: escapeHtml(username) })}</span>`) +
      minecraftSkinImage(username);
  }
  if (username) {
    return paragraph(`${t("minecraft.label")} <span style="color:${STATUS.warning};">${t("minecraft.unverified", { username: escapeHtml(username) })}</span>`);
  }
  return paragraph(`${t("minecraft.label")} <span style="color:${DARK_THEME.mutedFg};">${t("minecraft.notProvided")}</span>`);
}

// --- Enrollment Parent ---

/**
 * **`isSelfSeat` picks the person the mail is about, and it is not a cosmetic
 * choice.** Every other template here writes to somebody about somebody else.
 * This one goes to the account that bought the seat, and since a for-parents
 * product lets that account occupy the seat itself, the third-person body
 * addresses Marja and then tells her what Marja is doing. Reading your own name
 * back at you in the third person does not merely read oddly — it is the exact
 * shape of a mail sent about the wrong person, which is a thing a parent has a
 * real reason to worry about when a club is involved.
 *
 * The self variant therefore takes no participant name at all: the recipient
 * and the participant are one person, so naming them twice is what created the
 * problem. `participantName` is still required on the type because the caller
 * has it either way and a variant-dependent optional field is a field callers
 * forget on the branch that needs it.
 *
 * **The Minecraft block is omitted on a self seat, deliberately.** An adult has
 * no linked game account and cannot have one, so the snippet's only reachable
 * branch is "Not provided" — a line that reports a permanent absence as if it
 * were a gap the reader should go and fill.
 */
interface EnrollmentParentEmailOptions {
  parentName: string;
  participantName: string;
  geduName: string;
  productName: string;
  minecraftUsername: string | null;
  minecraftUuid: string | null;
  /** True when the parent bought the seat for themselves (participant = customer). */
  isSelfSeat: boolean;
}

export function buildEnrollmentParentEmail(t: EmailTranslator, locale: string, {
  parentName,
  participantName,
  geduName,
  productName,
  minecraftUsername,
  minecraftUuid,
  isSelfSeat,
}: EnrollmentParentEmailOptions): string {
  const body = isSelfSeat
    ? t("enrollmentParent.bodySelf", { parentName: styledName(parentName), productName: styledProductName(productName), geduName: styledName(geduName) })
    : t("enrollmentParent.body", { parentName: styledName(parentName), participantName: styledName(participantName), productName: styledProductName(productName), geduName: styledName(geduName) });
  const content = `
    ${heading(t("enrollmentParent.heading"))}
    ${paragraph(body)}
    ${isSelfSeat ? "" : minecraftStatusSnippet(t, minecraftUsername, minecraftUuid)}
  `;
  return wrapInLayout({ title: t("enrollmentParent.heading"), content, locale, t });
}

// --- Enrollment Gedu ---

interface EnrollmentGeduEmailOptions {
  geduName: string;
  participantName: string;
  productName: string;
  minecraftUsername: string | null;
  minecraftUuid: string | null;
}

export function buildEnrollmentGeduEmail(t: EmailTranslator, locale: string, {
  geduName,
  participantName,
  productName,
  minecraftUsername,
  minecraftUuid,
}: EnrollmentGeduEmailOptions): string {
  const content = `
    ${heading(t("enrollmentGedu.heading"))}
    ${paragraph(t("enrollmentGedu.body", { geduName: styledName(geduName), participantName: styledName(participantName), productName: styledProductName(productName) }))}
    ${minecraftStatusSnippet(t, minecraftUsername, minecraftUuid)}
  `;
  return wrapInLayout({ title: t("enrollmentGedu.heading"), content, locale, t });
}

// --- Unenrollment Parent ---

/** Same self/other split as the enrollment twin — see its note for why. */
interface UnenrollmentParentEmailOptions {
  parentName: string;
  participantName: string;
  geduName: string;
  productName: string;
  /** True when the seat being removed was the parent's own. */
  isSelfSeat: boolean;
}

export function buildUnenrollmentParentEmail(t: EmailTranslator, locale: string, {
  parentName,
  participantName,
  geduName,
  productName,
  isSelfSeat,
}: UnenrollmentParentEmailOptions): string {
  const body = isSelfSeat
    ? t("unenrollmentParent.bodySelf", { parentName: styledName(parentName), productName: styledProductName(productName), geduName: styledName(geduName) })
    : t("unenrollmentParent.body", { parentName: styledName(parentName), participantName: styledName(participantName), productName: styledProductName(productName), geduName: styledName(geduName) });
  const content = `
    ${heading(t("unenrollmentParent.heading"))}
    ${paragraph(body)}
  `;
  return wrapInLayout({ title: t("unenrollmentParent.heading"), content, locale, t });
}

// --- Unenrollment Gedu ---

interface UnenrollmentGeduEmailOptions {
  geduName: string;
  participantName: string;
  productName: string;
  minecraftUsername: string | null;
  minecraftUuid: string | null;
}

export function buildUnenrollmentGeduEmail(t: EmailTranslator, locale: string, {
  geduName,
  participantName,
  productName,
  minecraftUsername,
  minecraftUuid,
}: UnenrollmentGeduEmailOptions): string {
  const content = `
    ${heading(t("unenrollmentGedu.heading"))}
    ${paragraph(t("unenrollmentGedu.body", { geduName: styledName(geduName), participantName: styledName(participantName), productName: styledProductName(productName) }))}
    ${minecraftStatusSnippet(t, minecraftUsername, minecraftUuid)}
  `;
  return wrapInLayout({ title: t("unenrollmentGedu.heading"), content, locale, t });
}
