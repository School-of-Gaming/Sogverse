"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Globe,
  Gamepad2,
  MapPin,
  PartyPopper,
  Repeat,
  Sparkles,
  Tent,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  LANGUAGE_NAMES,
  LANGUAGE_ORDER,
  PRODUCTS,
  TOPICS,
  filterProducts,
  type Language,
  type Product,
  type ProductType,
  type Topic,
} from "../_mock/data";
import { MockupRibbon } from "../_components/mockup-ribbon";
import { ProductCard } from "../_components/product-card";

type Commitment = "weekly" | "camp" | "event" | "any";

type QuizState = {
  age: number | null;
  languages: Language[];
  topicIds: string[];
  format: "any" | "online" | "in_person";
  commitment: Commitment | null;
};

const INITIAL: QuizState = {
  age: null,
  languages: [],
  topicIds: [],
  format: "any",
  commitment: null,
};

const AGES = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

const STEP_TITLES = [
  "How old is your gamer?",
  "What language should it be in?",
  "What are they into?",
  "Where do you want them to join?",
  "How often should it be?",
];

export default function QuizPage() {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<QuizState>(INITIAL);
  const [done, setDone] = useState(false);

  const totalSteps = STEP_TITLES.length;

  const canAdvance = useMemo(() => {
    switch (step) {
      case 0:
        return state.age !== null;
      case 1:
        return true; // optional — empty = any
      case 2:
        return true; // optional — empty = any
      case 3:
        return true;
      case 4:
        return state.commitment !== null;
      default:
        return true;
    }
  }, [step, state]);

  const next = () => {
    if (!canAdvance) return;
    if (step < totalSteps - 1) {
      setStep(step + 1);
    } else {
      setDone(true);
    }
  };

  const back = () => {
    if (done) {
      setDone(false);
      return;
    }
    setStep(Math.max(0, step - 1));
  };

  const reset = () => {
    setStep(0);
    setState(INITIAL);
    setDone(false);
  };

  if (done) {
    return (
      <div className="container mx-auto px-4 py-12">
        <MockupRibbon />
        <ResultsView state={state} onReset={reset} onBack={back} />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <MockupRibbon />

      <div className="mx-auto max-w-2xl">
        <div className="text-center">
          <Link
            href="/browse-mockup"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← Back to browse
          </Link>
          <div className="mt-2 flex items-center justify-center gap-1.5">
            {STEP_TITLES.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === step
                    ? "w-10 bg-primary"
                    : i < step
                      ? "w-4 bg-primary/50"
                      : "w-4 bg-muted",
                )}
              />
            ))}
          </div>
          <p className="mt-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Question {step + 1} of {totalSteps}
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            {STEP_TITLES[step]}
          </h1>
        </div>

        <div className="mt-10">
          {step === 0 && <AgeStep state={state} onChange={setState} />}
          {step === 1 && <LanguageStep state={state} onChange={setState} />}
          {step === 2 && <InterestsStep state={state} onChange={setState} />}
          {step === 3 && <FormatStep state={state} onChange={setState} />}
          {step === 4 && <CommitmentStep state={state} onChange={setState} />}
        </div>

        <div className="mt-10 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={back}
            disabled={step === 0}
            className={cn(step === 0 && "invisible")}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <Button onClick={next} disabled={!canAdvance}>
            {step === totalSteps - 1 ? "Show me matches" : "Continue"}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------- Steps ----------

