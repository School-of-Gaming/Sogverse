import { Header, Footer } from "@/components/layout";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <div className="flex h-full flex-col">
        <main className="flex flex-1 items-center justify-center p-4">
          {children}
        </main>
        <Footer />
      </div>
    </>
  );
}
