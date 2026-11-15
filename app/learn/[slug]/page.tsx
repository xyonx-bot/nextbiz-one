import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { Blocks } from "@/components/Learn";
import { CATS, GUIDES, guide } from "@/lib/learn";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const g = guide((await params).slug);
  return { title: g ? `${g.title} · NextBiz One` : "Learning center · NextBiz One" };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const g = guide((await params).slug);
  if (!g) notFound();
  const i = GUIDES.indexOf(g);
  const more = [...GUIDES.slice(i + 1), ...GUIDES.slice(0, i)].filter((x) => x.cat === g.cat || x.featured).slice(0, 3);
  return (
    <AppShell active="learn" title="Learning center" actions={<a className="btn btn-ghost" href="/learn"><Icon name="arrow-left" /><span className="lbl">All guides</span></a>}>
      <div className="pg-learn">
        <div className="page" data-testid="guide">
          <div className="lart">
            <article className="card lbody">
              <a className="lc-crumb" href="/learn"><Icon name="arrow-left" size="xs" />Learning center</a>
              <div className="lc-head">
                <span className={`icon-tile lg ${CATS[g.cat].tone}`}><Icon name={g.icon} /></span>
                <span className="eyebrow">{CATS[g.cat].label} · {g.minutes} min read</span>
              </div>
              <h1>{g.title}</h1>
              <p className="lc-lede">{g.summary}</p>
              <Blocks blocks={g.blocks} />
              {g.try && (
                <div className="ltry"><b>Try it now</b>
                  <div>{g.try.map((t, k) => <a key={t.href} className={`btn ${k ? "btn-soft" : "btn-primary"} btn-sm`} href={t.href}>{t.label}<Icon name="arrow-right" size="xs" /></a>)}</div>
                </div>
              )}
            </article>
            <aside className="lside">
              <div className="card lmore">
                <span className="eyebrow">Read next</span>
                {more.map((m) => (
                  <a key={m.slug} href={`/learn/${m.slug}`}><span className={`icon-tile sm ${CATS[m.cat].tone}`}><Icon name={m.icon} /></span><span className="grow"><b>{m.title}</b><small>{m.minutes} min</small></span></a>
                ))}
                <a className="btn btn-soft btn-sm" href="/learn" style={{ justifyContent: "center" }}>All guides</a>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
