/* eslint-disable i18next/no-literal-string -- admin-only preview filler that exists to give the sticky rail some height; every string here is placeholder text nobody outside the team will ever see, and it is deleted with the branch */
// TEMP — strip before merge.
//
// Filler stacked under the signup panel in the `required-consents-tall`
// scenario, and nowhere else. Its only job is to make the sticky signup rail
// taller than a 1080p viewport so the two-end clamp can be judged by scrolling:
// a panel that fits pins under the header, a panel that does not scrolls with
// the page and clamps when its bottom reaches the viewport bottom.
//
// Deliberately obvious as filler — literal English, no message keys, no real
// product concept — so nobody mistakes it for a section that was designed. It
// lives in its own file so that deleting the file plus the three references to
// it (the scenario meta, the registry entry, the scene's `tallFiller` prop) is
// the whole removal.

const FILLER_BLOCKS = [
  "TEMP FILLER — not a real section",
  "TEMP FILLER — still not a real section",
  "TEMP FILLER — nor is this one",
  "TEMP FILLER — the last of them",
];

export function TempTallSignupFiller() {
  return (
    <div className="space-y-4">
      {FILLER_BLOCKS.map((title) => (
        <div key={title} className="rounded-md border border-border p-4">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="mt-2 text-xs text-muted-foreground">
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do
            eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim
            ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut
            aliquip ex ea commodo consequat.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Duis aute irure dolor in reprehenderit in voluptate velit esse
            cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat
            cupidatat non proident, sunt in culpa qui officia deserunt mollit
            anim id est laborum.
          </p>
        </div>
      ))}
    </div>
  );
}
