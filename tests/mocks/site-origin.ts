// The site's address in test fixtures: an origin under `.test`, which RFC 6761
// reserves, so it can never be a real host and never be ours. A test about
// "our site" stubs NEXT_PUBLIC_SITE_URL to this and builds its URLs from it, so
// renaming the production host touches no test.
export const SITE_HOST = "site.test";
export const SITE_ORIGIN = `https://${SITE_HOST}`;
