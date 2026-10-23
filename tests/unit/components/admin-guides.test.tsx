import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AdminGuidesPage } from "@/components/admin/guides/admin-guides-page";
import { GuideUsageCard } from "@/components/admin/guides/edit-guide-page";
import { GuideFilesCard } from "@/components/admin/guides/guide-files-card";
import { NewGuideForm } from "@/components/admin/guides/new-guide-page";
import type { AdminGuide, AdminGuideFile } from "@/services/guides/guides.contracts";

/**
 * **The admin guide pages' rules.** The list's: no guide can be deleted, and
 * each row says its languages with their sizes. The new form's: a file over
 * the cap is called out as it is picked and nothing is sent. The files card's:
 * a guide's only file cannot be removed, another one is removed only through
 * the confirm dialog, and each file opens in exactly its own language.
 *
 * Translations echo their key, so nothing here depends on wording.
 */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values
      ? `${key} ${Object.entries(values)
          .map(([name, value]) => `${name}=${String(value)}`)
          .join(" ")}`
      : key,
  useLocale: () => "en",
}));

vi.mock("@/providers", () => ({
  useTimezone: () => "Europe/Helsinki",
}));

vi.mock("@/hooks/use-language-names", () => ({
  useLanguageNames: () => (_locale: string, fallback: string) => fallback,
}));

const NOBODY = { by: null, via: null };

function guideFile(locale: AdminGuideFile["locale"], byteSize: number): AdminGuideFile {
  return {
    locale,
    fileName: `guide-${locale}.pdf`,
    byteSize,
    uploadedAt: "2026-10-20T09:00:00Z",
    uploaded: { by: "Ada Admin", via: null },
  };
}

const GUIDE: AdminGuide = {
  id: "3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b",
  label: "Parents' guide",
  files: [guideFile("en", 1_572_864), guideFile("fi", 512_000)],
  usages: [],
  createdAt: "2026-10-20T09:00:00Z",
  created: NOBODY,
  updatedAt: "2026-10-21T09:00:00Z",
  lastSaved: NOBODY,
};

const PAGE = "746388a7-2edd-456b-b7d1-4e9828f85af9";
const DRAFT = "94f2a395-3c9f-49f6-8770-f9f4c28bfd91";
const titles = [{ locale: "en" as const, title: "Gaming clubs in Espoo" }];

describe("the guides list", () => {
  it("offers no way to delete a guide, and names each language with its size", () => {
    render(<AdminGuidesPage guides={[GUIDE]} status="success" />);
    expect(screen.getByText("Parents' guide")).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText("1.5 MB")).toBeTruthy();
    expect(screen.getByText("500 kB")).toBeTruthy();
  });

  it("marks a guide with how many landing pages place it", () => {
    render(
      <AdminGuidesPage
        guides={[
          {
            ...GUIDE,
            usages: [
              { pageId: PAGE, titles, inLiveCopy: true, inWorkingCopy: true },
              { pageId: DRAFT, titles, inLiveCopy: false, inWorkingCopy: true },
            ],
          },
        ]}
        status="success"
      />,
    );
    expect(screen.getByText("onLandingPages count=2")).toBeTruthy();
  });
});

describe("where a guide is used", () => {
  it("lists each landing page with its status page and copies", () => {
    render(
      <GuideUsageCard
        usages={[
          { pageId: PAGE, titles, inLiveCopy: true, inWorkingCopy: false },
          { pageId: DRAFT, titles, inLiveCopy: false, inWorkingCopy: true },
        ]}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "usage.landingPage title=Gaming clubs in Espoousage.landingPageState.liveOnly",
      "usage.landingPage title=Gaming clubs in Espoousage.landingPageState.workingOnly",
    ]);
    expect(within(items[0]).getByRole("link").getAttribute("href")).toContain(
      `/admin/landing-pages/${PAGE}`,
    );
  });

  it("says a guide offered nowhere is not offered anywhere yet", () => {
    render(<GuideUsageCard usages={[]} />);
    expect(screen.getByText("usage.none")).toBeTruthy();
  });
});

