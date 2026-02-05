import type { Metadata } from "next";
import Link from "next/link";
import { Heart, Target, Users, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "About Us",
  description: "Learn about Sogverse and our mission to make learning fun",
};

const values = [
  {
    title: "Learning Through Play",
    description: "We believe that the best learning happens when children are engaged and having fun. Our games are designed to teach while entertaining.",
    icon: Sparkles,
  },
  {
    title: "Family First",
    description: "Parents are partners in their children's education. We give you the tools to stay involved and in control of your child's gaming experience.",
    icon: Heart,
  },
  {
    title: "Safe Environment",
    description: "Child safety is our top priority. No emails, no external contacts, no ads. Just safe, educational gaming.",
    icon: Users,
  },
  {
    title: "Growth Focused",
    description: "Every game is designed with learning objectives in mind. We track progress and celebrate achievements together.",
    icon: Target,
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
          We&apos;re on a mission to transform how children learn by harnessing the
          power of gaming. At Sogverse, education meets entertainment in a safe,
          parent-controlled environment.
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
              To create a world where every child has access to high-quality
              educational content through the medium they love most: games. We
              believe that learning should be an adventure, not a chore.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Values Section */}
      <div className="mx-auto mt-16 max-w-5xl">
        <h2 className="text-center text-2xl font-bold">Our Values</h2>
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

      {/* Story Section */}
      <div className="mx-auto mt-16 max-w-3xl">
        <h2 className="text-center text-2xl font-bold">Our Story</h2>
        <div className="mt-8 space-y-6 text-muted-foreground">
          <p>
            School of Gaming (SOG) was founded with a simple observation: children
            are naturally drawn to games. Rather than fighting this tendency, we
            asked ourselves: what if we could harness this passion for learning?
          </p>
          <p>
            Our team of educators, game designers, and parents came together to
            create Sogverse—a platform where educational content is delivered
            through engaging, age-appropriate games. We&apos;ve built a system that
            keeps parents in the loop while giving children the freedom to explore
            and learn.
          </p>
          <p>
            Today, Sogverse serves families around the world, helping children
            develop critical thinking, problem-solving, creativity, and academic
            skills—all while having fun.
          </p>
        </div>
      </div>

      {/* CTA Section */}
      <div className="mx-auto mt-16 max-w-2xl text-center">
        <Card className="bg-muted/30">
          <CardContent className="py-8">
            <h3 className="text-xl font-semibold">Join Our Community</h3>
            <p className="mt-2 text-muted-foreground">
              Ready to transform how your children learn? Create a free account
              today and discover the joy of learning through play.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-4 sm:flex-row">
              <Link href="/register">
                <Button size="lg">Get Started Free</Button>
              </Link>
              <Link href="/products">
                <Button variant="outline" size="lg">
                  Explore Products
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
          Have questions? We&apos;d love to hear from you. Reach out to our team
          and we&apos;ll get back to you as soon as possible.
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          Email: support@sogverse.com
        </p>
      </div>
    </div>
  );
}
