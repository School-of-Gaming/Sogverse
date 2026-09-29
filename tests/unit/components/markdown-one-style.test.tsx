import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import {
  MARKDOWN_CLASSES,
  MARKDOWN_CONTAINER_CLASSES,
  MARKDOWN_ELEMENT_CLASSES,
  Markdown,
  type MarkdownUseCase,
} from "@/components/ui/markdown";
import { EDITOR_PROSE } from "@/components/ui/rich-text-editor";
import {
  MARKDOWN_CONTAINER,
  MARKDOWN_LOOK,
  MARKDOWN_QUIET_INK,
  MARKDOWN_USE_CASES,
  inQuietInk,
  type MarkdownEmphasis,
  type MarkdownLook,
  type StyledMarkdownElement,
} from "@/lib/authored-markdown";
import { renderMarkdownForEmail } from "@/lib/email-templates/markdown";

/**
 * **Authored markdown renders in one style everywhere, mail included.**
 * Variants are allow-lists over one definition of the look: they decide which
 * elements survive and which outline tag a heading takes, never how an
 * element looks. The editor's writing surface paints the same classes, so a
 * writer sees while typing what a reader sees once it is saved; the email
 * renderer writes the same values inline, and emits what the app emits.
 */
const SOURCE =
  "# Title\n\n## Heading\n\n### Subheading\n\nA **bold** and *italic* paragraph with [a link](https://example.com).\n\n- one\n- two\n\n1. first";

/**
 * Every variant. The first test holds this list equal to the type, so the
 * type-check fails when a variant is added and not listed here — a new variant
 * cannot skip the one-style checks.
 */
const VARIANTS = [
  "feed",
  "marketing",
  "profile",
  "article",
] as const satisfies readonly MarkdownUseCase[];

/** Every element the one map styles; a test below holds it equal to the map. */
const STYLED_ELEMENTS = [
  "h1",
  "h2",
  "h3",
  "p",
  "ul",
  "ol",
  "strong",
  "a",
] as const;

/** A link off the site carries a translated marker, so the renders take the catalog. */
function renderInApp(element: ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {element}
    </NextIntlClientProvider>,
  );
}

/** The "opens in a new tab" marker a link off the site ends with. */
const NEW_TAB_MARKER = "[data-new-tab-marker]";

function renderRoot(variant: MarkdownUseCase, source = SOURCE) {
  const root = renderInApp(<Markdown variant={variant}>{source}</Markdown>)
    .container.firstElementChild;
  if (root === null) throw new Error("the renderer drew nothing");
  return root;
}

/**
 * Each element's classes, read off the rendered output of one variant. An
 * element the variant's allow-list drops reads as `undefined`.
 */
function renderedClasses(variant: MarkdownUseCase) {
  const root = renderRoot(variant);
  const byText = (text: string) =>
    [...root.querySelectorAll("h2, h3, h4, h5")].find(
      (el) => el.textContent === text,
    )?.className;
  return {
    container: root.className,
    h1: byText("Title"),
    h2: byText("Heading"),
    h3: byText("Subheading"),
    p: root.querySelector("p")?.className,
    ul: root.querySelector("ul")?.className,
    ol: root.querySelector("ol")?.className,
    strong: root.querySelector("strong")?.className,
    a: root.querySelector("a")?.className,
  };
}

