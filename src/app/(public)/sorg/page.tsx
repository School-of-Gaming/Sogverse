import type { Metadata } from "next";
import Link from "next/link";
import {
  Coins,
  CalendarCheck,
  ShieldCheck,
  Wallet,
  RefreshCw,
  HelpCircle,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/lib/constants";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TokenPurchaseSection } from "@/components/tokens";
import { getStripeProducts } from "@/lib/stripe/products";

export const metadata: Metadata = {
  title: "Sorg - the Sogverse Currency",
  description:
    "Sorg is the currency that powers your child's club sessions in the Sogverse. Purchase tokens and pay per session with full flexibility.",
  openGraph: {
    title: "Sorg - the Sogverse Currency",
    description: "Learn about Sorg, the virtual currency of the Sogverse. Purchase tokens and pay per session with full flexibility.",
  },
};

const benefits = [
  {
    title: "Pay Per Session",
    description:
      "Sorgs are deducted once a week for each enrolled club. You only pay for the sessions your child attends — no long-term contracts.",
    icon: CalendarCheck,
  },
  {
    title: "Full Transparency",
    description:
      "See exactly where every Sorg goes. Your parent dashboard shows your balance, transaction history, and upcoming charges.",
    icon: Wallet,
  },
  {
    title: "Flexible Top-Ups",
    description:
      "Buy a one-time token pack when you need it, or subscribe for a monthly allowance at a better rate. Change or cancel anytime.",
    icon: RefreshCw,
  },
  {
    title: "Safe by Design",
    description:
      "Sorgs exist only within the Sogverse. Only parents can see balances and make purchases — children are never exposed to the currency. No surprises.",
    icon: ShieldCheck,
  },
];

const faqs = [
  {
    question: "Is Sorg real money?",
    answer:
      "Sorgs are purchased with real money but exist only within the Sogverse. They cannot be transferred outside the platform, but if you ever want a refund on unused Sorgs, just contact our support team.",
  },
  {
    question: "How are Sorgs spent?",
    answer:
      "Each club session costs a set number of Sorgs, shown on the club page. Sorgs are automatically deducted once a week when your child's session is scheduled.",
  },
  {
    question: "Can parents control spending?",
    answer:
      "Yes. Sorgs are completely invisible to children. Only parents can see balances, purchase tokens, and view spending history in the parent dashboard.",
  },
  {
    question: "Do Sorgs expire?",
    answer:
      "No. Once purchased, Sorgs stay in your account until they are used for club sessions. There are no expiration dates or hidden fees.",
  },
  {
    question: "Can I get a refund?",
    answer:
      "If you unenroll a gamer at least 24 hours before the start of a session, the Sorgs for that session are automatically refunded to your balance. For anything else, contact our support team — we're happy to help.",
  },
];

export default async function SorgPage() {
  const { oneTimePackages, subscriptionPackages } = await getStripeProducts();

  return (
    <div className="container mx-auto px-4 py-12">
      {/* Hero Section */}
      <div className="mx-auto max-w-3xl text-center">
        <div className="mb-4 flex justify-center">
          <Coins className="h-16 w-16 text-primary" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          What is <span className="text-primary">Sorg</span>?
        </h1>
        <p className="mt-6 text-lg leading-8 text-muted-foreground">
          Sorg is the currency that powers your child&apos;s club sessions in
          the Sogverse. Parents purchase Sorgs and they are used to pay for
          weekly sessions — simple, transparent, and flexible.
        </p>
      </div>

      {/* Overview Card */}
      <div className="mx-auto mt-16 max-w-4xl">
        <Card className="bg-cta-gradient-subtle">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">How It Works</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-lg text-muted-foreground">
              Each club session costs a set number of Sorgs. When you enroll
              your child in a club, Sorgs are deducted automatically each week
              for their session. Buy a token pack or subscribe monthly —
              whichever suits your family best.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Buy Sorgs */}
      <TokenPurchaseSection
        oneTimePackages={oneTimePackages}
        subscriptionPackages={subscriptionPackages}
      />

      {/* Benefits */}
      <div className="mx-auto mt-16 max-w-5xl">
        <h2 className="text-center text-2xl font-bold">
          Why Sorgs?
        </h2>
        <p className="mt-2 text-center text-muted-foreground">
          A simple, fair way to pay for your child&apos;s clubs
        </p>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {benefits.map((benefit) => (
            <Card key={benefit.title}>
              <CardHeader>
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <benefit.icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{benefit.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  {benefit.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* FAQ Section */}
      <div className="mx-auto mt-16 max-w-3xl">
        <h2 className="text-center text-2xl font-bold">
          Frequently Asked Questions
        </h2>
        <div className="mt-8 space-y-4">
          {faqs.map((faq) => (
            <Card key={faq.question}>
              <CardHeader>
                <div className="flex items-start gap-3">
                  <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <CardTitle className="text-base">{faq.question}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="-mt-2 pl-12">
                <CardDescription className="text-base">
                  {faq.answer}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* CTA Section */}
      <div className="mx-auto mt-16 max-w-2xl text-center">
        <Card className="bg-muted/30">
          <CardContent className="py-8">
            <h3 className="text-xl font-semibold">Ready to Get Started?</h3>
            <p className="mt-2 text-muted-foreground">
              Create an account, grab some Sorgs, and enroll your child in
              their first club.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-4 sm:flex-row">
              <Link href={ROUTES.products} className={buttonVariants({ variant: "outline", size: "lg" })}>
                Explore Clubs
              </Link>
              <Link href={ROUTES.register} className={buttonVariants({ size: "lg" })}>
                Get Started
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
