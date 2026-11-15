import { Icon } from "./Icon";

/** Brand block above every auth card (logo + wordmark + tagline). */
export function AuthBrand() {
  return (
    <div className="col gap-4" style={{ alignSelf: "flex-start" }}>
      <div className="auth-brand"><img src="/logo.png" alt="" /><b>NextBiz One</b></div>
      <div className="auth-sub xs faint" style={{ fontWeight: 600 }}>WhatsApp, Instagram &amp; Meta Ads — one business suite</div>
    </div>
  );
}

/**
 * Auth layout — design v2 (nextbiz-one-v2/auth): product story on the left (hidden <900px), form on the right.
 * Illustrative bubbles/numbers on the story side are clearly decorative examples, not account data.
 */
const COPY = {
  login: { h: <>WhatsApp, Instagram and Meta Ads — <em>in one place</em>.</>, p: "Answer every customer, run ads that start conversations, and let AI take the busywork. One suite for your whole business on Meta." },
  signup: { h: <>One suite to <em>grow</em> your business on Meta.</>, p: "Chats, comments, broadcasts and ads — set up in minutes, managed from one screen. Start with the channel you use most." },
  request: { h: <>Chats, comments and ads, <em>finally together</em>.</>, p: "Tell us a little about your business. We review every request by hand and set you up within a day." },
} as const;
/**
 * Auth layout: the product story on the left (hidden <900px), form on the right. Headline + one line +
 * trust badges over a full illustration; the copy presents the whole suite, not just WhatsApp.
 */
export function AuthLayout({ children, art = "login" }: { children: React.ReactNode; art?: "login" | "signup" | "request" }) {
  const c = COPY[art];
  return (
    <div className="pg-auth">
      <section className={`story art-${art}`} aria-hidden="true" style={{ ["--art" as string]: `url(/art/auth-${art}.webp)` }}>
        <div className="brand"><img src="/logo.png" alt="" />NextBiz One</div>
        <h1>{c.h}</h1>
        <p>{c.p}</p>
        <div className="trust"><span><Icon name="seal-check" size="sm" />Built on Meta&apos;s official APIs</span><span><Icon name="shield-check" size="sm" />Your data stays yours</span></div>
      </section>
      <section className="side">{children}</section>
    </div>
  );
}
