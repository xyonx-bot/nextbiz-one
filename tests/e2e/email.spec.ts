import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * Automatic email, end to end against a local Mailpit inbox (MAILPIT_URL, SMTP_URL on the server).
 * Skipped when MAILPIT_URL isn't set. PROD GUARD.
 */
const DB = process.env.DATABASE_URL ?? "";
if (DB.includes("one-db:5432") || DB.includes("one.nextbizstudio.com")) { console.error("[PROD GUARD] E2E suite aborted."); process.exit(0); }
const MP = process.env.MAILPIT_URL;
const T = Date.now();

async function inbox(request: APIRequestContext, to: string, subject: RegExp, timeout = 15000): Promise<{ html: string; text: string; subject: string }> {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const r = await (await request.get(`${MP}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json();
    const m = (r.messages ?? []).find((x: { Subject: string }) => subject.test(x.Subject));
    if (m) { const full = await (await request.get(`${MP}/api/v1/message/${m.ID}`)).json(); return { html: full.HTML, text: full.Text, subject: m.Subject }; }
    await new Promise((res) => setTimeout(res, 500));
  }
  throw new Error(`no email to ${to} matching ${subject}`);
}
const linkIn = (text: string, path: string) => { const m = text.match(new RegExp(`https?://[^\\s]+${path}[^\\s]*`)); if (!m) throw new Error(`no ${path} link`); const u = new URL(m[0]); return u.pathname + u.search; };
async function opLogin(page: import("@playwright/test").Page) {
  await page.goto("/login"); await page.fill("#email", process.env.OPERATOR_EMAIL!); await page.fill("#password", process.env.OPERATOR_PASS!);
  await Promise.all([page.click("button[type=submit]"), page.waitForURL((u) => !u.pathname.startsWith("/login"))]);
}

test.describe.serial("automatic email", () => {
  test.skip(!MP, "MAILPIT_URL not set");

  test("request access → applicant + operator emails → approve → 'create account' link joins the workspace directly", async ({ page, request, browser }) => {
    const email = `applicant-${T}@e2e.test`, biz = `Mail Bakery ${T}`;
    const r = await request.post("/api/auth/request-access", { data: { businessName: biz, useDescription: "We take cake orders on WhatsApp every day", email } });
    expect(r.status()).toBe(201);
    const got = await inbox(request, email, /We got your NextBiz One request/);
    expect(got.html).toContain(biz);
    await inbox(request, process.env.OPERATOR_EMAIL!, new RegExp(`New access request: ${biz}`));

    const op = await browser.newPage(); await opLogin(op);
    const list = await (await op.request.get("/api/operator/requests")).json();
    const req = list.requests.find((x: { email: string }) => x.email === email);
    expect((await op.request.patch(`/api/operator/requests/${req.id}`, { data: { action: "approve" } })).status()).toBe(200);
    await op.close();

    const ok = await inbox(request, email, /Your NextBiz One workspace is ready/);
    await page.goto(linkIn(ok.text, "/signup"));
    await expect(page.locator("#email, input[type=email]").first()).toHaveValue(email);
    await page.locator("input[type=password]").first().fill("bakery-pass-123");
    await page.locator("button[type=submit]").click();
    // joined the approved workspace — no second review
    await page.waitForURL((u) => !u.pathname.startsWith("/signup"), { timeout: 15000 });
    await expect(page.locator("body")).not.toContainText("You're on the list");
  });

  test("forgot password → reset email → new password works", async ({ page, request }) => {
    const email = `applicant-${T}@e2e.test`;
    await page.goto("/forgot"); await page.getByTestId("forgot-email").fill(email); await page.getByTestId("forgot-submit").click();
    await expect(page.getByTestId("forgot-done")).toContainText("on its way");
    const m = await inbox(request, email, /Reset your NextBiz One password/);
    await page.goto(linkIn(m.text, "/reset"));
    await page.getByTestId("reset-pw").fill("new-bakery-pass-9"); await page.getByTestId("reset-pw2").fill("new-bakery-pass-9");
    await page.getByTestId("reset-submit").click(); await expect(page.getByTestId("reset-done")).toBeVisible();
    await page.goto("/login"); await page.fill("#email", email); await page.fill("#password", "new-bakery-pass-9");
    await Promise.all([page.click("button[type=submit]"), page.waitForURL((u) => !u.pathname.startsWith("/login"))]);
  });

  test("operator: Email view shows SMTP and a test email arrives; reject sends the reason", async ({ page, request }) => {
    await opLogin(page);
    await page.goto("/operator#email"); await expect(page.getByTestId("op-email-view")).toContainText("SMTP");
    const to = `ops-${T}@e2e.test`;
    expect((await page.request.post("/api/operator/email", { data: { to } })).status()).toBe(200);
    await inbox(request, to, /test email/);
    const rej = `nope-${T}@e2e.test`;
    await request.post("/api/auth/request-access", { data: { businessName: `Nope ${T}`, useDescription: "Testing the rejection email path", email: rej } });
    const list = await (await page.request.get("/api/operator/requests")).json();
    const req = list.requests.find((x: { email: string }) => x.email === rej);
    await page.request.patch(`/api/operator/requests/${req.id}`, { data: { action: "reject", reason: "We couldn't find a WhatsApp Business number" } });
    const m = await inbox(request, rej, /About your NextBiz One request/);
    expect(m.text).toContain("We couldn't find a WhatsApp Business number");
  });

  test("settings: morning summary can be switched off", async ({ page }) => {
    await opLogin(page); await page.goto("/settings#notifications");
    const t = page.getByTestId("digest-toggle"); await expect(t).toBeEnabled();
    const before = await t.getAttribute("aria-checked");
    await t.click(); await expect(t).toHaveAttribute("aria-checked", before === "true" ? "false" : "true");
    await t.click(); await expect(t).toHaveAttribute("aria-checked", before ?? "true");
  });
});
