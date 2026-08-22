/**
 * Colours for the simulated browser tab strip on `/logo`.
 *
 * These are a *picture of Chrome's UI*, not our palette, which is why they are
 * literal hex rather than semantic tokens: there is no `--tab-strip-background`
 * and there should not be one, because the value has to match what Chrome
 * actually paints or the demo stops being a demo. The styling rule this
 * sidesteps ("all colours come from CSS custom properties") exists so brand
 * colour has one source of truth — the same reasoning that puts hex in
 * `lib/constants/colors.ts` for canvas and email, where CSS variables cannot go.
 *
 * Everything else on the page uses semantic classes as normal.
 */
export const CHROME = {
  light: { strip: "#d3d7de", tab: "#f1f3f4", text: "#3c4043" },
  dark: { strip: "#1c1f22", tab: "#35383d", text: "#e8eaed" },
} as const;

export type ChromeTheme = keyof typeof CHROME;
