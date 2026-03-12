import Link from "next/link";
import { ArrowRight, Gamepad2, Users, GraduationCap, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Footer } from "@/components/layout";

const features = [
  {
    title: "Safe Gaming Environment",
    description: "Parent-controlled accounts with age-appropriate content and no exposure to emails or external contacts.",
    icon: Shield,
  },
  {
    title: "Educational Content",
    description: "Games designed to teach while entertaining. From problem-solving to creativity, learning is built in.",
    icon: GraduationCap,
  },
  {
    title: "Family Connections",
    description: "Parents create and manage gamer accounts for their children. Stay in control while they have fun.",
    icon: Users,
  },
  {
    title: "Progress Tracking",
    description: "Monitor achievements, learning milestones, and gaming time all from your parent dashboard.",
    icon: Gamepad2,
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      {/* Hero Section */}
      <section className="relative -mt-16 pt-16 overflow-hidden bg-[linear-gradient(to_bottom,_transparent_0%,_hsl(var(--background))_100%),linear-gradient(to_right,_hsl(var(--primary)/0.2),_transparent_50%,_hsl(var(--secondary)/0.1))]">
        <div className="container mx-auto px-4 py-24 sm:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="font-display text-4xl font-bold tracking-tight sm:text-6xl">
              <span className="text-primary">Learn</span> Through{" "}
              <span className="text-secondary">Play</span>
            </h1>
            <p className="mt-6 text-lg leading-8 text-muted-foreground">
              Sogverse is the educational gaming platform where children learn valuable
              skills through engaging games, while parents stay in control. Safe,
              fun, and educational.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/register">
                <Button size="lg" className="gap-2">
                  Get Started
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/products">
                <Button variant="outline" size="lg">
                  View Products
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
            Gaming Reimagined for Education
          </h2>
          <p className="mt-4 text-muted-foreground">
            We combine the best of gaming with educational content to create
            an experience that children love and parents trust.
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
              Get your family started with Sogverse in three simple steps.
            </p>
          </div>
          <div className="mx-auto mt-16 grid max-w-4xl gap-8 md:grid-cols-3">
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
                1
              </div>
              <h3 className="mt-4 text-lg font-semibold">Create Your Account</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Sign up as a parent with your email. It only takes a minute.
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-2xl font-bold text-secondary-foreground">
                2
              </div>
              <h3 className="mt-4 text-lg font-semibold">Add Your Gamers</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Create gamer accounts for your children with custom usernames.
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
                3
              </div>
              <h3 className="mt-4 text-lg font-semibold">Start Learning</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Your kids log in and start playing educational games!
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-24">
        <Card className="mx-auto max-w-3xl bg-gradient-to-r from-primary/10 to-secondary/10">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <h2 className="text-2xl font-bold sm:text-3xl">
              Ready to Start Your Gaming Journey?
            </h2>
            <p className="mt-4 text-muted-foreground">
              Join thousands of families who are already learning through play.
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <Link href="/register">
                <Button size="lg">Create Free Account</Button>
              </Link>
              <Link href="/about">
                <Button variant="outline" size="lg">
                  Learn More
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
