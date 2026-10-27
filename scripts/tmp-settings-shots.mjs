import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const OUT = "C:/Users/Kyle/AppData/Local/Temp/claude/C--Users-Kyle-work-Sogverse/ba0d187a-908c-47ed-9df6-37785ed3ed07/scratchpad/settings-shots";
mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:3107";
const sizes = Object.fromEntries(Object.entries({ desktop: { width: 1440, height: 900 }, phone: { width: 360, height: 800 } }).filter(([k])=>(process.env.SIZES||"desktop,phone").split(",").includes(k)));
const states = (process.env.STATES||"loading,failed,unchecked,checked,saving").split(",");
const n = { loading: 1, failed: 2, unchecked: 3, checked: 4, saving: 5 };
const browser = await chromium.launch();
for (const [sname, vp] of Object.entries(sizes)) {
  for (const state of states) {
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    await page.goto(BASE + "/login");
    await page.waitForFunction(() => { const f = document.querySelector("#identifier"); return !!f && Object.keys(f).some(k => k.startsWith("__react")); }, { timeout: 120000 });
    await page.fill("#identifier", "parent@example.com");
    await page.fill("#password", "password");
    await page.keyboard.press("Enter");
    await page.waitForURL(/parent|unlock/, { timeout: 120000 }).catch(() => {});
    const r = await page.evaluate(() => fetch("/api/auth/pin/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin: "1111" }) }).then(r => r.status));
    console.log(sname, state, "pin", r);
    await page.route("**/api/parent/email-marketing", async (route) => {
      const m = route.request().method();
      if (m === "GET") {
        if (state === "loading") return new Promise(() => {});
        if (state === "failed") return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "x" }) });
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ subscribed: state === "checked" }) });
      }
      return new Promise(() => {});
    });
    await page.goto(BASE + "/settings", { waitUntil: "domcontentloaded" });
    const label = page.getByText("Emails from School of Gaming", { exact: false }).first();
    await label.waitFor({ timeout: 120000 });
    if (state === "failed") await page.getByRole("button", { name: /retry|try again/i }).first().waitFor({ timeout: 60000 }).catch(() => console.log("no retry btn"));
    if (["unchecked", "checked", "saving"].includes(state)) await page.locator("#settings-school-of-gaming-email").waitFor({ timeout: 30000 });
    if (state === "saving") {
      await page.locator("#settings-school-of-gaming-email").check();
      await page.getByRole("button", { name: /^sav/i }).first().click();
      await page.waitForTimeout(800);
    }
    await page.waitForTimeout(1000);
    const save = page.getByRole("button", { name: /^sav/i }).first();
    await label.scrollIntoViewIfNeeded();
    await save.scrollIntoViewIfNeeded();
    await page.evaluate((y) => window.scrollBy(0, y), (await label.boundingBox()).y - 130);
    const lb = await label.boundingBox(), sb = await save.boundingBox();
    console.log(sname, state, "label y", lb?.y, "save y", sb?.y, "disabled", await page.locator("#settings-school-of-gaming-email").isDisabled().catch(() => "n/a"));
    await page.screenshot({ path: `${OUT}/${n[state]}-${state}-${sname}.png` });
    await ctx.close();
  }
}
await browser.close();



