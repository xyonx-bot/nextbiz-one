import Link from "next/link";

export const metadata = { title: "Page not found — NextBiz One" };

/** 404 — friendly, on-brand, one clear way back. */
export default function NotFound() {
  return (
    <main className="pg-oops" data-testid="not-found">
      <img src="/art/inbox.webp" alt="" width={200} height={200} />
      <span className="code">404</span>
      <h1>This page went quiet</h1>
      <p>The link may be old, or the page moved. Your chats and data are safe.</p>
      <div className="row gap-6" style={{ justifyContent: "center" }}><Link className="btn btn-primary" href="/">Go to dashboard</Link><Link className="btn btn-soft" href="/inbox">Open inbox</Link></div>
    </main>
  );
}
