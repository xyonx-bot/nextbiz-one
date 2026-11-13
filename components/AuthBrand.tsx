import { Icon } from "./Icon";

/** Brand block above every auth card (logo + wordmark + tagline). */
export function AuthBrand() {
  return (
    <div className="col gap-4" style={{ alignSelf: "flex-start" }}>
      <div className="auth-brand"><img src="/logo.png" alt="" /><b>NextBiz One</b></div>
      <div className="auth-sub xs faint" style={{ fontWeight: 600 }}>WhatsApp-first client platform for small businesses</div>
    </div>
  );
}

/**
 * Auth layout — design v2 (nextbiz-one-v2/auth): product story on the left (hidden <900px), form on the right.
 * Illustrative bubbles/numbers on the story side are clearly decorative examples, not account data.
 */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pg-auth">
      <section className="story" aria-hidden="true">
        <div className="brand"><img src="/logo.png" alt="" />NextBiz One</div>
        <div className="collage">
          <div className="fl c1"><div className="who"><span className="av xs c1">RS</span>Rahul Sharma<span className="sp" /><span style={{ fontWeight: 600, color: "var(--ink-3)" }}>11:18</span></div>Hi! I saw your ad. Do you build websites for small businesses?</div>
          <div className="fl c2"><div className="who" style={{ color: "var(--grape-deep)" }}><Icon name="lightning" size="xs" />Auto-reply · 2 sec</div>Hi Rahul 👋 Welcome! Tell me what you need and we&apos;ll reply within the hour.</div>
          <div className="fl c3"><span className="k">First reply</span><div className="v">6 min</div><span className="delta up"><Icon name="arrow-up-right" size="xs" />2 min faster</span></div>
          <div className="fl c4"><span className="k">Festive broadcast</span><div className="row" style={{ marginTop: 6, gap: 10 }}><div className="v">72%</div><span className="small muted" style={{ fontWeight: 600 }}>read by opted-in<br />customers</span></div></div>
        </div>
        <h1>Every WhatsApp customer, <em>answered</em> — even when you&apos;re busy.</h1>
        <p>One inbox for your business number, instant auto-replies, and broadcasts that only reach people who said yes.</p>
        <div className="trust"><span><Icon name="seal-check" size="sm" />Official WhatsApp Business Platform</span><span><Icon name="shield-check" size="sm" />Your data stays yours</span><span><Icon name="heart" size="sm" />Free in early access</span></div>
      </section>
      <section className="side">{children}</section>
    </div>
  );
}
