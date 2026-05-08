import { test, type Locator } from "@playwright/test";

// .tap() on hasTouch profiles — Playwright .click() synthesis on WebKit is
// unreliable for <a> targets (microsoft/playwright#19624).
export async function activate(locator: Locator): Promise<void> {
  if (test.info().project.use.hasTouch) {
    await locator.tap();
  } else {
    await locator.click();
  }
}
