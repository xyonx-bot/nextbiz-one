// Responsive sweep — runs against a live instance (PLAYWRIGHT_BASE_URL).
// Verifies: zero horizontal overflow at every declared breakpoint, and the
// wireframe interaction states (drawer, panel flyout, show-thread,
// show-editor, show-detail, phone flyout) actually fire in production.
import { chromium } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3200";
const EMAIL = process.env.OPERATOR_EMAIL;
const PASS = process.env.OPERATOR_PASS;
const PAGES = ["/", "/inbox", "/contacts", "/templates", "/broadcasts", "/automation", "/settings"];
const WIDTHS = [1440, 1280, 1180, 1024, 900, 768, 639, 390];

const fails = [];
function check(name, cond, detail = "") {
  const ok = Boolean(cond);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) fails.push(name);
}

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto(BASE + "/login");

if (EMAIL && PASS) {
  const res = await ctx.request.post(BASE + "/api/auth/login", {
    data: { email: EMAIL, password: PASS },
  });
  check("api login", res.ok(), `status ${res.status()}`);
}

async function shot(path, w) {
  await page.screenshot({ path: `test-results/sweep/${path}-${w}.png` });
}

for (const w of WIDTHS) {
  await page.setViewportSize({ width: w, height: 900 });

  for (const p of PAGES) {
    await page.goto(BASE + p, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const m = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      iw: window.innerWidth,
      clipped: [...document.querySelectorAll("*")].some((el) => {
        if (el.closest(".navwrap, .cpanel, .tphone, .scrim, .qa-menu, .tip, .bcomposer")) return false;
        const st = getComputedStyle(el);
        if (st.opacity === "0" || st.display === "none" || st.position === "fixed") return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1);
      }),
    }));
    check(`overflow ${p} @${w}`, m.sw <= m.iw, `scrollWidth=${m.sw} innerWidth=${m.iw}`);
    if (m.sw > m.iw || m.clipped) check(`clipped ${p} @${w}`, false, "element exceeds viewport");
    await shot(p.slice(1) || "dashboard", w);
  }

  // ── interaction states ──
  try {
  if (w === 390) {
    // mobile: burger → drawer opens
    await page.goto(BASE + "/inbox", { waitUntil: "networkidle" });
    await page.click("[data-testid=burger]");
    await page.waitForTimeout(400);
    const drawer = await page.evaluate(() => document.querySelector(".navwrap")?.getBoundingClientRect().left ?? -999);
    check("mobile drawer opens", drawer >= -1, `navwrap left=${drawer}`);
    await page.evaluate(() => { document.querySelector(".scrim")?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await page.waitForTimeout(300);

    // mobile inbox: pick a conversation → thread swaps in (show-thread)
    const crow = page.locator("[data-testid=crow]").first();
    if (await crow.count()) {
      await crow.click();
      await page.waitForTimeout(600);
      const threadVisible = await page.evaluate(() => {
        const t = document.querySelector(".thread");
        return t && getComputedStyle(t).display !== "none";
      });
      const listHidden = await page.evaluate(() => {
        const l = document.querySelector(".clist");
        return l && getComputedStyle(l).display === "none";
      });
      check("mobile show-thread", threadVisible && listHidden);
      await page.evaluate(() => { document.querySelector("[data-testid=thread-back]")?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
      await page.waitForTimeout(300);
      await page.evaluate(() => document.body.classList.remove("show-thread"));
    } else {
      console.log("SKIP  mobile show-thread — no conversations");
    }

    // mobile contacts: krow → detail sheet (show-detail)
    await page.goto(BASE + "/contacts", { waitUntil: "networkidle" });
    const krow = page.locator("[data-testid=krow]").first();
    if (await krow.count()) {
      await krow.click();
      await page.waitForTimeout(400);
      const kdVisible = await page.evaluate(() => {
        const k = document.querySelector(".kdetail");
        return k && getComputedStyle(k).display !== "none";
      });
      check("mobile show-detail", kdVisible);
      await page.evaluate(() => { document.querySelector("[data-testid=kdetail-back]")?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
      await page.waitForTimeout(300);
      await page.evaluate(() => document.body.classList.remove("show-detail"));
    }

    // mobile templates: trow → editor (show-editor)
    await page.goto(BASE + "/templates", { waitUntil: "networkidle" });
    const trow = page.locator("[data-testid=trow]").first();
    if (await trow.count()) {
      await trow.click();
      await page.waitForTimeout(400);
      const teVisible = await page.evaluate(() => {
        const t = document.querySelector(".tedit");
        return t && getComputedStyle(t).display !== "none";
      });
      check("mobile show-editor", teVisible);
      await page.evaluate(() => { document.querySelector("[data-testid=tedit-back]")?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
      await page.waitForTimeout(300);
      await page.evaluate(() => document.body.classList.remove("show-editor"));
    }
  }

  if (w === 900) {
    // tablet: parent chip → panel flyout opens
    await page.goto(BASE + "/inbox", { waitUntil: "networkidle" });
    await page.evaluate(() => {
      const chip = document.querySelector(".rail .ri.parent");
      if (chip) chip.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await page.waitForTimeout(400);
    const flyout = await page.evaluate(() => {
      const np = document.querySelector(".npanel");
      return np ? getComputedStyle(np).opacity : "0";
    });
    check("tablet panel flyout", flyout === "1", `npanel opacity=${flyout}`);
    await page.evaluate(() => { document.querySelector(".scrim")?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await page.waitForTimeout(300);

    // tablet templates: Preview toggle opens the phone flyout (panel-open)
    await page.goto(BASE + "/templates", { waitUntil: "networkidle" });
    const trow = page.locator("[data-testid=trow]").first();
    if (await trow.count()) {
      await trow.click();
      await page.waitForTimeout(300);
      const prev = page.locator("[data-testid=tpl-preview-toggle]");
      if (await prev.count()) {
        await prev.click();
        await page.waitForTimeout(400);
        const phoneOn = await page.evaluate(() => document.body.classList.contains("panel-open"));
        check("tablet phone flyout", phoneOn);
        await page.evaluate(() => document.body.classList.remove("panel-open"));
      } else {
        console.log("SKIP  tablet phone flyout — no preview toggle");
      }
    }

    // tablet inbox: info button opens the contact panel flyout
    await page.goto(BASE + "/inbox", { waitUntil: "networkidle" });
    const crow = page.locator("[data-testid=crow]").first();
    if (await crow.count()) {
      await crow.click();
      await page.waitForTimeout(400);
      const tog = page.locator("[data-testid=panel-toggle]");
      if (await tog.count()) {
        await tog.click();
        await page.waitForTimeout(400);
        const cpanelOn = await page.evaluate(() => document.body.classList.contains("panel-open"));
        check("tablet cpanel flyout", cpanelOn);
        await page.evaluate(() => document.body.classList.remove("panel-open"));
      }
    }
  }
  } catch (err) {
    check("interaction sweep", false, `crashed: ${String(err).slice(0, 160)}`);
  }
}

await browser.close();
console.log(fails.length === 0 ? "\nALL SWEEP CHECKS PASSED" : `\n${fails.length} SWEEP FAILURES`);
process.exit(fails.length === 0 ? 0 : 1);
