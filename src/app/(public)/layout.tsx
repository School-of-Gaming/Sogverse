import { Footer } from "@/components/layout";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
