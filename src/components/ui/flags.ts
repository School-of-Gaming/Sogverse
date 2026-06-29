import FI from "country-flag-icons/react/3x2/FI";
import GB from "country-flag-icons/react/3x2/GB";
import SE from "country-flag-icons/react/3x2/SE";
import US from "country-flag-icons/react/3x2/US";

/**
 * The only country flags the app renders, imported individually.
 *
 * Why not `react-phone-number-input/flags`: that module re-exports
 * `country-flag-icons`' default export, which is a single object literal
 * referencing all ~257 flag components. Importing that binding — and indexing
 * it with a runtime country code, as our flag consumers do — pulls every flag
 * into the bundle, because tree-shaking drops unused *exports*, not unused
 * *object properties*. Since the locale picker lives in the global header, that
 * was ~56 KB gzipped of flag SVGs on every route. Named per-country imports are
 * separate export bindings, so only these four ship.
 *
 * Add a country here when a new locale, phone country, or spoken language needs
 * its flag.
 */
export const FLAGS = { FI, GB, SE, US };

export type FlagComponent = (typeof FLAGS)[keyof typeof FLAGS];