describe("the one markdown style", () => {
  it("checks every variant and every styled element", () => {
    expectTypeOf<(typeof VARIANTS)[number]>().toEqualTypeOf<MarkdownUseCase>();
    expect([...STYLED_ELEMENTS].sort()).toEqual(
      Object.keys(MARKDOWN_ELEMENT_CLASSES).sort(),
    );
  });

  it.each(VARIANTS)(
    "paints every element %s allows with the one map's classes",
    (variant) => {
      const classes = renderedClasses(variant);
      expect(classes.container).toBe(MARKDOWN_CONTAINER_CLASSES);
      for (const element of STYLED_ELEMENTS) {
        const painted = classes[element];
        if (painted !== undefined) {
          expect(painted, element).toBe(MARKDOWN_ELEMENT_CLASSES[element]);
        }
      }
    },
  );

  /**
   * The check that no variant carries a style of its own: every class string
   * anywhere in a variant's output is the container's or one of the map's, and
   * an element the map does not style (`li`, `em`) carries none at all. The
   * new-tab marker inside a link off the site is the link's affordance, not
   * authored text, so it is the one thing set aside.
   */
  it.each(VARIANTS)("carries no styling of its own in %s", (variant) => {
    const root = renderRoot(variant);
    const allowed = new Set<string>(Object.values(MARKDOWN_ELEMENT_CLASSES));
    for (const el of root.querySelectorAll("*")) {
      if (el.closest(NEW_TAB_MARKER) !== null) continue;
      const className = el.getAttribute("class");
      if (className === null) continue;
      expect(allowed, `<${el.tagName.toLowerCase()}>`).toContain(className);
    }
  });

  it("renders a sub-list inside the list whose classes set its gap", () => {
    const root = renderRoot("feed", "- parent\n  1. child\n- sibling");
    const nested = root.querySelector("li > ol");
    expect(nested?.className).toBe(MARKDOWN_ELEMENT_CLASSES.ol);
    // The nested gap is the outer list's `[&_ol]:` reach, so the sub-list has
    // to be a descendant of a list carrying it.
    expect(nested?.parentElement?.parentElement?.className).toBe(
      MARKDOWN_ELEMENT_CLASSES.ul,
    );
    expect(MARKDOWN_ELEMENT_CLASSES.ul.split(/\s+/)).toContain("[&_ol]:mt-1");
  });

  it("keeps three visibly different heading sizes above a 16px body", () => {
    expect(MARKDOWN_CONTAINER_CLASSES).toContain("text-base");
    const sizes = (["h1", "h2", "h3"] as const).map(
      (level) => MARKDOWN_ELEMENT_CLASSES[level].match(/\btext-\S+/)?.[0],
    );
    expect(new Set(sizes).size).toBe(3);
    expect(sizes).not.toContain("text-base");
  });

  it("differs between variants only in the links it keeps", () => {
    const source = "Go [there](https://example.com).";
    const feed = renderInApp(<Markdown>{source}</Markdown>).container;
    const marketing = renderInApp(
      <Markdown variant="marketing">{source}</Markdown>,
    ).container;
    expect(feed.querySelector("a")).toBeNull();
    expect(feed.textContent).toContain("Go there.");
    expect(marketing.querySelector("a")?.className).toBe(
      MARKDOWN_ELEMENT_CLASSES.a,
    );
  });

  it("keeps neither headings nor links in a profile, only their words", () => {
    const root = renderRoot("profile");
    expect(root.querySelector("h1, h2, h3, h4, h5, h6")).toBeNull();
    expect(root.querySelector("a")).toBeNull();
    expect(root.textContent).toContain("Title");
    expect(root.textContent).toContain("with a link.");
    expect(root.querySelector("strong")?.className).toBe(
      MARKDOWN_ELEMENT_CLASSES.strong,
    );
  });
});

describe("the editor's writing surface", () => {
  /**
   * How the editor's single class attribute reaches each element. Block
   * margins go to direct children only, because ProseMirror wraps a list
   * item's text in a paragraph the renderer's tight lists do not have.
   */
  const SELECTOR: Record<keyof typeof MARKDOWN_ELEMENT_CLASSES, string> = {
    h1: "[&_h1]:",
    h2: "[&_h2]:",
    h3: "[&_h3]:",
    p: "[&>p]:",
    ul: "[&_ul]:",
    ol: "[&_ol]:",
    strong: "[&_strong]:",
    a: "[&_a]:",
  };
  const editorTokens = new Set(EDITOR_PROSE.split(/\s+/));

  it("restates the container's classes", () => {
    for (const token of MARKDOWN_CONTAINER_CLASSES.split(/\s+/)) {
      expect(editorTokens, token).toContain(token);
    }
  });

  it("restates every element's classes", () => {
    for (const element of STYLED_ELEMENTS) {
      for (const token of MARKDOWN_ELEMENT_CLASSES[element].split(/\s+/)) {
        expect(editorTokens, `${element}: ${token}`).toContain(
          `${SELECTOR[element]}${token}`,
        );
      }
    }
  });
});