function AgeStep({
  state,
  onChange,
}: {
  state: QuizState;
  onChange: (s: QuizState) => void;
}) {
  return (
    <div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {AGES.map((age) => (
          <button
            key={age}
            type="button"
            onClick={() => onChange({ ...state, age })}
            className={cn(
              "rounded-lg border px-3 py-4 text-lg font-semibold transition-colors",
              state.age === age
                ? "border-primary bg-primary/10 text-primary"
                : "border-input text-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {age === 17 ? "17+" : age}
          </button>
        ))}
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Pick the closest age. We&apos;ll match on our age ranges.
      </p>
    </div>
  );
}

function LanguageStep({
  state,
  onChange,
}: {
  state: QuizState;
  onChange: (s: QuizState) => void;
}) {
  const toggle = (lang: Language) => {
    onChange({
      ...state,
      languages: state.languages.includes(lang)
        ? state.languages.filter((l) => l !== lang)
        : [...state.languages, lang],
    });
  };

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3">
        {LANGUAGE_ORDER.map((code) => (
          <ChoiceCard
            key={code}
            active={state.languages.includes(code)}
            onClick={() => toggle(code)}
          >
            <p className="text-lg font-semibold">{LANGUAGE_NAMES[code]}</p>
          </ChoiceCard>
        ))}
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Pick any that work. Leave empty to see every language.
      </p>
    </div>
  );
}

function InterestsStep({
  state,
  onChange,
}: {
  state: QuizState;
  onChange: (s: QuizState) => void;
}) {
  const toggle = (id: string) => {
    onChange({
      ...state,
      topicIds: state.topicIds.includes(id)
        ? state.topicIds.filter((t) => t !== id)
        : [...state.topicIds, id],
    });
  };

  const games = TOPICS.filter((t) => t.kind === "game");
  const subjects = TOPICS.filter((t) => t.kind === "subject");

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Games they already play (or want to try)
        </p>
        <div className="flex flex-wrap gap-2">
          {games.map((t) => (
            <InterestChip
              key={t.id}
              topic={t}
              active={state.topicIds.includes(t.id)}
              onClick={() => toggle(t.id)}
            />
          ))}
        </div>
      </div>
      <div>
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Other things they&apos;re into
        </p>
        <div className="flex flex-wrap gap-2">
          {subjects.map((t) => (
            <InterestChip
              key={t.id}
              topic={t}
              active={state.topicIds.includes(t.id)}
              onClick={() => toggle(t.id)}
            />
          ))}
        </div>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Pick as many as you like. Leave empty if you&apos;re open to anything.
      </p>
    </div>
  );
}

function InterestChip({
  topic,
  active,
  onClick,
}: {
  topic: Topic;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-input hover:bg-accent hover:text-accent-foreground",
      )}
    >
      <CheckCircle2
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          active ? "text-primary" : "text-muted-foreground/40",
        )}
      />
      <span>
        <span className="font-medium">{topic.name}</span>
        <span className="ml-1 text-xs text-muted-foreground">
          · {topic.blurb}
        </span>
      </span>
    </button>
  );
}

function FormatStep({
  state,
  onChange,
}: {
  state: QuizState;
  onChange: (s: QuizState) => void;
}) {
  const pick = (format: QuizState["format"]) =>
    onChange({ ...state, format });

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <ChoiceCard
        active={state.format === "online"}
        onClick={() => pick("online")}
      >
        <Globe className="mx-auto h-8 w-8 text-primary" />
        <p className="mt-3 font-semibold">Online, from home</p>
        <p className="mt-1 text-xs text-muted-foreground">
          No travel. Kid joins on their own computer.
        </p>
      </ChoiceCard>
      <ChoiceCard
        active={state.format === "in_person"}
        onClick={() => pick("in_person")}
      >
        <MapPin className="mx-auto h-8 w-8 text-primary" />
        <p className="mt-3 font-semibold">In person</p>
        <p className="mt-1 text-xs text-muted-foreground">
          At a school, library, or office near you.
        </p>
      </ChoiceCard>
      <ChoiceCard
        active={state.format === "any"}
        onClick={() => pick("any")}
      >
        <Sparkles className="mx-auto h-8 w-8 text-primary" />
        <p className="mt-3 font-semibold">Either is fine</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Show me everything — I&apos;ll pick after seeing options.
        </p>
      </ChoiceCard>
    </div>
  );
}

function CommitmentStep({
  state,
  onChange,
}: {
  state: QuizState;
  onChange: (s: QuizState) => void;
}) {
  const pick = (c: Commitment) => onChange({ ...state, commitment: c });

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <ChoiceCard
        active={state.commitment === "weekly"}
        onClick={() => pick("weekly")}
      >
        <Repeat className="mx-auto h-8 w-8 text-primary" />
        <p className="mt-3 font-semibold">Weekly, during the school year</p>
        <p className="mt-1 text-xs text-muted-foreground">
          A regular club that meets once a week.
        </p>
      </ChoiceCard>
      <ChoiceCard
        active={state.commitment === "camp"}
        onClick={() => pick("camp")}
      >
        <Tent className="mx-auto h-8 w-8 text-primary" />
        <p className="mt-3 font-semibold">A camp during school breaks</p>
        <p className="mt-1 text-xs text-muted-foreground">
          A full week (or more) of daily sessions.
        </p>
      </ChoiceCard>
      <ChoiceCard
        active={state.commitment === "event"}
        onClick={() => pick("event")}
      >
        <PartyPopper className="mx-auto h-8 w-8 text-primary" />
        <p className="mt-3 font-semibold">A one-time event</p>
        <p className="mt-1 text-xs text-muted-foreground">
          A single afternoon — a tournament, workshop, or demo.
        </p>
      </ChoiceCard>
      <ChoiceCard
        active={state.commitment === "any"}
        onClick={() => pick("any")}
      >
        <Users className="mx-auto h-8 w-8 text-primary" />
        <p className="mt-3 font-semibold">Show me anything</p>
        <p className="mt-1 text-xs text-muted-foreground">
          No preference. Surprise me.
        </p>
      </ChoiceCard>
    </div>
  );
}

