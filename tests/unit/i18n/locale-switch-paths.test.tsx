import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  LocaleSwitchPaths,
  LocaleSwitchPathsProvider,
  useLocaleSwitchPaths,
  type LocaleSwitchPathMap,
} from "@/i18n/locale-switch-paths";

/**
 * **A page's cleanup clears only its own registration.** Moving from one
 * article to another mounts the new page's registration while the old one is
 * still on its way out; an unconditional clear on unmount would wipe the
 * article now on screen, and the picker would fall back to rebuilding a slug
 * that 404s in the other locale.
 */

const ARTICLE_A: LocaleSwitchPathMap = { en: "/en/library/a", fi: "/fi/kirjasto/a" };
const ARTICLE_B: LocaleSwitchPathMap = { en: "/en/library/b", fi: "/fi/kirjasto/b" };

function Registered() {
  const paths = useLocaleSwitchPaths();
  return <output>{paths === null ? "none" : (paths.en ?? "none")}</output>;
}

function Tree({ pages }: { pages: readonly LocaleSwitchPathMap[] }) {
  return (
    <LocaleSwitchPathsProvider>
      <Registered />
      {pages.map((paths) => (
        <LocaleSwitchPaths key={paths.en} paths={paths} />
      ))}
    </LocaleSwitchPathsProvider>
  );
}

function registered() {
  return screen.getByRole("status").textContent;
}

describe("LocaleSwitchPaths", () => {
  it("leaves the newer registration in place when the older page unmounts after it", () => {
    const { rerender } = render(<Tree pages={[ARTICLE_A]} />);
    expect(registered()).toBe("/en/library/a");

    // B arrives while A is still mounted, then A goes.
    rerender(<Tree pages={[ARTICLE_A, ARTICLE_B]} />);
    expect(registered()).toBe("/en/library/b");
    rerender(<Tree pages={[ARTICLE_B]} />);

    expect(registered()).toBe("/en/library/b");
  });

  it("leaves the newer registration in place when one page is swapped for another in one commit", () => {
    const { rerender } = render(<Tree pages={[ARTICLE_A]} />);

    rerender(<Tree pages={[ARTICLE_B]} />);

    expect(registered()).toBe("/en/library/b");
  });

  it("clears the registration when the last registering page unmounts", () => {
    const { rerender } = render(<Tree pages={[ARTICLE_B]} />);

    rerender(<Tree pages={[]} />);

    expect(registered()).toBe("none");
  });
});
