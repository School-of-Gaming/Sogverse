import { DARK_THEME } from "@/lib/constants/colors";
import { wrapInLayout } from "./layout";
import { escapeHtml } from "./utils";

// --- Shared helpers ---

function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;color:${DARK_THEME.foreground};font-size:14px;line-height:1.6;">${text}</p>`;
}

function heading(text: string): string {
  return `<h2 style="margin:0 0 16px;font-size:18px;font-weight:bold;color:${DARK_THEME.foreground};">${text}</h2>`;
}

function productBadge(productName: string): string {
  return `<span style="display:inline-block;padding:2px 10px;background:${DARK_THEME.bg};border:1px solid ${DARK_THEME.border};border-radius:4px;font-size:13px;color:${DARK_THEME.mutedFg};">${escapeHtml(productName)}</span>`;
}

// --- Group Added ---

interface GroupAddedEmailOptions {
  geduName: string;
  productName: string;
}

export function buildGroupAddedEmail({ geduName, productName }: GroupAddedEmailOptions): string {
  const content = `
    ${heading("You've been assigned to a new group")}
    ${paragraph(`Hi ${escapeHtml(geduName)}, you've been assigned to a new group for ${productBadge(productName)}.`)}
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
    ${paragraph(`Hi ${escapeHtml(geduName)}, your group for ${productBadge(productName)} has been removed by an admin.`)}
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
    ${paragraph(`Hi ${escapeHtml(oldGeduName)}, your group for ${productBadge(productName)} has been reassigned to <strong>${escapeHtml(newGeduName)}</strong>.`)}
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
    ${paragraph(`Hi ${escapeHtml(newGeduName)}, you've been assigned to a group for ${productBadge(productName)} (previously led by <strong>${escapeHtml(oldGeduName)}</strong>).`)}
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
    ${heading("Your child's educator has changed")}
    ${paragraph(`Hi ${escapeHtml(parentName)}, the educator for <strong>${escapeHtml(gamerName)}</strong>'s group in ${productBadge(productName)} has changed from <strong>${escapeHtml(oldGeduName)}</strong> to <strong>${escapeHtml(newGeduName)}</strong>.`)}
  `;
  return wrapInLayout({ title: "Educator Change", content });
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
    ${paragraph(`Hi ${escapeHtml(parentName)}, <strong>${escapeHtml(gamerName)}</strong> has been moved from <strong>${escapeHtml(oldGeduName)}</strong>'s group to <strong>${escapeHtml(newGeduName)}</strong>'s group in ${productBadge(productName)}.`)}
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
    ${paragraph(`Hi ${escapeHtml(geduName)}, <strong>${escapeHtml(gamerName)}</strong> has been moved from your group to <strong>${escapeHtml(newGeduName)}</strong>'s group in ${productBadge(productName)}.`)}
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
    ${paragraph(`Hi ${escapeHtml(geduName)}, <strong>${escapeHtml(gamerName)}</strong> has been moved to your group from <strong>${escapeHtml(oldGeduName)}</strong>'s group in ${productBadge(productName)}.`)}
  `;
  return wrapInLayout({ title: "New Gamer in Group", content });
}
