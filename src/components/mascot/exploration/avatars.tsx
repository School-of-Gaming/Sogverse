/* eslint-disable i18next/no-literal-string -- throwaway developer-facing design-exploration surface; every string here is a caption on a page no user will ever see and that gets deleted with the exploration */
"use client";

/**
 * The avatar study: can a mascot portrait do at 28 pixels what the identicon
 * cannot, which is let you tell twenty-four people apart at a glance?
 */

import { useState, type ReactElement } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Identicon } from "@/components/ui/identicon";

import {
  AVATAR_ACCENTS,
  AVATAR_CLOTHING,
  AVATAR_FACES,
  AVATAR_FIGURES,
  AVATAR_HATS,
  AVATAR_VARIANTS,
  avatarFromId,
  type MascotAvatar,
} from "../avatar";
import { MascotAvatar as AvatarView } from "../avatar-view";
import { AVATAR_TORSOS } from "../avatar.contracts";
import { ChipRow, Rubric, type Choice } from "./controls";

/**
 * Twenty-four fixture people. The ids are real generated UUIDs pasted in as
 * literals: the avatar is derived from the id's hex, so a readable stand-in
 * would hash to a degenerate value and every screenshot would be a lie. They
 * are hardcoded rather than generated at load so the same twenty-four faces
 * come back on every reload and a comparison means something.
 */
const PEOPLE: readonly { id: string; name: string }[] = [
  { id: "30d0e06f-8bed-4995-9d7d-2c4f746226b1", name: "Aino" },
  { id: "32bc8252-6ed5-4554-907b-0e88e76b499f", name: "Väinö" },
  { id: "3df98693-74c7-43a7-b531-bac2db42cda5", name: "Sofia" },
  { id: "2fb089d8-e373-40e3-b3f2-dda3d5793b5f", name: "Elias" },
  { id: "78bb0000-5742-4477-99ac-393ef0b5ff37", name: "Venla" },
  { id: "9e20fc16-936c-4dab-ab9b-486d67965908", name: "Onni" },
  { id: "332a3fd7-111d-4bbd-a7e7-844ca4b7aae9", name: "Ellen" },
  { id: "39a84c6e-a67e-4c5d-a8ff-19d47d955b9e", name: "Leevi" },
  { id: "99b0a3cf-b2d3-44f4-b329-5d1cd0941595", name: "Aada" },
  { id: "e0eac6fd-b75c-4937-b962-c7ef25893ebc", name: "Niilo" },
  { id: "e31333e4-010b-473f-a1ca-6ef2c6500639", name: "Lilja" },
  { id: "25dc3f51-4b4c-4348-9866-61994ea7d940", name: "Toivo" },
  { id: "e567e04c-b332-4011-afcc-989489b4f34f", name: "Emma" },
  { id: "093e16a5-a109-47b3-b9c0-410c1a02e541", name: "Oiva" },
  { id: "5b102cf8-94c9-4f63-b0e4-0350a4387b28", name: "Iiris" },
  { id: "e2447e49-b2a1-4ebd-9aa2-bda3b2ef0bca", name: "Väinämö" },
  { id: "0459f2ae-52a8-4fe2-aa65-5118b904e97a", name: "Helmi" },
  { id: "b09ef922-63f5-44c4-9860-808fab13c511", name: "Eeli" },
  { id: "d6dc9d0a-ccd5-45ba-894d-460fc618d6e3", name: "Sanni" },
  { id: "47740ae7-cc68-4339-b5e5-86ebb57ef901", name: "Arvo" },
  { id: "a6e77c16-d948-4e3c-827b-b6ce03bf1ada", name: "Nea" },
  { id: "473dd6c4-2fb5-4838-8a6a-35bd4b10c785", name: "Kaarlo" },
  { id: "8fa8ca34-7e0a-415d-bebc-c229b9cf2ad9", name: "Vilja" },
  { id: "cbf74be1-1995-459a-9c1e-d15768e86eb8", name: "Miska" },
];

const LADDER = [16, 24, 28, 40, 64, 96, 128];

const LADDER_FIGURES: readonly { concept: MascotAvatar["concept"]; form?: string; label: string }[] = [
  { concept: "kaveri", form: "kid-b", label: "Kaveri" },
  { concept: "otso", form: "fox", label: "Kettu" },
  { concept: "nappi", label: "Nappi" },
  { concept: "kide", label: "Kide" },
];

function IdenticonBox({ id, size }: { id: string; size: number }): ReactElement {
  return (
    <span
      className="relative inline-block shrink-0 overflow-hidden rounded-full"
      style={{ width: size, height: size }}
    >
      <Identicon id={id} size={size} />
    </span>
  );
}

function AvatarBox({ id, size }: { id: string; size: number }): ReactElement {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted"
      style={{ width: size, height: size }}
    >
      <AvatarView avatar={avatarFromId(id)} size={size} label="Avatar" />
    </span>
  );
}

// --- the customiser -------------------------------------------------------

