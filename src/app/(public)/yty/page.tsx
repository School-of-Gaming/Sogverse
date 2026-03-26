import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROUTES } from "@/lib/constants";
import { YTY_ELEMENTS } from "@/lib/constants/yty";

export const metadata: Metadata = {
  title: "Yty - the Force of the Sogverse",
  description:
    "Yty is the magical force that maintains the balance of the Sogverse. Learn how gamers earn Yty by doing good things.",
};

export default function YtyPage() {
  return (
    <div className="container mx-auto px-4 py-12">
      {/* Hero Section */}
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          What is <span className="text-primary">Yty</span>?
        </h1>
        <p className="mt-6 text-lg leading-8 text-muted-foreground">
          Yty is a magical force that maintains the delicate balance of the
          worlds of the Sogverse. By doing good things — learning new skills,
          making friends, behaving well, and participating in the
          community — gamers earn Yty for themselves and for everyone.
        </p>
      </div>

      {/* Overview Card */}
      <div className="mx-auto mt-16 max-w-4xl">
        <Card className="bg-cta-gradient-subtle">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">How Yty Works</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-lg text-muted-foreground">
              Every gamer starts at zero. From every session attended, every
              challenge completed, and every act of kindness shown, gamers earn
              Yty points. These points build up across four elements, each
              reflecting a different part of growing up well.
            </p>
            <p className="text-lg text-muted-foreground">
              As gamers collect Yty for themselves, they also increase the total
              Yty of the Sogverse — shaping the story and unlocking new
              possibilities for the whole community.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* The Four Elements */}
      <div className="mx-auto mt-16 max-w-5xl">
        <h2 className="text-center text-2xl font-bold">The Four Elements of Yty</h2>
        <p className="mt-2 text-center text-muted-foreground">
          Each element reflects a gamer&apos;s relationship with a different
          part of their world
        </p>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {YTY_ELEMENTS.map((el) => (
            <Card key={el.id} className={`border-2 ${el.color.border}`}>
              <CardHeader>
                <div className="flex items-center gap-4">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${el.color.bg}`}>
                    <el.icon className={`h-6 w-6 ${el.color.accent}`} />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{el.name}</CardTitle>
                    <p className={`text-sm ${el.color.accent}`}>{el.description}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  {elementDetails[el.id]}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Earning Yty */}
      <div className="mx-auto mt-16 max-w-3xl">
        <h2 className="text-center text-2xl font-bold">How Gamers Earn Yty</h2>
        <div className="mt-8 space-y-6 text-muted-foreground">
          <p>
            Yty points are earned through participation. Attending weekly club
            sessions, completing quests and challenges, showing kindness to
            fellow gamers, joining community events and camps — all of these
            contribute to a gamer&apos;s Yty.
          </p>
          <p>
            As points accumulate under specific achievement badges, gamers level
            up those badges — from bronze to silver, gold, platinum, and
            diamond. Every point also feeds into their overall Yty level and
            the element it belongs to.
          </p>
          <p>
            And it&apos;s not just gamers. Gedus, parents, and the entire
            community can take part in building the Yty of the Sogverse through
            events and shared activities.
          </p>
        </div>
      </div>

      {/* CTA Section */}
      <div className="mx-auto mt-16 max-w-2xl text-center">
        <Card className="bg-muted/30">
          <CardContent className="py-8">
            <h3 className="text-xl font-semibold">Start Your Journey</h3>
            <p className="mt-2 text-muted-foreground">
              Join the Sogverse and start earning Yty. Every session, every
              friendship, every act of kindness makes a difference.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-4 sm:flex-row">
              <Link href={ROUTES.products}>
                <Button variant="outline" size="lg">Explore Clubs</Button>
              </Link>
              <Link href={ROUTES.register}>
                <Button size="lg">Get Started</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Detailed descriptions for each Yty element, keyed by id. */
const elementDetails: Record<string, string> = {
  harmony:
    "Who am I? Harmony is about accepting yourself as you are — strengths and weaknesses alike. It means learning to take care of your wellbeing, expressing your emotions, making good decisions, and understanding why rules and trust matter.",
  glow:
    "How can I help others? Glow is about empathy, kindness, and building meaningful relationships. It means respecting differences, giving space to others, communicating well, and being the kind of person who lifts people up.",
  valor:
    "How can I make a difference? Valor is about finding your place in the world and having the courage to contribute. It means teamwork, expressing your ideas, using your imagination, and working towards a better future — locally and globally.",
  wit:
    "How do I navigate the digital world? Wit is about a healthy, critical relationship with games, media, and technology. It means understanding online behavior, thinking critically about information, and balancing screen time with the rest of life.",
};
