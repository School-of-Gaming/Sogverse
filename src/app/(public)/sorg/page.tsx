import type { Metadata } from "next";
import Link from "next/link";
import {
  BookOpen,
  Trophy,
  CalendarCheck,
  PartyPopper,
  Shirt,
  Zap,
  Lock,
  Gift,
  HelpCircle,
  Coins,
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
  title: "Sorg - The Sogverse Currency",
  description:
    "Learn about Sorg, the virtual currency of the Sogverse. Earn Sorgs by completing lessons, unlocking achievements, and more.",
};

const earnMethods = [
  {
    title: "Complete Lessons",
    description:
      "Earn Sorgs every time you finish a lesson or learning module. The harder the challenge, the bigger the reward.",
    icon: BookOpen,
  },
  {
    title: "Unlock Achievements",
    description:
      "Hit milestones and earn bonus Sorgs. Achievements reward consistency, mastery, and exploration.",
    icon: Trophy,
  },
  {
    title: "Daily Logins",
    description:
      "Show up every day and collect your daily Sorg bonus. Streaks unlock even bigger payouts.",
    icon: CalendarCheck,
  },
  {
    title: "Special Events",
    description:
      "Participate in limited-time events and seasonal challenges for exclusive Sorg rewards.",
    icon: PartyPopper,
  },
];

const spendMethods = [
  {
    title: "Avatar Items",
    description:
      "Customize your look with outfits, accessories, and emotes from the Sorg Shop.",
    icon: Shirt,
  },
  {
    title: "Power-Ups",
    description:
      "Boost your gameplay with hints, extra lives, and time extensions.",
    icon: Zap,
  },
  {
    title: "Unlock Content",
    description:
      "Access bonus levels, hidden worlds, and exclusive learning adventures.",
    icon: Lock,
  },
  {
    title: "Gift Friends",
    description:
      "Send Sorgs to your friends to help them on their learning journey.",
    icon: Gift,
  },
];

const faqs = [
  {
    question: "Is Sorg real money?",
    answer:
      "No. Sorg is a virtual currency that exists only within the Sogverse. It cannot be exchanged for real money or transferred outside the platform.",
  },
  {
    question: "Can parents control spending?",
    answer:
      "Absolutely. Parents have full visibility into their child's Sorg balance and spending history. Spending limits and approval settings are available in the parent dashboard.",
  },
  {
    question: "Do Sorgs expire?",
    answer:
      "No. Once earned, Sorgs stay in your account until you decide to spend them. There are no expiration dates or hidden fees.",
  },
  {
    question: "Can I buy Sorgs with real money?",
    answer:
      "Yes! Parents can purchase Sorg packs or subscribe to a monthly plan. Check out our packages above. Sorgs can also be earned through gameplay and learning activities.",
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
          The currency that powers the Sogverse. Earn it, spend it, and watch
          your progress grow.
        </p>
      </div>

      {/* Overview Card */}
      <div className="mx-auto mt-16 max-w-4xl">
        <Card className="bg-gradient-to-r from-primary/5 to-secondary/5">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">
              The Currency of the Sogverse
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-lg text-muted-foreground">
              Sorgs are the virtual currency that fuels everything in the
              Sogverse. Earn them through learning, playing, and achieving — or
              purchase packs to give your gamer a head start. Every Sorg powers
              real progress on the educational journey.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Buy Sorgs */}
      <TokenPurchaseSection
        oneTimePackages={oneTimePackages}
        subscriptionPackages={subscriptionPackages}
      />

      {/* How to Earn */}
      <div className="mx-auto mt-16 max-w-5xl">
        <h2 className="text-center text-2xl font-bold">How to Earn Sorgs</h2>
        <p className="mt-2 text-center text-muted-foreground">
          Put in the work, reap the rewards
        </p>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {earnMethods.map((method) => (
            <Card key={method.title}>
              <CardHeader>
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <method.icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{method.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  {method.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* How to Spend */}
      <div className="mx-auto mt-16 max-w-5xl">
        <h2 className="text-center text-2xl font-bold">How to Spend Sorgs</h2>
        <p className="mt-2 text-center text-muted-foreground">
          Your Sorgs, your choice
        </p>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {spendMethods.map((method) => (
            <Card key={method.title}>
              <CardHeader>
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-secondary/10">
                    <method.icon className="h-6 w-6 text-secondary" />
                  </div>
                  <CardTitle className="text-lg">{method.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  {method.description}
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
            <h3 className="text-xl font-semibold">Ready to Start Earning?</h3>
            <p className="mt-2 text-muted-foreground">
              Join the Sogverse today and start earning your first Sorgs. Every
              lesson brings you closer to your next reward.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-4 sm:flex-row">
              <Link href={ROUTES.register} className={buttonVariants({ size: "lg" })}>
                Get Started
              </Link>
              <Link href={ROUTES.products} className={buttonVariants({ variant: "outline", size: "lg" })}>
                Explore Products
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
