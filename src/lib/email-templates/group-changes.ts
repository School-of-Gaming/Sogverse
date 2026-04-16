import { wrapInLayout } from "./layout";
import { heading, paragraph, styledName, styledProductName } from "./utils";
import type { EmailTranslator } from "./translator";

// --- Group Added ---

interface GroupAddedEmailOptions {
  geduName: string;
  productName: string;
}

export function buildGroupAddedEmail(t: EmailTranslator, locale: string, { geduName, productName }: GroupAddedEmailOptions): string {
  const content = `
    ${heading(t("groupAdded.heading"))}
    ${paragraph(t("groupAdded.body", { geduName: styledName(geduName), productName: styledProductName(productName) }))}
    ${paragraph(t("groupAdded.dashboardNote"))}
  `;
  return wrapInLayout({ title: t("groupAdded.heading"), content, locale, t });
}

// --- Group Deleted ---

interface GroupDeletedEmailOptions {
  geduName: string;
  productName: string;
}

export function buildGroupDeletedEmail(t: EmailTranslator, locale: string, { geduName, productName }: GroupDeletedEmailOptions): string {
  const content = `
    ${heading(t("groupDeleted.heading"))}
    ${paragraph(t("groupDeleted.body", { geduName: styledName(geduName), productName: styledProductName(productName) }))}
  `;
  return wrapInLayout({ title: t("groupDeleted.heading"), content, locale, t });
}

// --- Group Reassigned (Old Gedu) ---

interface GroupReassignedOldGeduEmailOptions {
  oldGeduName: string;
  newGeduName: string;
  productName: string;
}

export function buildGroupReassignedOldGeduEmail(t: EmailTranslator, locale: string, { oldGeduName, newGeduName, productName }: GroupReassignedOldGeduEmailOptions): string {
  const content = `
    ${heading(t("groupReassignedOldGedu.heading"))}
    ${paragraph(t("groupReassignedOldGedu.body", { oldGeduName: styledName(oldGeduName), newGeduName: styledName(newGeduName), productName: styledProductName(productName) }))}
  `;
  return wrapInLayout({ title: t("groupReassignedOldGedu.heading"), content, locale, t });
}

// --- Group Reassigned (New Gedu) ---

interface GroupReassignedNewGeduEmailOptions {
  oldGeduName: string;
  newGeduName: string;
  productName: string;
}

export function buildGroupReassignedNewGeduEmail(t: EmailTranslator, locale: string, { oldGeduName, newGeduName, productName }: GroupReassignedNewGeduEmailOptions): string {
  const content = `
    ${heading(t("groupReassignedNewGedu.heading"))}
    ${paragraph(t("groupReassignedNewGedu.body", { newGeduName: styledName(newGeduName), productName: styledProductName(productName), oldGeduName: styledName(oldGeduName) }))}
  `;
  return wrapInLayout({ title: t("groupReassignedNewGedu.heading"), content, locale, t });
}

// --- Group Reassigned (Parent) ---

interface GroupReassignedParentEmailOptions {
  parentName: string;
  gamerName: string;
  oldGeduName: string;
  newGeduName: string;
  productName: string;
}

export function buildGroupReassignedParentEmail(t: EmailTranslator, locale: string, { parentName, gamerName, oldGeduName, newGeduName, productName }: GroupReassignedParentEmailOptions): string {
  const content = `
    ${heading(t("groupReassignedParent.heading"))}
    ${paragraph(t("groupReassignedParent.body", { parentName: styledName(parentName), gamerName: styledName(gamerName), productName: styledProductName(productName), oldGeduName: styledName(oldGeduName), newGeduName: styledName(newGeduName) }))}
  `;
  return wrapInLayout({ title: t("groupReassignedParent.heading"), content, locale, t });
}

// --- Gamer Moved (Parent) ---

interface GamerMovedParentEmailOptions {
  parentName: string;
  gamerName: string;
  oldGeduName: string;
  newGeduName: string;
  productName: string;
}

export function buildGamerMovedParentEmail(t: EmailTranslator, locale: string, { parentName, gamerName, oldGeduName, newGeduName, productName }: GamerMovedParentEmailOptions): string {
  const content = `
    ${heading(t("gamerMovedParent.heading"))}
    ${paragraph(t("gamerMovedParent.body", { parentName: styledName(parentName), gamerName: styledName(gamerName), oldGeduName: styledName(oldGeduName), newGeduName: styledName(newGeduName), productName: styledProductName(productName) }))}
  `;
  return wrapInLayout({ title: t("gamerMovedParent.heading"), content, locale, t });
}

// --- Gamer Moved (Old Gedu) ---

interface GamerMovedOldGeduEmailOptions {
  geduName: string;
  gamerName: string;
  newGeduName: string;
  productName: string;
}

export function buildGamerMovedOldGeduEmail(t: EmailTranslator, locale: string, { geduName, gamerName, newGeduName, productName }: GamerMovedOldGeduEmailOptions): string {
  const content = `
    ${heading(t("gamerMovedOldGedu.heading"))}
    ${paragraph(t("gamerMovedOldGedu.body", { geduName: styledName(geduName), gamerName: styledName(gamerName), newGeduName: styledName(newGeduName), productName: styledProductName(productName) }))}
  `;
  return wrapInLayout({ title: t("gamerMovedOldGedu.heading"), content, locale, t });
}

// --- Gamer Moved (New Gedu) ---

interface GamerMovedNewGeduEmailOptions {
  geduName: string;
  gamerName: string;
  oldGeduName: string;
  productName: string;
}

export function buildGamerMovedNewGeduEmail(t: EmailTranslator, locale: string, { geduName, gamerName, oldGeduName, productName }: GamerMovedNewGeduEmailOptions): string {
  const content = `
    ${heading(t("gamerMovedNewGedu.heading"))}
    ${paragraph(t("gamerMovedNewGedu.body", { geduName: styledName(geduName), gamerName: styledName(gamerName), oldGeduName: styledName(oldGeduName), productName: styledProductName(productName) }))}
  `;
  return wrapInLayout({ title: t("gamerMovedNewGedu.heading"), content, locale, t });
}
