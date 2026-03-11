import { BRAND, DARK_THEME } from "@/lib/constants/colors";
import { wrapInLayout } from "./layout";
import { escapeHtml } from "./utils";

// --- Shared helpers ---

function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;color:${DARK_THEME.foreground};font-size:14px;line-height:1.6;">${text}</p>`;
}

function heading(text: string): string {
  return `<h2 style="margin:0 0 16px;font-size:18px;font-weight:bold;color:${DARK_THEME.foreground};">${text}</h2>`;
}

function styledName(name: string): string {
  return `<span style="color:${BRAND.primary};">${escapeHtml(name)}</span>`;
}

function styledProductName(name: string): string {
  return `<strong style="color:${BRAND.secondary};">${escapeHtml(name)}</strong>`;
}

// --- Subjects ---

export const groupChangeSubjects = {
  groupAdded: (productName: string) =>
    `You've been assigned to a new group – ${productName}`,
  groupDeleted: (productName: string) =>
    `Your group has been removed – ${productName}`,
  groupReassignedOldGedu: (productName: string) =>
    `Your group has been reassigned – ${productName}`,
  groupReassignedNewGedu: (productName: string) =>
    `You've been assigned to a group – ${productName}`,
  groupReassignedParent: (gamerName: string, productName: string) =>
    `Gedu change for ${gamerName} – ${productName}`,
  gamerMovedParent: (gamerName: string, productName: string) =>
    `${gamerName} has been moved to a new group – ${productName}`,
  gamerMovedOldGedu: (gamerName: string, productName: string) =>
    `${gamerName} has been moved from your group – ${productName}`,
  gamerMovedNewGedu: (gamerName: string, productName: string) =>
    `${gamerName} has been moved to your group – ${productName}`,
};

// --- Group Added ---

interface GroupAddedEmailOptions {
  geduName: string;
  productName: string;
}

export function buildGroupAddedEmail({ geduName, productName }: GroupAddedEmailOptions): string {
  const content = `
    ${heading("You've been assigned to a new group")}
    ${paragraph(`Hi ${styledName(geduName)}, you've been assigned to a new group for ${styledProductName(productName)}.`)}
    ${paragraph("You'll see this group in your dashboard shortly.")}
  `;
  return wrapInLayout({ title: "New Group Assignment", content });
}

// --- Group Deleted ---

interface GroupDeletedEmailOptions {
  geduName: string;
  productName: string;
}

export function buildGroupDeletedEmail({ geduName, productName }: GroupDeletedEmailOptions): string {
  const content = `
    ${heading("Your group has been removed")}
    ${paragraph(`Hi ${styledName(geduName)}, your group for ${styledProductName(productName)} has been removed by an admin.`)}
  `;
  return wrapInLayout({ title: "Group Removed", content });
}

// --- Group Reassigned (Old Gedu) ---

interface GroupReassignedOldGeduEmailOptions {
  oldGeduName: string;
  newGeduName: string;
  productName: string;
}

export function buildGroupReassignedOldGeduEmail({ oldGeduName, newGeduName, productName }: GroupReassignedOldGeduEmailOptions): string {
  const content = `
    ${heading("Your group has been reassigned")}
    ${paragraph(`Hi ${styledName(oldGeduName)}, your group for ${styledProductName(productName)} has been reassigned to ${styledName(newGeduName)}.`)}
  `;
  return wrapInLayout({ title: "Group Reassigned", content });
}

// --- Group Reassigned (New Gedu) ---

interface GroupReassignedNewGeduEmailOptions {
  oldGeduName: string;
  newGeduName: string;
  productName: string;
}

export function buildGroupReassignedNewGeduEmail({ oldGeduName, newGeduName, productName }: GroupReassignedNewGeduEmailOptions): string {
  const content = `
    ${heading("You've been assigned to a group")}
    ${paragraph(`Hi ${styledName(newGeduName)}, you've been assigned to a group for ${styledProductName(productName)} (previously led by ${styledName(oldGeduName)}).`)}
  `;
  return wrapInLayout({ title: "Group Assignment", content });
}

// --- Group Reassigned (Parent) ---

interface GroupReassignedParentEmailOptions {
  parentName: string;
  gamerName: string;
  oldGeduName: string;
  newGeduName: string;
  productName: string;
}

export function buildGroupReassignedParentEmail({ parentName, gamerName, oldGeduName, newGeduName, productName }: GroupReassignedParentEmailOptions): string {
  const content = `
    ${heading("Your gamer's Gedu has changed")}
    ${paragraph(`Hi ${styledName(parentName)}, the Gedu for ${styledName(gamerName)}'s group in ${styledProductName(productName)} has changed from ${styledName(oldGeduName)} to ${styledName(newGeduName)}.`)}
  `;
  return wrapInLayout({ title: "Gedu Change", content });
}

// --- Gamer Moved (Parent) ---

interface GamerMovedParentEmailOptions {
  parentName: string;
  gamerName: string;
  oldGeduName: string;
  newGeduName: string;
  productName: string;
}

export function buildGamerMovedParentEmail({ parentName, gamerName, oldGeduName, newGeduName, productName }: GamerMovedParentEmailOptions): string {
  const content = `
    ${heading("Your child has been moved to a new group")}
    ${paragraph(`Hi ${styledName(parentName)}, ${styledName(gamerName)} has been moved from ${styledName(oldGeduName)}'s group to ${styledName(newGeduName)}'s group in ${styledProductName(productName)}.`)}
  `;
  return wrapInLayout({ title: "Group Change", content });
}

// --- Gamer Moved (Old Gedu) ---

interface GamerMovedOldGeduEmailOptions {
  geduName: string;
  gamerName: string;
  newGeduName: string;
  productName: string;
}

export function buildGamerMovedOldGeduEmail({ geduName, gamerName, newGeduName, productName }: GamerMovedOldGeduEmailOptions): string {
  const content = `
    ${heading("A gamer has been moved from your group")}
    ${paragraph(`Hi ${styledName(geduName)}, ${styledName(gamerName)} has been moved from your group to ${styledName(newGeduName)}'s group in ${styledProductName(productName)}.`)}
  `;
  return wrapInLayout({ title: "Gamer Moved", content });
}

// --- Gamer Moved (New Gedu) ---

interface GamerMovedNewGeduEmailOptions {
  geduName: string;
  gamerName: string;
  oldGeduName: string;
  productName: string;
}

export function buildGamerMovedNewGeduEmail({ geduName, gamerName, oldGeduName, productName }: GamerMovedNewGeduEmailOptions): string {
  const content = `
    ${heading("A gamer has been moved to your group")}
    ${paragraph(`Hi ${styledName(geduName)}, ${styledName(gamerName)} has been moved to your group from ${styledName(oldGeduName)}'s group in ${styledProductName(productName)}.`)}
  `;
  return wrapInLayout({ title: "New Gamer in Group", content });
}
