import { Header } from "@/components/layout";

/**
 * Layout for the instant voice room.
 *
 * Anyone with the link may open the room, signed in or not, so the route
 * belongs in neither the public group nor the signed-in dashboard group and
 * takes its own: the standard header over the room, and nothing else.
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
