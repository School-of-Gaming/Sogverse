/**
 * The programme page's social copy — French, for every locale, on purpose.
 *
 * This is a deliberate exception to the rule that user-facing strings are
 * translated for every file in `messages/`, and it is narrow: it covers what
 * this one page hands to link previews — the `openGraph`/`twitter` blocks, the
 * card image and its `alt` — and nothing the *viewer* reads in their own
 * browser. The document title is not part of the exception: a tab is read by
 * whoever has the page open, the page body is fully localised, so the title
 * follows the viewer's locale like every other page's. The programme is run
 * with Lynx Educate for a French-speaking audience, the page is shared by URL
 * into French channels rather than found by browsing, and a preview card is
 * composed for whoever the link is *sent to* — not for whichever locale the
 * account that pasted it happens to be in. Translating the card five ways
 * would produce four cards nobody is meant to see and one that is right by
 * accident.
 *
 * They live here rather than in the page because the card's `alt` text has to be
 * the same string as the title, and the two are declared in different files.
 * The dash in the title is a SPACED EN DASH (U+2013) — never a hyphen, never an
 * em dash — the same character the `School of Gaming – Sogverse` lockup uses.
 */

export const ROBLOX_OG_TITLE = "SOG x Lynx – Crée ton propre jeu Roblox";

export const ROBLOX_OG_DESCRIPTION =
  "Programme gratuit pour les jeunes, animé par de vrais Game Educators. Par Lynx Educate et School of Gaming, en collaboration avec Roblox.";

/**
 * The trademark notice Roblox requires on any surface carrying their mark, in
 * the approved French wording.
 *
 * **This must equal `roblox.legal.roblox` in `messages/fr.json`, verbatim.**
 * The page renders that key; the Open Graph card cannot, because next/og bakes
 * its text into a PNG at build time with no request and therefore no locale to
 * translate against. So the card needs a literal, and a literal beside a
 * message key is a copy that drifts — a re-worded notice landing in the catalog
 * would leave the card asserting the old one, on the one surface a partner's
 * legal team is most likely to see. `tests/unit/roblox-og-copy.test.ts` reads
 * the catalog and fails the build if the two ever disagree.
 *
 * Unlike the title and description above, this is not an exception to the
 * translation rule: the notice *is* translated, five ways, in `messages/`. This
 * constant only pins the French one, because French is the language the whole
 * card is set in.
 */
export const ROBLOX_TRADEMARK_NOTICE =
  "© 2024 Roblox Corporation. Roblox, le logo Roblox et Roblox Tilt font partie des marques déposées et non déposées de Roblox Corporation aux États-Unis et dans d’autres pays. Utilisées avec autorisation.";
