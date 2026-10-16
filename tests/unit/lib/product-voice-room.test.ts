import { describe, expect, it } from "vitest";
import { productVoiceRoom } from "@/lib/products/voice-room";

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
