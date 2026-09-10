import { Header } from "@/components/layout";

/**
 * Layout for the public on-the-fly voice room.
 *
 * The (voice) group exists so this route can render the standard app `Header`
 * **without the site footer** — the `(public)` group's shape minus the footer.
 * A live call page should not end in marketing links and legal nav; everything
 * below the header belongs to the call. The header itself is the ordinary one,
 * so the logo, the auth avatar and the locale picker behave exactly as they do
 * everywhere else (scheduled group voice rooms already run calls under it).
 *
 * No sidebar either: anyone with the link lands on a focused call experience,
 * not on dashboard chrome.
 */
export default function InstantVoiceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">{children}</main>
    </div>
  );
}
