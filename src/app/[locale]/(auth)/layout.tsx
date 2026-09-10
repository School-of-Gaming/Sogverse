import { Header, Footer } from "@/components/layout";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex flex-1 items-center justify-center p-4">
        {children}
      </main>
      <Footer />
    </div>
  );
}
