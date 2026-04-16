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

interface EnrollmentParentEmailOptions {
  parentName: string;
  gamerName: string;
  geduName: string;
  productName: string;
  minecraftUsername: string | null;
  minecraftUuid: string | null;
}

export function buildEnrollmentParentEmail(t: EmailTranslator, locale: string, {
  parentName,
  gamerName,
  geduName,
  productName,
  minecraftUsername,
  minecraftUuid,
}: EnrollmentParentEmailOptions): string {
  const content = `
    ${heading(t("enrollmentParent.heading"))}
    ${paragraph(t("enrollmentParent.body", { parentName: styledName(parentName), gamerName: styledName(gamerName), productName: styledProductName(productName), geduName: styledName(geduName) }))}
    ${minecraftStatusSnippet(t, minecraftUsername, minecraftUuid)}
  `;
  return wrapInLayout({ title: t("enrollmentParent.heading"), content, locale, t });
}

// --- Enrollment Gedu ---

interface EnrollmentGeduEmailOptions {
  geduName: string;
  gamerName: string;
  productName: string;
  minecraftUsername: string | null;
  minecraftUuid: string | null;
}

export function buildEnrollmentGeduEmail(t: EmailTranslator, locale: string, {
  geduName,
  gamerName,
  productName,
  minecraftUsername,
  minecraftUuid,
}: EnrollmentGeduEmailOptions): string {
  const content = `
    ${heading(t("enrollmentGedu.heading"))}
    ${paragraph(t("enrollmentGedu.body", { geduName: styledName(geduName), gamerName: styledName(gamerName), productName: styledProductName(productName) }))}
    ${minecraftStatusSnippet(t, minecraftUsername, minecraftUuid)}
  `;
  return wrapInLayout({ title: t("enrollmentGedu.heading"), content, locale, t });
}

// --- Unenrollment Parent ---

interface UnenrollmentParentEmailOptions {
  parentName: string;
  gamerName: string;
  geduName: string;
  productName: string;
}

export function buildUnenrollmentParentEmail(t: EmailTranslator, locale: string, {
  parentName,
  gamerName,
  geduName,
  productName,
}: UnenrollmentParentEmailOptions): string {
  const content = `
    ${heading(t("unenrollmentParent.heading"))}
    ${paragraph(t("unenrollmentParent.body", { parentName: styledName(parentName), gamerName: styledName(gamerName), productName: styledProductName(productName), geduName: styledName(geduName) }))}
  `;
  return wrapInLayout({ title: t("unenrollmentParent.heading"), content, locale, t });
}

// --- Unenrollment Gedu ---

interface UnenrollmentGeduEmailOptions {
  geduName: string;
  gamerName: string;
  productName: string;
  minecraftUsername: string | null;
  minecraftUuid: string | null;
}

export function buildUnenrollmentGeduEmail(t: EmailTranslator, locale: string, {
  geduName,
  gamerName,
  productName,
  minecraftUsername,
  minecraftUuid,
}: UnenrollmentGeduEmailOptions): string {
  const content = `
    ${heading(t("unenrollmentGedu.heading"))}
    ${paragraph(t("unenrollmentGedu.body", { geduName: styledName(geduName), gamerName: styledName(gamerName), productName: styledProductName(productName) }))}
    ${minecraftStatusSnippet(t, minecraftUsername, minecraftUuid)}
  `;
  return wrapInLayout({ title: t("unenrollmentGedu.heading"), content, locale, t });
}
