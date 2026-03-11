import { DARK_THEME } from "@/lib/constants/colors";
import { wrapInLayout } from "./layout";
import { escapeHtml, heading, paragraph, styledName, styledProductName } from "./utils";

// --- Minecraft status snippet ---

function minecraftSkinImage(username: string): string {
  const url = `https://mc-heads.net/body/${encodeURIComponent(username)}/64`;
  return `<div style="text-align:center;margin:8px 0;"><img src="${url}" alt="${escapeHtml(username)}'s Minecraft skin" width="64" style="display:inline-block;" /></div>`;
}

function minecraftStatusSnippet(username: string | null, uuid: string | null): string {
  if (username && uuid) {
    return paragraph(`Minecraft Username: <span style="color:#4ade80;">${escapeHtml(username)} (verified)</span>`) +
      minecraftSkinImage(username);
  }
  if (username) {
    return paragraph(`Minecraft Username: <span style="color:#fbbf24;">${escapeHtml(username)} (not yet verified)</span>`);
  }
  return paragraph(`Minecraft Username: <span style="color:${DARK_THEME.mutedFg};">Not provided</span>`);
}

// --- Subjects ---

export const enrollmentChangeSubjects = {
  enrollmentParent: (gamerName: string, productName: string) =>
    `${gamerName} is now enrolled in ${productName}`,
  enrollmentGedu: (gamerName: string, productName: string) =>
    `${gamerName} has joined your group – ${productName}`,
  unenrollmentParent: (gamerName: string, productName: string) =>
    `${gamerName} has been unenrolled from ${productName}`,
  unenrollmentGedu: (gamerName: string, productName: string) =>
    `${gamerName} has left your group – ${productName}`,
};

// --- Enrollment Parent ---

interface EnrollmentParentEmailOptions {
  parentName: string;
  gamerName: string;
  geduName: string;
  productName: string;
  minecraftUsername: string | null;
  minecraftUuid: string | null;
}

export function buildEnrollmentParentEmail({
  parentName,
  gamerName,
  geduName,
  productName,
  minecraftUsername,
  minecraftUuid,
}: EnrollmentParentEmailOptions): string {
  const content = `
    ${heading("Enrollment Confirmed")}
    ${paragraph(`Hi ${styledName(parentName)}, ${styledName(gamerName)} is now enrolled in ${styledProductName(productName)} with Gedu ${styledName(geduName)}.`)}
    ${minecraftStatusSnippet(minecraftUsername, minecraftUuid)}
  `;
  return wrapInLayout({ title: "Enrollment Confirmed", content });
}

// --- Enrollment Gedu ---

interface EnrollmentGeduEmailOptions {
  geduName: string;
  gamerName: string;
  productName: string;
  minecraftUsername: string | null;
  minecraftUuid: string | null;
}

export function buildEnrollmentGeduEmail({
  geduName,
  gamerName,
  productName,
  minecraftUsername,
  minecraftUuid,
}: EnrollmentGeduEmailOptions): string {
  const content = `
    ${heading("New Gamer in Your Group")}
    ${paragraph(`Hi ${styledName(geduName)}, ${styledName(gamerName)} has joined your group for ${styledProductName(productName)}.`)}
    ${minecraftStatusSnippet(minecraftUsername, minecraftUuid)}
  `;
  return wrapInLayout({ title: "New Gamer in Group", content });
}

// --- Unenrollment Parent ---

interface UnenrollmentParentEmailOptions {
  parentName: string;
  gamerName: string;
  geduName: string;
  productName: string;
}

export function buildUnenrollmentParentEmail({
  parentName,
  gamerName,
  geduName,
  productName,
}: UnenrollmentParentEmailOptions): string {
  const content = `
    ${heading("Unenrollment Confirmed")}
    ${paragraph(`Hi ${styledName(parentName)}, ${styledName(gamerName)} has been unenrolled from ${styledProductName(productName)} (Gedu: ${styledName(geduName)}).`)}
  `;
  return wrapInLayout({ title: "Unenrollment Confirmed", content });
}

// --- Unenrollment Gedu ---

interface UnenrollmentGeduEmailOptions {
  geduName: string;
  gamerName: string;
  productName: string;
  minecraftUsername: string | null;
  minecraftUuid: string | null;
}

export function buildUnenrollmentGeduEmail({
  geduName,
  gamerName,
  productName,
  minecraftUsername,
  minecraftUuid,
}: UnenrollmentGeduEmailOptions): string {
  const content = `
    ${heading("Gamer Left Your Group")}
    ${paragraph(`Hi ${styledName(geduName)}, ${styledName(gamerName)} has left your group for ${styledProductName(productName)}.`)}
    ${minecraftStatusSnippet(minecraftUsername, minecraftUuid)}
  `;
  return wrapInLayout({ title: "Gamer Left Group", content });
}