/**
 * **The definition's classes are the tokens its values come from.** Every
 * class is resolved to what it paints by reading the token definitions out of
 * the stylesheets the app actually loads — Tailwind's theme, then SOG-UI's,
 * then the app's own, later declarations winning as they do in the cascade —
 * and the result has to equal the values the mail is written from. A class
 * changed without its value, or a value without its class, fails here.
 */
describe("the definition's classes and values", () => {
  const variables = new Map<string, string>();
  for (const source of [
    // Through Node's resolution rather than a path under the working
    // directory: a worktree has no node_modules of its own and resolves
    // packages from the checkout above it. Anchored at the checkout's own
    // package.json, since `import.meta.url` is not a file URL under jsdom.
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- the path is Node's resolution of a fixed package specifier, not input
    readFileSync(
      createRequire(join(process.cwd(), "package.json")).resolve(
        "tailwindcss/theme.css",
      ),
      "utf8",
    ),
    readFileSync("packages/sog-ui/src/tokens/theme.css", "utf8"),
    readFileSync("src/app/globals.css", "utf8"),
  ]) {
    for (const [, name, value] of source.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      variables.set(name, value.trim());
    }
  }

  function variable(name: string): string {
    const value = variables.get(name);
    if (value === undefined) throw new Error(`no token ${name}`);
    return value;
  }
  function px(value: string): number {
    const rem = /^([\d.]+)rem$/.exec(value);
    if (rem) return Number(rem[1]) * 16;
    const pixels = /^([\d.]+)px$/.exec(value);
    if (pixels) return Number(pixels[1]);
    throw new Error(`not a length: ${value}`);
  }
  function number(value: string): number {
    const ratio = /^calc\(([\d.]+)\s*\/\s*([\d.]+)\)$/.exec(value);
    return ratio ? Number(ratio[1]) / Number(ratio[2]) : Number(value);
  }
  const step = (n: string) => px(variable("--spacing")) * Number(n);

  /** A class string, resolved to the values it paints, with Tailwind's own precedence. */
  function resolve(classes: string) {
    const out: Record<string, string | number | boolean> = {};
    let stepLineHeight: number | undefined;
    let stepWeight: number | undefined;
    for (const token of classes.split(/\s+/)) {
      let m: RegExpExecArray | null;
      if ((m = /^mt-(\d+)$/.exec(token))) out.marginTop = step(m[1]);
      else if ((m = /^\[&_(?:ul|ol)\]:mt-(\d+)$/.exec(token))) {
        // A list's reach into the lists nested in it: both kinds of sub-list
        // have to be given the same gap.
        const nested = step(m[1]);
        if ("nestedMarginTop" in out && out.nestedMarginTop !== nested) {
          throw new Error(`two nested gaps in one look: ${classes}`);
        }
        out.nestedMarginTop = nested;
      } else if ((m = /^pl-(\d+)$/.exec(token))) out.indent = step(m[1]);
      else if ((m = /^space-y-(\d+)$/.exec(token))) out.itemGap = step(m[1]);
      else if ((m = /^list-(disc|decimal)$/.exec(token))) out.listStyle = m[1];
      else if (/^underline$/.test(token)) out.underline = true;
      else if ((m = /^underline-offset-(\d+)$/.exec(token))) out.underlineOffset = Number(m[1]);
      else if ((m = /^leading-(\w+)$/.exec(token))) {
        out.lineHeight = number(variable(`--leading-${m[1]}`));
      } else if ((m = /^font-(\w+)$/.exec(token))) {
        out.fontWeight = number(variable(`--font-weight-${m[1]}`));
      } else if ((m = /^text-([\w-]+)$/.exec(token)) && variables.has(`--text-${m[1]}`)) {
        out.fontSize = px(variable(`--text-${m[1]}`));
        const lineHeight = variables.get(`--text-${m[1]}--line-height`);
        const weight = variables.get(`--text-${m[1]}--font-weight`);
        stepLineHeight = lineHeight === undefined ? undefined : number(lineHeight);
        stepWeight = weight === undefined ? undefined : number(weight);
      } else if ((m = /^text-([\w-]+)$/.exec(token))) {
        out.color = variable(`--color-${m[1]}`).toLowerCase();
      } else throw new Error(`a class the resolver cannot read: ${token}`);
    }
    // A leading or weight utility overrides the one a size step carries.
    if (!("lineHeight" in out) && stepLineHeight !== undefined) {
      out.lineHeight = stepLineHeight;
    }
    if (!("fontWeight" in out) && stepWeight !== undefined) {
      out.fontWeight = stepWeight;
    }
    return out;
  }

  /** A look's values, without its classes. */
  function values(look: MarkdownLook) {
    const out: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(look)) {
      if (key === "classes" || key === "appOnly" || key === "ink") continue;
      out[key] = typeof value === "string" && key === "color" ? value.toLowerCase() : value;
    }
    return out;
  }

  const LOOKS: [string, MarkdownLook][] = [
    ["container", MARKDOWN_CONTAINER],
    ...Object.entries(MARKDOWN_LOOK),
  ];

  it.each(LOOKS)("resolves %s's classes to its values", (_name, look) => {
    expect(resolve(look.classes)).toEqual(values(look));
  });

  it.each(LOOKS)("resolves %s's classes to its values in the quiet ink", (_name, look) => {
    const quiet = inQuietInk(look);
    expect(resolve(quiet.classes)).toEqual(values(quiet));
    if (look.color !== undefined) {
      expect(quiet.color).toBe(MARKDOWN_QUIET_INK.color);
    }
  });

  /** The quiet emphasis swaps a look's ink class, so that class has to be the one painting its colour. */
  it.each(LOOKS)("names %s's ink wherever it has a colour", (_name, look) => {
    expect(look.ink === undefined).toBe(look.color === undefined);
    if (look.ink !== undefined) {
      expect(look.classes.split(/\s+/)).toContain(look.ink);
      expect(resolve(look.ink).color).toBe(look.color?.toLowerCase());
    }
  });

  /**
   * **A surface may set its authored text in the quiet ink, and nothing else
   * changes.** Read off the rendered output: an element's ink is its own
   * colour or, where it names none, the container's it inherits — so body,
   * every heading, the lists (and their markers) and the link all follow the
   * emphasis, while every size, weight and gap stays the one style's.
   */
  describe("the emphasis", () => {
    const LOOK_OF: Record<"container" | StyledMarkdownElement, MarkdownLook> = {
      container: MARKDOWN_CONTAINER,
      ...MARKDOWN_LOOK,
    };

    /** A rendered element's look classes, its app-only behaviour set aside. */
    function look(name: keyof typeof LOOK_OF, className: string | undefined) {
      if (className === undefined) throw new Error(`${name} was not rendered`);
      const appOnly = new Set((LOOK_OF[name].appOnly ?? "").split(/\s+/));
      return resolve(
        className
          .split(/\s+/)
          .filter((token) => !appOnly.has(token))
          .join(" "),
      );
    }

    function rendered(emphasis?: MarkdownEmphasis) {
      const root = renderInApp(
        <Markdown variant="marketing" emphasis={emphasis}>
          {SOURCE}
        </Markdown>,
      ).container.firstElementChild;
      if (root === null) throw new Error("the renderer drew nothing");
      const heading = (text: string) =>
        [...root.querySelectorAll("h2, h3, h4, h5")].find(
          (el) => el.textContent === text,
        )?.className;
      const container = look("container", root.className);
      const looks = {
        h1: look("h1", heading("Title")),
        h2: look("h2", heading("Heading")),
        h3: look("h3", heading("Subheading")),
        p: look("p", root.querySelector("p")?.className),
        ul: look("ul", root.querySelector("ul")?.className),
        ol: look("ol", root.querySelector("ol")?.className),
        strong: look("strong", root.querySelector("strong")?.className),
        a: look("a", root.querySelector("a")?.className),
      };
      const inks = Object.fromEntries(
        Object.entries(looks).map(([name, own]) => [
          name,
          "color" in own ? own.color : container.color,
        ]),
      );
      const withoutInk = (resolved: Record<string, unknown>) => {
        const rest = { ...resolved };
        delete rest.color;
        return rest;
      };
      return {
        inks: { container: container.color, ...inks },
        sizes: Object.fromEntries(
          Object.entries({ container, ...looks }).map(([name, own]) => [
            name,
            withoutInk(own),
          ]),
        ),
      };
    }

    const ink = (name: string) => variable(`--color-${name}`).toLowerCase();

    it("sets everything in the quiet ink when quiet", () => {
      const { inks } = rendered("quiet");
      for (const [name, color] of Object.entries(inks)) {
        expect(color, name).toBe(ink("muted-foreground"));
      }
    });

    it("sets the body in the ink and the link in its own by default", () => {
      const { inks } = rendered();
      for (const [name, color] of Object.entries(inks)) {
        expect(color, name).toBe(ink(name === "a" ? "act" : "foreground"));
      }
      expect(rendered("normal").inks).toEqual(inks);
    });

    it("changes nothing but the ink", () => {
      const quiet = rendered("quiet").sizes;
      expect(quiet).toEqual(rendered().sizes);
      expect(quiet.a).toMatchObject({ underline: true, fontWeight: 500 });
    });

    it("keeps the link's focus ring in either emphasis", () => {
      for (const emphasis of ["normal", "quiet"] as const) {
        expect(MARKDOWN_CLASSES[emphasis].elements.a).toContain(MARKDOWN_LOOK.a.appOnly);
      }
    });
  });

  /**
   * A sub-list sits as close under its bullet as the next sibling bullet
   * would, where the ordinary block margin would read as a paragraph break —
   * and it has to, for a list nested in either kind of list.
   */
  it.each(["ul", "ol"] as const)(
    "gaps a list nested in %s by the item gap, not the block margin",
    (element) => {
      const look = MARKDOWN_LOOK[element];
      expect(look.nestedMarginTop).toBe(look.itemGap);
      expect(look.nestedMarginTop).toBeLessThan(look.marginTop);
      expect(look.classes.split(/\s+/)).toEqual(
        expect.arrayContaining([
          `[&_ul]:mt-${look.nestedMarginTop / step("1")}`,
          `[&_ol]:mt-${look.nestedMarginTop / step("1")}`,
        ]),
      );
    },
  );

  /**
   * App-only classes are behaviour, so none of them may be a look class hiding
   * outside the check above: each is state- or structure-prefixed, or a focus
   * ring's corner.
   */
  it.each(LOOKS)("keeps %s's app-only classes out of the look", (_name, look) => {
    for (const token of (look.appOnly ?? "").split(/\s+/).filter(Boolean)) {
      expect(token.includes(":") || token.startsWith("rounded-"), token).toBe(true);
    }
  });
});

