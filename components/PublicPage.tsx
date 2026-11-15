import Link from "next/link";

/**
 * Public, signed-out pages (Privacy, Terms, Data deletion, password help): brand header, a soft hero band,
 * an on-this-page index and the readable article card, plus a footer with every legal link — Meta's
 * reviewers open these, so they get the app's look rather than plain text.
 */
export type Section = { id: string; title: string; body: React.ReactNode };

export function PublicPage({ eyebrow, title, intro, updated, art, sections, children }: {
  eyebrow: string; title: string; intro: React.ReactNode; updated?: string; art?: string; sections?: Section[]; children?: React.ReactNode;
}) {
  return (
    <div className="pg-legal">
      <header className="lg-top">
        <Link href="/login" className="lg-brand"><img src="/logo.png" alt="" width={30} height={30} />NextBiz One</Link>
        <nav className="lg-nav"><Link href="/login">Log in</Link><Link href="/request-access" className="btn btn-primary btn-sm">Request access</Link></nav>
      </header>
      <section className="lg-hero">
        <div className="lg-hero-t">
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{intro}</p>
          {updated && <small>Last updated {updated}</small>}
        </div>
        {art && <img className="lg-art" src={art} alt="" width={220} height={220} />}
      </section>
      <div className={`lg-body${sections?.length ? "" : " solo"}`}>
        {sections && sections.length > 0 && (
          <aside className="lg-toc" aria-label="On this page">
            <b>On this page</b>
            {sections.map((s, i) => <a key={s.id} href={`#${s.id}`}><span>{i + 1}</span>{s.title}</a>)}
          </aside>
        )}
        <article className="card lg-card">
          {children}
          {sections?.map((s, i) => (
            <section key={s.id} id={s.id} className="lg-sec">
              <h2><span>{i + 1}</span>{s.title}</h2>
              {s.body}
            </section>
          ))}
        </article>
      </div>
      <footer className="lg-foot">
        <span>© {new Date().getFullYear()} NextBiz Studio · NextBiz One</span>
        <nav><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/data-deletion">Data deletion</Link><a href="mailto:privacy@nextbizstudio.com">Contact</a></nav>
      </footer>
    </div>
  );
}
