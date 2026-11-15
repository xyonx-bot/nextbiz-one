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
export function AuthLayout({ children, art = "login" }: { children: React.ReactNode; art?: "login" | "signup" | "request" }) {
  return (
    <div className="pg-auth">
      <section className={`story art-${art}`} aria-hidden="true" style={{ ["--art" as string]: `url(/art/auth-${art}.webp)` }}>
        <div className="brand"><img src="/logo.png" alt="" />NextBiz One</div>
        <h1>Every WhatsApp customer, <em>answered</em> — even when you&apos;re busy.</h1>
        <p>One inbox for WhatsApp and Instagram, instant auto-replies, and broadcasts that only reach people who said yes.</p>
        <div className="trust"><span><Icon name="seal-check" size="sm" />Official WhatsApp Business Platform</span><span><Icon name="shield-check" size="sm" />Your data stays yours</span></div>
      </section>
      <section className="side">{children}</section>
    </div>
  );
}
