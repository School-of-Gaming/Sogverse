import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { createAnonClient } from "@/lib/supabase/anon";
import sharp from "sharp";
import { BRAND, DARK_THEME } from "@/lib/constants/colors";
import { SogBadge } from "@/components/og/marks";
import { SogWordmark } from "@/components/brand/sog-wordmark";
import {
  teamMemberSubline,
} from "@/components/team/team-name";
import { ogFonts, OG_FONT_FAMILY } from "@/components/og/fonts";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { MAX_INPUT_PIXELS } from "@/lib/images/reencode-jpeg.server";
import { cardLocaleOf, OG_CARD_SIZE } from "@/lib/og/cards";
import {
  TEAM_CARD_CACHE_CONTROL,
  TEAM_CARD_COLUMN_WIDTH,
  TEAM_CARD_HEADLINE_SIZE,
  TEAM_CARD_LAYOUT,
  teamCardFrame,
} from "@/lib/og/team-card";
// The modules directly rather than the feature barrel: the barrel carries
// browser-only React Query hooks.
import { readPublicTeamPhoto } from "@/services/team-profiles/public-team-photo";
import { TeamProfilesService } from "@/services/team-profiles/team-profiles.service";
import {
  TEAM_PHOTO_HEIGHT,
  TEAM_PHOTO_WIDTH,
} from "@/services/team-profiles/team-profiles.types";

/**
 * A team member's share card: their portrait, framed as their profile page
 * frames it (in their pick, or the neutral edge without one), beside the
 * School of Gaming lockup, their name with the nickname gamers know them by,
 * what they do here, and their one-line intro — at the URL's locale, with the
 * profile page's own translation fallback for the words they wrote.
 *
 * **The same reading as the public page and its photo**, and nothing more: the
 * profile through the public read, the photo through the bucket's public read
 * rule, both on an anon client with no session. A person whose profile is not
 * public — hidden, not approved, not staff, no one, not an id — answers 404,
 * one answer for all of them, as the page does.
 *
 * The photo is embedded as bytes, never as a URL: the renderer would fetch a
 * URL itself, and the only URLs to the object are a signed one (a bearer token
 * that would sit in a cached image's provenance) or the app's own photo route
 * (a request from the server to itself, on the request a crawler is waiting
 * on).
 *
 * `v` (`teamCardVersion`) is ignored here: it exists to make a changed card a
 * new address, and the card drawn is always the profile as it is now. The
 * cache is five minutes rather than the site cards' year, for the reason at
 * `TEAM_CARD_CACHE_CONTROL`.
 */
/**
 * The photo as the card draws it: a JPEG of the stored 4:5 size, covering the
 * frame from the middle as the profile page's frame does. Uploads are already
 * cropped to that, but a photo of another shape (the fixtures borrow square
 * art) is cropped rather than squashed — the renderer cannot crop a background
 * itself. And one JPEG in, whatever was stored: the bucket admits WebP, which
 * the card's rasteriser cannot decode.
 *
 * The decode is bounded as the upload routes bound theirs (`MAX_INPUT_PIXELS`):
 * the stored bytes are capped, their decoded size is not, and a Gedu writes
 * their own photo folder. A photo that will not decode inside the bound, or at
 * all, is `null` — the card draws the frame empty, as it does for no photo.
 */
