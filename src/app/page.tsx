import Link from "next/link";
import { ArrowRight, Shield, Users, Sparkles, Gamepad2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Footer } from "@/components/layout";
import { ROUTES } from "@/lib/constants";

const features = [
  {
    title: "Minecraft Clubs with Gedus",
    description: "Our game educators — Gedus — are gamers themselves. They understand that as children, identity and friendships are built both online and offline. Every session is guided by someone who truly gets it.",
    icon: Gamepad2,
  },
  {
    title: "Screen Time Becomes Quality Time",
    description: "Skilfully designed clubs turn gaming into a playful learning experience where children develop real skills and have fun doing what they love.",
    icon: Sparkles,
  },
  {
    title: "New Friends, Real Connections",
    description: "Children build genuine, lasting friendships through shared adventures. No one is left without a friend. The gamer's oath means treating each other with kindness — online and offline.",
    icon: Users,
  },
  {
    title: "Parents Are Part of It",
    description: "Parental game education is just as important as the clubs themselves. We keep you informed, involved, and equipped to support your child's gaming journey.",
    icon: Shield,
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      {/* Hero Section */}
      <section className="relative -mt-16 pt-16 overflow-hidden bg-hero-gradient">
        <div className="container mx-auto px-4 py-24 sm:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="font-display text-4xl font-bold tracking-tight sm:text-6xl">
              Where
              <br />
              <span className="text-primary">Screen Time</span>
              <br />
              Becomes
              <br />
              <span className="text-secondary">Quality Time</span>
            </h1>
            <p className="mt-6 text-lg leading-8 text-muted-foreground">
              Our skilfully designed Minecraft clubs promote healthy gaming as a
              hobby. World-class game educators make every session a playful
              learning experience where children make new friends, develop their
              unique talents, and have fun doing what they love.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href={ROUTES.products}>
                <Button variant="outline" size="lg">
                  View Clubs
                </Button>
              </Link>
              <Link href={ROUTES.register}>
                <Button size="lg" className="gap-2">
                  Get Started
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Make Gaming a Great Hobby
          </h2>
          <p className="mt-4 text-muted-foreground">
            Gaming is a hobby just like any other — better with good friends
            and with a professional instructor who is there to guide and help.
          </p>
        </div>
        <div className="mx-auto mt-16 grid max-w-5xl gap-8 sm:grid-cols-2">
          {features.map((feature) => (
            <Card key={feature.title} className="bg-card/50">
              <CardHeader>
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* How It Works Section */}
      <section className="bg-muted/30 py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              How It Works
            </h2>
            <p className="mt-4 text-muted-foreground">
              Join a Minecraft club in three simple steps.
            </p>
          </div>
          <div className="mx-auto mt-16 grid max-w-4xl gap-8 md:grid-cols-3">
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
                1
              </div>
              <h3 className="mt-4 text-lg font-semibold">Create Your Account</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Sign up as a parent and create gamer accounts for your children.
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-2xl font-bold text-secondary-foreground">
                2
              </div>
              <h3 className="mt-4 text-lg font-semibold">Pick a Club</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Browse our clubs and enroll your gamers in the ones that fit their schedule and interests.
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
                3
              </div>
              <h3 className="mt-4 text-lg font-semibold">Join the Adventure</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Your gamers log in each week, meet their Gedu, and dive into Minecraft adventures with new friends.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-24">
        <Card className="mx-auto max-w-3xl bg-cta-gradient">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <h2 className="text-2xl font-bold sm:text-3xl">
              Ready to Turn Gaming into Learning?
            </h2>
            <p className="mt-4 text-muted-foreground">
              Give your child a fun, safe place to play, learn, and make
              friends — guided by a professional game educator.
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <Link href={ROUTES.about}>
                <Button variant="outline" size="lg">Learn More</Button>
              </Link>
              <Link href={ROUTES.register}>
                <Button size="lg">
                  Create Free Account
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>

      <Footer />
    </div>
  );
}