/**
 * **A mail renders what the page renders, variant by variant.** The same
 * source goes through the app's component and through the email renderer
 * under each variant, and the two must produce the same elements in the same
 * order, the same words and the same links — so an allow-list, an outline or
 * a link rule changed on one side alone fails here. Whitespace between blocks
 * and the word joiners that defuse a mail client's linkifier are not content.
 */
describe("the mail and the page", () => {
  const KITCHEN_SINK = [
    "# H1",
    "## H2",
    "### H3",
    "#### H4",
    "##### H5",
    "",
    "Para with **bold**, *em*, `code`, [a link](https://a.example/x), [a relative one](/shop),",
    "[a mail](mailto:hi@sog.gg), [a script](javascript:alert(1)), [a ref][r], <https://auto.example/y>",
    "and ![an image](https://a.example/i.png)  ",
    "hard break <b>raw inline</b>",
    "",
    "[r]: https://ref.example/z",
    "",
    "- tight",
    "  - nested",
    "- items",
    "",
    "3. numbered",
    "4. from three",
    "",
    "- loose",
    "",
    "- items",
    "",
    "> quoted words",
    "",
    "---",
    "",
    "```",
    "fenced",
    "```",
    "",
    "<div>raw block</div>",
    "",
    "Last.",
  ].join("\n");

  /** U+2060, the word joiner the mail defuses addresses with. */
  const JOINER = String.fromCharCode(0x2060);
  const withoutJoiners = (text: string) => text.split(JOINER).join("");

  /**
   * What the two must agree on. The new-tab marker is lifted out first: it is
   * the page's affordance for a tab the mail never opens, not authored text.
   */
  function shape(root: Element) {
    const content = root.cloneNode(true);
    if (!(content instanceof Element)) throw new Error("not an element");
    for (const marker of content.querySelectorAll(NEW_TAB_MARKER)) marker.remove();
    return {
      tags: [...content.querySelectorAll("*")].map((el) => el.tagName.toLowerCase()),
      text: withoutJoiners(content.textContent).replace(/\s/g, ""),
      links: [...content.querySelectorAll("a")].map((a) => ({
        href: a.getAttribute("href"),
        text: withoutJoiners(a.textContent),
      })),
    };
  }

  /** How each link opens: the one place the two are meant to differ. */
  function opening(root: Element) {
    return [...root.querySelectorAll("a")].map((a) => ({
      target: a.getAttribute("target"),
      rel: a.getAttribute("rel"),
      marked: a.querySelector(NEW_TAB_MARKER) !== null,
    }));
  }

  function renderMail(variant: MarkdownUseCase) {
    const mail = document.createElement("div");
    mail.innerHTML = renderMarkdownForEmail(KITCHEN_SINK, variant);
    const container = mail.firstElementChild;
    if (container === null) throw new Error("the mail renderer drew nothing");
    return container;
  }

  it.each(VARIANTS)("renders %s identically in both", (variant) => {
    expect(shape(renderMail(variant))).toEqual(
      shape(renderRoot(variant, KITCHEN_SINK)),
    );
  });

  const SAME_TAB = { target: null, rel: "noreferrer", marked: false };
  const NEW_TAB = { target: "_blank", rel: "noopener noreferrer", marked: true };

  /**
   * The kitchen sink's kept links, in order: another site's, a relative one,
   * a `mailto:`, and the reference and autolink, both another site's. The
   * blanked script link is no anchor in either.
   */
  it.each(VARIANTS)(
    "opens another site's links in a new tab on the page in %s, and never in the mail",
    (variant) => {
      const kept = MARKDOWN_USE_CASES[variant].features.links
        ? [NEW_TAB, SAME_TAB, SAME_TAB, NEW_TAB, NEW_TAB]
        : [];
      expect(opening(renderRoot(variant, KITCHEN_SINK))).toEqual(kept);
      expect(opening(renderMail(variant))).toEqual(
        kept.map(() => SAME_TAB),
      );
    },
  );
});