async function portraitJpeg(stored: Blob): Promise<Buffer | null> {
  try {
    return await sharp(Buffer.from(await stored.arrayBuffer()), {
      limitInputPixels: MAX_INPUT_PIXELS,
    })
      .rotate()
      .resize(TEAM_PHOTO_WIDTH, TEAM_PHOTO_HEIGHT, { fit: "cover" })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    return null;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  const locale = cardLocaleOf(request);

  const anon = createAnonClient();
  const person = await new TeamProfilesService(anon).getPublicTeamProfile(userId);
  if (person === null) return new Response("Not found", { status: 404 });

  const [t, fonts, photo] = await Promise.all([
    getTranslations({ locale, namespace: "team.profile" }),
    ogFonts(),
    // Whichever photo is current: the card's own `v` is a card digest, not a
    // photo version, and the card embeds the bytes rather than an address.
    readPublicTeamPhoto(anon, person.id, null),
  ]);
  // A public profile always has a photo; one hidden or replaced between the
  // two reads, or one that will not decode, draws the frame empty rather than
  // failing the card.
  const portrait = photo.ok ? await portraitJpeg(photo.data) : null;
  const photoSrc =
    portrait === null ? null : `data:image/jpeg;base64,${portrait.toString("base64")}`;

  const written = resolveTranslation(person.translations, locale);

  const subline = teamMemberSubline(person, t);

  const { sideMargin, portraitWidth, portraitHeight, gap } = TEAM_CARD_LAYOUT;
  const radius = 30;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          gap: `${gap}px`,
          padding: `0 ${sideMargin}px`,
          backgroundColor: DARK_THEME.bg,
          fontFamily: OG_FONT_FAMILY,
          color: DARK_THEME.foreground,
        }}
      >
        {/* The portrait whole, at its own 4:5, in the frame the profile
            page gives it (`teamCardFrame`). The frame is a layer over the
            photo because its glow, an inset shadow, is drawn under an
            element's own content. */}
        <div
          style={{
            display: "flex",
            position: "relative",
            flexShrink: 0,
            width: `${portraitWidth}px`,
            height: `${portraitHeight}px`,
          }}
        >
          {/* A background rather than an <img>, at exactly the frame's
              shape (`portraitJpeg`). */}
          {photoSrc !== null && (
            <div
              style={{
                display: "flex",
                width: "100%",
                height: "100%",
                borderRadius: `${radius}px`,
                backgroundImage: `url(${photoSrc})`,
                backgroundSize: "100% 100%",
              }}
            />
          )}
          <div
            style={{
              display: "flex",
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              borderRadius: `${radius}px`,
              ...teamCardFrame(person.pick),
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: `${TEAM_CARD_COLUMN_WIDTH}px`,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "20px",
              marginBottom: "34px",
            }}
          >
            <SogBadge height={84} />
            {/* The mark's own lettering, in ink: it takes `currentColor`. */}
            <SogWordmark height={38} />
          </div>

          {/* Headed as the profile page heads them (`team-name.ts`): the
              first name with the nickname in act, an admin's surname on the
              line under the rule. One size for every name
              (`TEAM_CARD_HEADLINE_SIZE`). The two are runs of a wrapping row,
              each never shrunk, rather than `teamMemberHeadline`'s fragment,
              which satori lays out as one box that cannot wrap: so a name
              too wide for one line puts the nickname whole on the second,
              and a nickname wider than the column alone is cut at its edge
              by the row's overflow rather than spilling off the card. */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              columnGap: "14px",
              fontSize: `${TEAM_CARD_HEADLINE_SIZE}px`,
              fontWeight: 600,
              lineHeight: 1.08,
              letterSpacing: "-1px",
              overflow: "hidden",
            }}
          >
            <div style={{ display: "flex", flexShrink: 0 }}>{person.firstName}</div>
            {person.nickname !== null && (
              <div style={{ display: "flex", flexShrink: 0, color: BRAND.act }}>
                {person.nickname}
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              height: "10px",
              margin: "22px 0 18px",
              borderRadius: "999px",
              backgroundColor: BRAND.world,
            }}
          />

          <div
            style={{
              display: "flex",
              fontSize: "30px",
              color: DARK_THEME.mutedFg,
            }}
          >
            {subline}
          </div>

          {written !== null && (
            <div
              style={{
                display: "block",
                marginTop: "14px",
                fontSize: "30px",
                lineHeight: 1.3,
                lineClamp: 3,
              }}
            >
              {written.shortDescription}
            </div>
          )}
        </div>
      </div>
    ),
    {
      ...OG_CARD_SIZE,
      fonts,
      headers: { "Cache-Control": TEAM_CARD_CACHE_CONTROL },
    },
  );
}