const FIGURE_CHOICES: Choice<string>[] = AVATAR_FIGURES.map((f, i) => ({
  id: String(i),
  label: f.label,
}));

const NONE = "none";

function Swatches({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (next: string) => void;
}): ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="w-20 shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((hex) => (
          <button
            key={hex}
            type="button"
            aria-label={hex}
            onClick={() => {
              onChange(hex);
            }}
            className={`h-7 w-7 rounded-md border-2 ${hex === value ? "border-primary" : "border-border"}`}
            style={{ backgroundColor: hex }}
          />
        ))}
      </div>
    </div>
  );
}

function Customiser(): ReactElement {
  const [figureIndex, setFigureIndex] = useState("6");
  const [variant, setVariant] = useState("honey");
  const [clothing, setClothing] = useState<string>(AVATAR_CLOTHING[3]);
  const [accent, setAccent] = useState<string>(AVATAR_ACCENTS[0]);
  const [hat, setHat] = useState("beanie");
  const [face, setFace] = useState(NONE);
  const [torso, setTorso] = useState("hoodie");

  const figure = AVATAR_FIGURES[Number(figureIndex)];
  const variants = AVATAR_VARIANTS[figure.concept] ?? ["default"];
  const activeVariant = variants.includes(variant) ? variant : variants[0];

  const avatar: MascotAvatar = {
    concept: figure.concept,
    ...(figure.form === undefined ? {} : { form: figure.form }),
    variant: activeVariant,
    colors: { clothing, clothingAccent: accent },
    outfit: {
      ...(hat === NONE ? {} : { hat }),
      ...(face === NONE ? {} : { face }),
      ...(torso === NONE ? {} : { torso }),
    },
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <div className="space-y-3">
        {/* Both sizes at once, always. The whole failure mode of an avatar
            customiser is designing at 128 and shipping at 28. */}
        <div className="flex h-[13rem] items-center justify-center gap-6 rounded-xl border border-border bg-background">
          <span className="inline-flex h-32 w-32 items-center justify-center overflow-hidden rounded-full bg-muted">
            <AvatarView avatar={avatar} size={128} />
          </span>
          <div className="flex flex-col items-center gap-3">
            <span className="inline-flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-muted">
              <AvatarView avatar={avatar} size={64} />
            </span>
            <span className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-muted">
              <AvatarView avatar={avatar} size={40} />
            </span>
            <span className="inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-muted">
              <AvatarView avatar={avatar} size={28} />
            </span>
          </div>
        </div>
        <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
          {JSON.stringify(avatar, null, 2)}
        </pre>
      </div>
      <div className="space-y-3">
        <ChipRow label="Who" options={FIGURE_CHOICES} value={figureIndex} onChange={setFigureIndex} />
        <ChipRow
          label="Colourway"
          options={variants.map((v) => ({ id: v, label: v }))}
          value={activeVariant}
          onChange={setVariant}
        />
        <Swatches label="Clothing" options={AVATAR_CLOTHING} value={clothing} onChange={setClothing} />
        <Swatches label="Trim" options={AVATAR_ACCENTS} value={accent} onChange={setAccent} />
        <ChipRow
          label="Hat"
          options={[
            { id: NONE, label: "None" },
            ...AVATAR_HATS.filter((h) => h !== "").map((h) => ({ id: h, label: h })),
          ]}
          value={hat}
          onChange={setHat}
        />
        <ChipRow
          label="Face"
          options={[
            { id: NONE, label: "None" },
            ...AVATAR_FACES.filter((f) => f !== "").map((f) => ({ id: f, label: f })),
          ]}
          value={face}
          onChange={setFace}
        />
        <ChipRow
          label="Torso"
          options={[
            { id: NONE, label: "None" },
            ...AVATAR_TORSOS.filter((t) => t !== "").map((t) => ({ id: t, label: t })),
          ]}
          value={torso}
          onChange={setTorso}
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          This is a proxy for the gamer-facing customiser, not the customiser. What it produces is
          the whole stored shape — the JSON beside it is exactly what a `jsonb` column would hold
          and what the zod schema validates. Note what it cannot express: there is no field for the
          body, the head, the eyes or the species accent, because the identity core is not
          something a user gets to change and the safest way to guarantee that is for the
          vocabulary to have no word for it.
        </p>
      </div>
    </div>
  );
}

// --- the section ----------------------------------------------------------

