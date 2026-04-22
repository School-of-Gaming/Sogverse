"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Check, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  getLocationLabel,
  getProductBySlug,
  getProductTypeDef,
  productDetailPath,
} from "../../_mock/data";
import { formatIsoDate } from "../../_mock/format";

type ConfirmedStatus = "signed_up" | "waitlisted" | "reserved";

export default function ConfirmedPage() {
  const params = useParams<{ productSlug: string }>();
  const searchParams = useSearchParams();
  const status = (searchParams.get("status") ?? "signed_up") as ConfirmedStatus;
  const gamer = searchParams.get("gamer") ?? "Your child";
  const position = searchParams.get("position");
  const threshold = searchParams.get("threshold");

  const product = getProductBySlug(params.productSlug);

  if (!product) {
    return (
      <div className="container mx-auto px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold">Not found</h1>
        <Link href="/browse-mockup" className="mt-6 inline-block">
          <Button variant="outline">Start over</Button>
        </Link>
      </div>
    );
  }

  const typeDef = getProductTypeDef(product.type);

  return (
    <div className="container mx-auto px-4 py-10">
      <div className="mx-auto max-w-xl">
        <div className="text-center">
          <HeroIcon status={status} position={position} />
          <h1 className="mt-6 text-3xl font-bold tracking-tight">
            <Headline status={status} gamer={gamer} />
          </h1>
          <p className="mt-2 text-muted-foreground">
            <Subline
              status={status}
              gamer={gamer}
              productName={product.name}
              position={position}
              threshold={threshold}
            />
          </p>
        </div>

        <Card className="mt-8">
          <CardContent className="space-y-4 p-6">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {typeDef.name}
              </p>
              <h2 className="mt-1 font-semibold">{product.name}</h2>
            </div>

            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Info label="When">
                {product.scheduleDetail[0]}
                {product.dateRange && (
                  <div className="text-xs text-muted-foreground">
                    {product.dateRange}
                  </div>
                )}
              </Info>
              <Info label="Where">{getLocationLabel(product)}</Info>
              <Info label="Gedu">{product.primaryGeduName}</Info>
              <Info label="Language">
                {product.languages
                  .map((l) =>
                    l === "fi"
                      ? "Finnish"
                      : l === "en"
                        ? "English"
                        : "Swedish",
                  )
                  .join(" · ")}
              </Info>
            </dl>
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardContent className="space-y-3 p-6 text-sm">
            <h2 className="text-sm font-semibold">What happens next</h2>
            <NextSteps
              status={status}
              gamer={gamer}
              productSlug={product.slug}
              firstSessionIso={product.firstSessionIso}
              isOnline={product.isOnline}
              venue={getLocationLabel(product)}
            />
          </CardContent>
        </Card>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href={productDetailPath(product)}
            className="w-full sm:w-auto"
          >
            <Button variant="outline" className="w-full">
              Back to the {typeDef.name.toLowerCase()}
            </Button>
          </Link>
          <Link
            href={product.type === "municipality-club" ? "/registration" : "/browse-mockup"}
            className="w-full sm:w-auto"
          >
            <Button className="w-full">Find something else</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function HeroIcon({
  status,
  position,
}: {
  status: ConfirmedStatus;
  position: string | null;
}) {
  if (status === "waitlisted") {
    return (
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-warning/15">
        <span className="text-2xl font-bold text-warning">#{position ?? "?"}</span>
      </div>
    );
  }
  if (status === "reserved") {
    return (
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-secondary/15 text-secondary">
        <PartyPopper className="h-8 w-8" />
      </div>
    );
  }
  return (
    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/15 text-success">
      <Check className="h-8 w-8" strokeWidth={3} />
    </div>
  );
}

function Headline({ status, gamer }: { status: ConfirmedStatus; gamer: string }) {
  if (status === "waitlisted") return <>{gamer} is on the waitlist</>;
  if (status === "reserved") return <>{gamer}&apos;s spot is reserved</>;
  return <>{gamer} is in!</>;
}

function Subline({
  status,
  productName,
  position,
  threshold,
}: {
  status: ConfirmedStatus;
  gamer: string;
  productName: string;
  position: string | null;
  threshold: string | null;
}) {
  if (status === "waitlisted") {
    return (
      <>
        Position #{position ?? "?"} of the waitlist for {productName}.
      </>
    );
  }
  if (status === "reserved") {
    return (
      <>
        We&apos;ll start {productName} once {threshold ?? "enough"} kids have
        signed up — you&apos;ll hear from us the moment we have enough.
      </>
    );
  }
  return <>See you at {productName}.</>;
}

function NextSteps({
  status,
  gamer,
  firstSessionIso,
  isOnline,
  venue,
}: {
  status: ConfirmedStatus;
  gamer: string;
  productSlug: string;
  firstSessionIso?: string;
  isOnline: boolean;
  venue: string;
}) {
  if (status === "waitlisted") {
    return (
      <ul className="space-y-2 text-muted-foreground">
        <li>• You&apos;ll get a confirmation email in the next few minutes.</li>
        <li>
          • If a family cancels, we&apos;ll send you a WhatsApp and email alert
          with a short window to accept.
        </li>
        <li>• You can leave the waitlist anytime from your account.</li>
      </ul>
    );
  }

  if (status === "reserved") {
    return (
      <ul className="space-y-2 text-muted-foreground">
        <li>
          • We&apos;ll let you know by email and WhatsApp as soon as we have
          enough signups to start.
        </li>
        <li>
          • If we don&apos;t hit the number by the planned start date, we
          refund everyone automatically.
        </li>
        <li>• You can cancel the reservation anytime before it starts.</li>
      </ul>
    );
  }

  return (
    <ul className="space-y-2 text-muted-foreground">
      <li>• You&apos;ll get a confirmation email with all the details.</li>
      {firstSessionIso && (
        <li>
          • The first session is{" "}
          <strong className="text-foreground">
            {formatIsoDate(firstSessionIso)}
          </strong>
          .
        </li>
      )}
      {isOnline ? (
        <li>
          • {gamer} can join the voice room from their Sogverse account a few
          minutes before the session starts.
        </li>
      ) : (
        <li>
          • Drop-off is at{" "}
          <strong className="text-foreground">{venue}</strong>.
        </li>
      )}
      <li>
        • Can&apos;t make a session? Let the Gedu know from your account.
      </li>
    </ul>
  );
}

function Info({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

