import { Header, Footer } from "@/components/layout";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <div className="flex min-h-screen flex-col pt-16">
        <main className="flex flex-1 items-center justify-center p-4">
          {children}
        </main>
        <Footer />
      </div>
    </>
  );
}
