/**
 * Layout for the public on-the-fly voice room.
 *
 * The (voice) group exists specifically so this route can opt out of the
 * standard `Header` rendered by every other group, and replace it with the
 * simplified `InstantVoiceHeader` (no nav, no auth menu, code copy button).
 * No sidebar, no footer — anyone with the link should land on a focused
 * call experience, not on the dashboard chrome.
 */
export default function InstantVoiceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
