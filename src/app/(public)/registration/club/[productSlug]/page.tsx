// Municipality clubs live under /registration/club/[slug]. The detail page
// component itself is shared with /browse-mockup/[slug] — re-exporting here
// keeps the URL honest (parents arrive and stay on /registration) without
// duplicating the detail + signup UI.
export { default } from "../../../browse-mockup/[productSlug]/page";
