import { describe, expect, it } from "vitest";
import { INERT_HREF, ROUTES } from "@/lib/constants/routes";
import { joinSwitchLanding, productVoiceRoom } from "@/lib/products/voice-room";

const translations = [
  { locale: "en", voice_join_instructions: "Dial in at 18:00." },
  { locale: "fi", voice_join_instructions: null },
  { locale: "sv", voice_join_instructions: "Ring in kl. 18." },
];

describe("productVoiceRoom", () => {
  it("is the Sogverse room, carrying nothing else", () => {
    expect(
      productVoiceRoom(
        { voice_room_mode: "sogverse", external_voice_url: null },
        translations,
      ),
    ).toEqual({ mode: "sogverse" });
  });

  it("carries the link of a meeting held elsewhere", () => {
    expect(
      productVoiceRoom(
        { voice_room_mode: "external", external_voice_url: "https://meet.example/x" },
        [],
      ),
    ).toEqual({ mode: "external", url: "https://meet.example/x" });
  });

  it("throws on an external room with no link, which the schema forbids", () => {
    expect(() =>
      productVoiceRoom({ voice_room_mode: "external", external_voice_url: null }, []),
    ).toThrow();
  });

  it("lists every locale's written instructions and none it has not, picking none", () => {
    expect(
      productVoiceRoom(
        { voice_room_mode: "none", external_voice_url: null },
        translations,
      ),
    ).toEqual({
      mode: "none",
      instructions: [
        { locale: "en", text: "Dial in at 18:00." },
        { locale: "sv", text: "Ring in kl. 18." },
      ],
    });
  });
});

describe("joinSwitchLanding", () => {
  const room = ROUTES.voice.groupSession("5b6f0d1e-2c3a-4f5b-8d7e-9a0b1c2d3e4f");

  it("lands a Sogverse room's gamer in the room", () => {
    expect(joinSwitchLanding({ mode: "sogverse" }, room)).toBe(room);
  });

  it("lands an external meeting's gamer on their own My SOG", () => {
    expect(
      joinSwitchLanding({ mode: "external", url: "https://meet.example/x" }, room),
    ).toBeUndefined();
  });

  it("lands a no-room product's gamer on their own My SOG", () => {
    expect(
      joinSwitchLanding(
        { mode: "none", instructions: [{ locale: "en", text: "Dial in." }] },
        room,
      ),
    ).toBeUndefined();
  });

  it("lands on My SOG when the room has no group to open", () => {
    expect(joinSwitchLanding({ mode: "sogverse" }, INERT_HREF)).toBeUndefined();
  });
});
