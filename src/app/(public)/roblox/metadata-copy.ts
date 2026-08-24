/**
 * The programme page's social copy — French, for every locale, on purpose.
 *
 * This is a deliberate exception to the rule that user-facing strings are
 * translated for every file in `messages/`, and it is narrow: it covers the
 * title and description this one page hands to link previews and search, and
 * nothing the page itself renders. The programme is run with Lynx Educate for a
 * French-speaking audience, the page is shared by URL into French channels
 * rather than found by browsing, and a preview card is composed for whoever the
 * link is *sent to* — not for whichever locale the account that pasted it
 * happens to be in. Translating these five ways would produce four cards nobody
 * is meant to see and one that is right by accident.
 *
 * They live here rather than in the page because the card's `alt` text has to be
 * the same string as the title, and the two are declared in different files.
 * The dash in the title is a SPACED EN DASH (U+2013) — never a hyphen, never an
 * em dash — the same character the `School of Gaming – Sogverse` lockup uses.
 */

export const ROBLOX_OG_TITLE = "SOG x Lynx – Crée ton propre jeu Roblox";

export const ROBLOX_OG_DESCRIPTION =
  "Programme gratuit pour les jeunes, animé par de vrais Game Educators. Par Lynx Educate et School of Gaming, en collaboration avec Roblox.";