function pick(input: HTMLElement, file: File) {
  fireEvent.change(input, { target: { files: [file] } });
}

describe("the new guide form", () => {
  it("calls out a file over the cap as it is picked, and sends nothing", () => {
    const create = vi.fn();
    render(<NewGuideForm create={create} onCancel={() => {}} />);

    fireEvent.change(screen.getByLabelText("fields.label"), { target: { value: "Parents' guide" } });
    pick(
      screen.getByLabelText("fields.file"),
      new File([new Uint8Array(4 * 1024 * 1024 + 1)], "big.pdf"),
    );
    expect(screen.getByText(/^tooLarge size=4 MB limit=4 MB$/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "newPage.submit" }));
    expect(create).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("tooLarge");
  });

  it("asks for a label before anything is sent", () => {
    const create = vi.fn();
    render(<NewGuideForm create={create} onCancel={() => {}} />);
    pick(screen.getByLabelText("fields.file"), new File(["%PDF-1.7"], "guide.pdf"));

    fireEvent.click(screen.getByRole("button", { name: "newPage.submit" }));

    expect(create).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("errors.labelMissing");
  });

  it("creates the guide with its trimmed label, the chosen language and the file, and holds the button", async () => {
    const create = vi.fn(() => new Promise<void>(() => {}));
    render(<NewGuideForm create={create} onCancel={() => {}} />);
    const file = new File(["%PDF-1.7"], "guide.pdf");

    fireEvent.change(screen.getByLabelText("fields.label"), { target: { value: "  Parents' guide " } });
    fireEvent.change(screen.getByLabelText("fields.language"), { target: { value: "sv" } });
    pick(screen.getByLabelText("fields.file"), file);
    fireEvent.click(screen.getByRole("button", { name: "newPage.submit" }));

    expect(create).toHaveBeenCalledWith({ label: "Parents' guide", locale: "sv", file });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "newPage.submit" }).hasAttribute("disabled"),
      ).toBe(true),
    );
  });
});

describe("a guide's files", () => {
  it("cannot remove a guide's only file", () => {
    render(
      <GuideFilesCard
        guide={{ ...GUIDE, files: [guideFile("en", 1000)] }}
        upload={vi.fn()}
        remove={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "file.remove" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.getByText("file.lastFile")).toBeTruthy();
  });

  it("opens each file in exactly its own language", () => {
    render(<GuideFilesCard guide={GUIDE} upload={vi.fn()} remove={vi.fn()} />);
    expect(screen.getByRole("link", { name: "open" }).getAttribute("href")).toBe(
      `/api/admin/guides/${GUIDE.id}/file?locale=en`,
    );

    fireEvent.click(screen.getByRole("button", { name: "Suomi" }));

    expect(screen.getByText("guide-fi.pdf")).toBeTruthy();
    expect(screen.getByRole("link", { name: "open" }).getAttribute("href")).toBe(
      `/api/admin/guides/${GUIDE.id}/file?locale=fi`,
    );
  });

  it("removes a language only through the confirm dialog", async () => {
    const remove = vi.fn(async () => {});
    render(<GuideFilesCard guide={GUIDE} upload={vi.fn()} remove={remove} />);

    fireEvent.click(screen.getByRole("button", { name: "file.remove" }));
    expect(remove).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole("button", { name: "removeDialog.confirm" }));

    await waitFor(() => expect(remove).toHaveBeenCalledWith("en"));
  });

  it("uploads a picked file into the tab shown", async () => {
    const upload = vi.fn(async () => {});
    const { container } = render(<GuideFilesCard guide={GUIDE} upload={upload} remove={vi.fn()} />);
    const file = new File(["%PDF-1.7"], "new.pdf");

    const input = container.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) throw new Error("no file input");
    pick(input, file);

    await waitFor(() => expect(upload).toHaveBeenCalledWith("en", file));
  });
});
