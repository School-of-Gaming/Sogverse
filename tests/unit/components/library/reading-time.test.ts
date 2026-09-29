import { describe, expect, it } from "vitest";
import { readingMinutes } from "@/components/library/article/reading-time";

const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");

describe("readingMinutes", () => {
  it("is the word count over 200, rounded", () => {
    expect(readingMinutes(words(400))).toBe(2);
    expect(readingMinutes(words(499))).toBe(2);
    expect(readingMinutes(words(500))).toBe(3);
    expect(readingMinutes(words(1210))).toBe(6);
  });

  it("is never less than one minute", () => {
    expect(readingMinutes("")).toBe(1);
    expect(readingMinutes(words(20))).toBe(1);
  });

  it("counts none of markdown's syntax as words", () => {
    const plain = `Heading\n\nbold text and a cell and another cell\n\nquoted`;
    const marked = `## Heading\n\n**bold** _text_ and a | cell | and another | cell |\n|---|---|\n\n> quoted\\`;
    expect(readingMinutes(`${marked} ${words(193)}`)).toBe(
      readingMinutes(`${plain} ${words(193)}`),
    );
    // Ten readable words sit on the 299/300 edge: a single word made of
    // syntax would tip the first case to 2.
    expect(readingMinutes(`${marked} ${words(289)}`)).toBe(1);
    expect(readingMinutes(`${marked} ${words(290)}`)).toBe(2);
  });

  it("counts a link's text but not its address", () => {
    const link = "[read more](https://www.example.com/a/very/long/path?with=query&and=more)";
    const auto = "<https://www.example.com/another/long/path>";
    // Two readable words, plus 297 → 299 → 1 minute; any address word tips it to 2.
    expect(readingMinutes(`${link} ${auto} ${words(297)}`)).toBe(1);
    expect(readingMinutes(`${link} ${auto} ${words(298)}`)).toBe(2);
  });

  it("keeps an image's alt text and drops its address", () => {
    expect(readingMinutes(`![a cat](/img/cat.jpg) ${words(297)}`)).toBe(1);
    expect(readingMinutes(`![a cat](/img/cat.jpg) ${words(298)}`)).toBe(2);
  });

  it("counts a contraction as one word, in any script", () => {
    expect(readingMinutes(`don't can’t ${words(297)}`)).toBe(1);
    expect(readingMinutes(`hyvää päivää ${words(298)}`)).toBe(2);
  });
});
