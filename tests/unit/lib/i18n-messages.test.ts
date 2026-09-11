import { describe, expect, it } from "vitest";
import { loadMessages } from "@/i18n/messages";
import en from "@/../messages/en.json";
import fi from "@/../messages/fi.json";
import tlh from "@/../messages/tlh.json";

/**
 * Klingon is the one catalog with holes in it. The legal surface — the policy
 * and terms namespaces, the attributions credit, those pages' metadata titles
 * and search-snippet descriptions, and every label that names one of the
 * documents — is left out so it resolves
 * to English: binding text and licence conditions are not a place for an
 * in-character rendering, and omitting the keys is what keeps English their
 * single source of truth rather than something a future edit has to remember to
 * mirror.
 *
 * That makes the loader, not the catalog file, the thing worth pinning. Two
 * properties: Klingon comes back complete and English where it is silent, and
 * **no other locale gets the same treatment** — a missing Finnish key must stay
 * a failure rather than quietly becoming English.
 */
describe("loadMessages", () => {
  it("fills Klingon's legal omissions with the English text", async () => {
    const messages = await loadMessages("tlh");

    expect(messages.privacy).toEqual(en.privacy);
    expect(messages.terms).toEqual(en.terms);
    expect(messages.discipline).toEqual(en.discipline);
    expect(messages.robloxPrivacy).toEqual(en.robloxPrivacy);
    expect(messages.robloxSafeguarding).toEqual(en.robloxSafeguarding);
    expect(messages.robloxTerms).toEqual(en.robloxTerms);
    expect(messages.attributions).toEqual(en.attributions);
    expect(messages.legal).toEqual(en.legal);
  });

  it("fills the cookie banner, buttons included", async () => {
    const messages = await loadMessages("tlh");

    // Not a page *about* a policy — the instrument that records one. The
    // buttons are why it is the whole namespace: a refusal has to be as legible
    // as an acceptance, which a refusal written in character is not.
    expect(messages.consent).toEqual(en.consent);
    expect(messages.consent.rejectAll).toBe(en.consent.rejectAll);
  });

  it("fills the labels that name one of those documents too", async () => {
    const messages = await loadMessages("tlh");

    // A footer link has to call a page what the page itself calls it.
    expect(messages.footer.privacy).toBe(en.footer.privacy);
    expect(messages.footer.terms).toBe(en.footer.terms);
    expect(messages.footer.antiBullying).toBe(en.footer.antiBullying);
    expect(messages.footer.attributions).toBe(en.footer.attributions);

    expect(messages.metadata.pages.privacy).toBe(en.metadata.pages.privacy);
    expect(messages.metadata.pages.antiBullying).toBe(en.metadata.pages.antiBullying);
    expect(messages.metadata.pages.robloxSafeguarding).toBe(
      en.metadata.pages.robloxSafeguarding,
    );

    // And the snippet each of those pages is met by in a search result — the
    // document describing itself, so it belongs to the document.
    expect(messages.metadata.descriptions.privacy).toBe(
      en.metadata.descriptions.privacy,
    );
    expect(messages.metadata.descriptions.terms).toBe(en.metadata.descriptions.terms);
    expect(messages.metadata.descriptions.antiBullying).toBe(
      en.metadata.descriptions.antiBullying,
    );
    expect(messages.metadata.descriptions.attributions).toBe(
      en.metadata.descriptions.attributions,
    );

    expect(messages.roblox.legal.privacy).toBe(en.roblox.legal.privacy);
    expect(messages.roblox.legal.safeguarding).toBe(en.roblox.legal.safeguarding);
    expect(messages.roblox.legal.terms).toBe(en.roblox.legal.terms);

    // The signup panel's consent checkboxes name the same two documents, so
    // they are labelled the same way — the sentence around them stays Klingon.
    expect(messages.consentDocuments).toEqual(en.consentDocuments);
  });

  it("leaves everything Klingon does translate in Klingon", async () => {
    const messages = await loadMessages("tlh");

    expect(messages.footer.copyright).toBe(tlh.footer.copyright);
    expect(messages.footer.copyright).not.toBe(en.footer.copyright);
    expect(messages.roblox.legal.roblox).toBe(tlh.roblox.legal.roblox);
    expect(messages.metadata.pages.about).toBe(tlh.metadata.pages.about);
    expect(messages.metadata.descriptions.about).toBe(tlh.metadata.descriptions.about);
    expect(messages.header.nav).toEqual(tlh.header.nav);
    // The consent *sentence* is ordinary product copy, unlike the document
    // names and the bundle label it points at.
    expect(messages.productDetail.signupPanel.consents.agree).toBe(
      tlh.productDetail.signupPanel.consents.agree,
    );
  });

  it("hands every other locale its own catalog, unmerged", async () => {
    // The discipline this protects: a Finnish key that goes missing has to keep
    // failing loudly instead of silently rendering in English.
    expect(await loadMessages("fi")).toBe(fi);
    expect(await loadMessages("en")).toBe(en);
  });

  it("builds a new object rather than mutating the imported catalogs", async () => {
    await loadMessages("tlh");

    expect(Object.keys(en.about)).not.toContain("easterEgg");
    expect(en.footer.copyright).not.toBe(tlh.footer.copyright);
    expect(Object.keys(tlh)).not.toContain("privacy");
    // Absence is the assertion that matters: a namespace merely *equal* to
    // English is one nothing keeps in step the next time English is edited.
    expect(Object.keys(tlh)).not.toContain("consent");
    // Same for the legal snippets, one level down: `tlh` carries the marketing
    // and auth descriptions and is silent on the four documents’.
    expect(Object.keys(tlh.metadata.descriptions)).not.toContain("privacy");
    expect(Object.keys(tlh.metadata.descriptions)).not.toContain("terms");
    expect(Object.keys(tlh.metadata.descriptions)).not.toContain("antiBullying");
    expect(Object.keys(tlh.metadata.descriptions)).not.toContain("attributions");
  });
});
