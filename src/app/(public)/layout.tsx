import { Header, Footer } from "@/components/layout";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <div className="flex min-h-screen flex-col pt-16">
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
    </>
  );
}
