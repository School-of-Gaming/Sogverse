/**
 * Pass-through layout for the full-page preview scenes.
 *
 * The preview routes get their own route group precisely so they inherit *no*
 * chrome: each scene composes the header/footer/sidebar shell of the page it is
 * mocking (see `src/components/preview/preview-chrome.tsx`). Sitting in the
 * `(public)` group instead would silently wrap a dashboard scene in the public
 * header and footer. Route groups don't affect URLs, so the paths stay
 * `/preview/...`.
 */
export default function PreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
