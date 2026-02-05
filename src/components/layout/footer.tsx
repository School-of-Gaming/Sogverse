import Link from "next/link";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-card">
      <div className="container mx-auto px-4 py-8">
        <div className="grid gap-8 md:grid-cols-4">
          {/* Brand */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="font-display text-xl font-bold text-primary">
                SOG
              </span>
              <span className="text-lg font-semibold">Sogverse</span>
            </div>
            <p className="text-sm text-muted-foreground">
              School of Gaming - Educational gaming for the next generation.
            </p>
          </div>

          {/* Products */}
          <div className="space-y-4">
            <h3 className="font-semibold">Products</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/products" className="hover:text-primary">
                  All Products
                </Link>
              </li>
              <li>
                <Link href="/products?category=starter" className="hover:text-primary">
                  Starter Packs
                </Link>
              </li>
              <li>
                <Link href="/products?category=subscription" className="hover:text-primary">
                  Subscriptions
                </Link>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div className="space-y-4">
            <h3 className="font-semibold">Company</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/about" className="hover:text-primary">
                  About Us
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-primary">
                  Contact
                </Link>
              </li>
              <li>
                <Link href="/careers" className="hover:text-primary">
                  Careers
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div className="space-y-4">
            <h3 className="font-semibold">Legal</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/privacy" className="hover:text-primary">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-primary">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/cookies" className="hover:text-primary">
                  Cookie Policy
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 border-t border-border pt-8 text-center text-sm text-muted-foreground">
          <p>&copy; {currentYear} School of Gaming. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
