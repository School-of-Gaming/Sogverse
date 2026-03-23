import type { Metadata } from "next";
import Link from "next/link";
import { Heart, Shield, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROUTES } from "@/lib/constants";

export const metadata: Metadata = {
  title: "About Us",
  description: "School of Gaming — where screen time becomes quality time through Minecraft clubs led by professional game educators.",
  openGraph: {
    title: "About Sogverse",
    description: "Learn about Sogverse and our mission to make screen time quality time through Minecraft clubs led by professional game educators.",
  },
};

const values = [
  {
    title: "Play Is Essential for Children",
    description: "Play is a child's work. It is crucial for their wellbeing and development. Our clubs are designed to promote free play that feeds imagination, curiosity, and creativity — powerful tools to face any future.",
    icon: Sparkles,
  },
  {
    title: "Friends Carry Over Obstacles",
    description: "No one should be left without a friend. Moments of play and friendship carry kids over any obstacle in life. In our clubs, children build genuine connections through shared adventures.",
    icon: Heart,
  },
  {
    title: "Keep Children Safe Online",
    description: "We nurture inclusive, kind, and safe online communities. We grow caring and polite digital citizens who look out for their fellow gamers. Zero tolerance for bullying and toxicity.",
    icon: Shield,
  },
  {
    title: "Family in the Loop",
    description: "Parents are partners. You stay in control of your child's gaming experience while they enjoy the freedom to explore, create, and make friends in a safe environment.",
    icon: Users,
  },
];

export default function AboutPage() {
  return (
    <div className="container mx-auto px-4 py-12">
      {/* Hero Section */}
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          About <span className="text-primary">School of Gaming</span>
        </h1>
        <p className="mt-6 text-lg leading-8 text-muted-foreground">
          In our Minecraft clubs, screen time becomes quality time. We bring
          together children, professional game educators, and the game kids
          already love — creating playful learning experiences where they make
          new friends, develop real skills, and have fun.
        </p>
      </div>

      {/* Quote */}
      <div className="mx-auto mt-16 max-w-3xl text-center">
        <blockquote className="text-xl italic text-muted-foreground">
          &ldquo;What is true now, was once just your imagination.&rdquo;
        </blockquote>
        <p className="mt-2 text-sm text-muted-foreground">
          — The Principal of the School of Gaming
        </p>
      </div>

      {/* Mission Section */}
      <div className="mx-auto mt-16 max-w-4xl">
        <Card className="bg-gradient-to-r from-primary/5 to-secondary/5">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Our Mission</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-lg text-muted-foreground">
              All screen content is not made equal. Gaming is a great hobby when
              it is treated like all the other hobbies. We use children&apos;s
              love for games to their advantage — with good friends and a
              professional game educator who is there to guide and help.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Values Section */}
      <div className="mx-auto mt-16 max-w-5xl">
        <h2 className="text-center text-2xl font-bold">Things We Care About</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {values.map((value) => (
            <Card key={value.title}>
              <CardHeader>
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <value.icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{value.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  {value.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* How Clubs Work Section */}
      <div className="mx-auto mt-16 max-w-3xl">
        <h2 className="text-center text-2xl font-bold">How Our Clubs Work</h2>
        <div className="mt-8 space-y-6 text-muted-foreground">
          <p>
            Each week, our gamers log in and are greeted by their own game
            educator — a Gedu. The Gedu guides them through the day&apos;s
            topic, giving children space and freedom to make the adventures
            their own.
          </p>
          <p>
            Our Gedus are gamers themselves. They understand firsthand that as
            children and teenagers, identity and friendships are built both
            online and offline. That understanding shapes every session they
            lead.
          </p>
          <p>
            All our clubs are built around stories that give space for gamers to
            explore, create, and imagine. Between weekly sessions, gamers get
            fun challenges to do online and offline. During holidays we organize
            camps, and every week there are community events, tournaments, and
            competitions.
          </p>
          <p>
            Every gamer takes an oath to behave kindly and righteously —
            whether in-game, on voice chat, or out in the real world. The same
            values apply everywhere.
          </p>
        </div>
      </div>

      {/* Parents Section */}
      <div className="mx-auto mt-16 max-w-3xl">
        <h2 className="text-center text-2xl font-bold">For Parents</h2>
        <div className="mt-8 space-y-6 text-muted-foreground">
          <p>
            Parental game education is just as important a part of what we do as
            the clubs themselves. We want to help parents keep up with the
            ever-changing gaming world so they can support their children with
            confidence.
          </p>
          <p>
            You stay in control — managing accounts, enrollments, and
            spending — while your child enjoys a safe environment guided by
            professionals who care.
          </p>
        </div>
      </div>

      {/* CTA Section */}
      <div className="mx-auto mt-16 max-w-2xl text-center">
        <Card className="bg-muted/30">
          <CardContent className="py-8">
            <h3 className="text-xl font-semibold">Join Our Community</h3>
            <p className="mt-2 text-muted-foreground">
              Give your child a fun, safe place to play, learn, and make
              friends — guided by a professional game educator.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-4 sm:flex-row">
              <Link href={ROUTES.products}>
                <Button variant="outline" size="lg">Explore Clubs</Button>
              </Link>
              <Link href={ROUTES.register}>
                <Button size="lg">
                  Get Started
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Contact Section */}
      <div className="mx-auto mt-16 max-w-2xl text-center">
        <h2 className="text-2xl font-bold">Get in Touch</h2>
        <p className="mt-4 text-muted-foreground">
          Have questions? We&apos;d love to hear from you.
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          Email: kanslia@sog.gg
        </p>
      </div>
    </div>
  );
}