function ChoiceCard({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border p-5 text-center transition-colors",
        active
          ? "border-primary bg-primary/10"
          : "border-input hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {children}
    </button>
  );
}

// ---------- Results ----------

function commitmentToTypes(c: Commitment | null): ProductType[] {
  if (c === null || c === "any") return [];
  if (c === "weekly") return ["consumer-club", "municipality-club"];
  if (c === "camp") return ["camp"];
  return ["event"];
}

function scoreMatch(product: Product, state: QuizState): number {
  if (state.topicIds.length === 0) return 0;
  return product.topicIds.filter((t) => state.topicIds.includes(t)).length;
}

function ResultsView({
  state,
  onReset,
  onBack,
}: {
  state: QuizState;
  onReset: () => void;
  onBack: () => void;
}) {
  const matches = useMemo(() => {
    const types = commitmentToTypes(state.commitment);
    const filtered = filterProducts(PRODUCTS, {
      age: state.age,
      languages: state.languages,
      types,
      format: state.format,
      topicIds: [], // we score topic overlap ourselves instead of filtering on it
    });
    return filtered
      .map((p) => ({ product: p, score: scoreMatch(p, state) }))
      .sort((a, b) => b.score - a.score);
  }, [state]);

  const summaryPhrase = buildSummaryPhrase(state);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mx-auto max-w-2xl text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          Your matches
        </div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
          {matches.length > 0
            ? "Here's what we think fits"
            : "Hmm, nothing lines up"}
        </h1>
        <p className="mt-3 text-muted-foreground">{summaryPhrase}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            Tweak answers
          </Button>
          <Button variant="ghost" onClick={onReset}>
            Start over
          </Button>
        </div>
      </div>

      {matches.length > 0 ? (
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {matches.map(({ product, score }) => (
            <div key={product.id} className="relative">
              {score > 0 && (
                <div className="absolute left-3 top-3 z-10 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground shadow">
                  <Gamepad2 className="mr-1 inline h-3 w-3" />
                  {score} {score === 1 ? "match" : "matches"}
                </div>
              )}
              <ProductCard product={product} />
            </div>
          ))}
        </div>
      ) : (
        <Card className="mx-auto mt-10 max-w-xl">
          <CardContent className="py-12 text-center">
            <CalendarClock className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-4 text-sm text-muted-foreground">
              Nothing matched every answer. Try tweaking the age range, allowing
              more languages, or picking &quot;Show me anything.&quot;
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <Button variant="outline" onClick={onBack}>
                Go back
              </Button>
              <Button variant="ghost" asChild>
                <Link href="/browse-mockup">Browse everything instead</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function buildSummaryPhrase(state: QuizState): string {
  const parts: string[] = [];
  if (state.age !== null) {
    parts.push(`your ${state.age}-year-old`);
  } else {
    parts.push("your gamer");
  }
  if (state.languages.length > 0) {
    const langs = state.languages
      .map((l) => LANGUAGE_NAMES[l].toLowerCase())
      .join(" or ");
    parts.push(`in ${langs}`);
  }
  if (state.format === "online") parts.push("online from home");
  else if (state.format === "in_person") parts.push("in person");

  if (state.commitment === "weekly") parts.push("a weekly club");
  else if (state.commitment === "camp") parts.push("a camp");
  else if (state.commitment === "event") parts.push("a one-time event");

  if (state.topicIds.length > 0) {
    const names = state.topicIds
      .map((id) => TOPICS.find((t) => t.id === id)?.name)
      .filter(Boolean)
      .join(", ");
    parts.push(`into ${names}`);
  }

  return `Based on ${parts.join(", ")}.`;
}