export function AvatarStudy(): ReactElement {
  return (
    <Card>
      <CardContent className="space-y-8 p-6">
        <div>
          <h3 className="text-2xl font-bold tracking-tight text-foreground">
            Avatars — the identicon replacement
          </h3>
          <p className="mt-1 max-w-4xl text-sm leading-relaxed text-muted-foreground">
            The identicon is deterministic, unique, and unmemorable: twenty-five cells in three
            colours give plenty of mathematical variety and almost no variety a person can hold in
            their head, because nobody remembers &ldquo;the one with a gap in the third row&rdquo;.
            A mascot portrait trades some of that entropy for axes you can say out loud — the fox,
            the one in the red beanie, the tall crystal. Below: the same twenty-four users, both
            ways, at the sizes a participant list actually uses.
          </p>
        </div>

        <section>
          <Rubric
            title="Twenty-four users, both ways"
            note="Mascot on the left of each pair, identicon on the right. Same id, same row."
          />
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl border border-border bg-background p-4 sm:grid-cols-3 xl:grid-cols-4">
            {PEOPLE.map((person) => (
              <div key={person.id} className="flex items-center gap-3">
                <AvatarBox id={person.id} size={64} />
                <AvatarBox id={person.id} size={40} />
                <AvatarBox id={person.id} size={28} />
                <span className="mx-1 h-8 w-px bg-border" />
                <IdenticonBox id={person.id} size={64} />
                <IdenticonBox id={person.id} size={40} />
                <IdenticonBox id={person.id} size={28} />
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div>
            <Rubric title="In a list, mascot" note="The actual question: can you find one person twice?" />
            <ul className="divide-y divide-border rounded-xl border border-border bg-background">
              {PEOPLE.slice(0, 12).map((person) => (
                <li key={person.id} className="flex items-center gap-3 px-4 py-2">
                  <AvatarBox id={person.id} size={28} />
                  <span className="text-sm text-foreground">{person.name}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <Rubric title="In a list, identicon" note="The same twelve, in the same order." />
            <ul className="divide-y divide-border rounded-xl border border-border bg-background">
              {PEOPLE.slice(0, 12).map((person) => (
                <li key={person.id} className="flex items-center gap-3 px-4 py-2">
                  <IdenticonBox id={person.id} size={28} />
                  <span className="text-sm text-foreground">{person.name}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section>
          <Rubric
            title="Scale ladder, avatar crop"
            note="Where each recommended species gives up. A bust crop is a viewBox about three and a half times tighter than the full figure, so a portrait carries detail at sizes a full body cannot."
          />
          <div className="space-y-4 rounded-xl border border-border bg-background p-4">
            {LADDER_FIGURES.map((figure) => (
              <div key={figure.label} className="flex flex-wrap items-end gap-4">
                <span className="w-20 shrink-0 text-xs font-medium text-muted-foreground">
                  {figure.label}
                </span>
                {LADDER.map((size) => (
                  <figure key={size} className="flex flex-col items-center gap-1">
                    <span
                      className="inline-flex items-center justify-center overflow-hidden rounded-full bg-muted"
                      style={{ width: size, height: size }}
                    >
                      <AvatarView
                        avatar={{
                          concept: figure.concept,
                          ...(figure.form === undefined ? {} : { form: figure.form }),
                          variant: (AVATAR_VARIANTS[figure.concept] ?? ["default"])[0],
                          colors: { clothing: AVATAR_CLOTHING[0], clothingAccent: AVATAR_ACCENTS[0] },
                          outfit: { hat: "beanie" },
                        }}
                        size={size}
                      />
                    </span>
                    <figcaption className="text-[10px] text-muted-foreground">{size}</figcaption>
                  </figure>
                ))}
              </div>
            ))}
          </div>
          <p className="mt-3 max-w-4xl text-sm leading-relaxed text-muted-foreground">
            What survives 28 pixels: <strong className="text-foreground">the species, the head
            silhouette, the hat and the dominant garment colour.</strong> What does not:{" "}
            <strong className="text-foreground">glasses, the eye highlight, a muzzle crease, a
            lanyard, anything on the torso below the collar.</strong> So a customiser should sort
            its options by that line — hat and colour first, because they are what a stranger will
            recognise you by in a room list, and the fiddly items last and honestly labelled as
            things you will only see on your own profile page.
          </p>
        </section>

        <section>
          <Rubric
            title="Customise one"
            note="The small version stays on screen while you edit the big one, because that is the size it will be used at."
          />
          <Customiser />
        </section>

        <section className="rounded-xl border border-border bg-muted/30 p-4">
          <Rubric title="Where this has to live" />
          <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            <p>
              The default is a pure function of the user id — same id, same avatar, forever, with
              no stored state — so a brand-new account has a face before it has a preference and a
              customiser is an override rather than a step everybody is forced through. The tables
              it hashes into are append-only: reordering the species list silently reassigns every
              existing user&rsquo;s default.
            </p>
            <p>
              <strong className="text-foreground">A customised avatar must be server-stored and
              server-validated.</strong> The voice-token route already refuses to let a caller name
              the user id whose identicon it wants, because a caller that could would be able to
              appear as somebody else in a room; a customised avatar is the same claim with more
              detail. The renderer must take its instructions from the server&rsquo;s record of
              that user, never from anything the client supplies, and the stored value goes through
              the zod schema on the way in — closed enums for species, build, colourway and every
              worn item, and no free-text colour, because an unconstrained picker on a dark surface
              produces a great many invisible avatars.
            </p>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
