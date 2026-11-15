import { AppShell } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { CATS, GUIDES, type CatKey } from "@/lib/learn";

export const dynamic = "force-dynamic";
export const metadata = { title: "Learning center · NextBiz One" };

/** Learning center — short, practical guides. Content lives in lib/learn.ts. */
export default function LearnPage() {
  const featured = GUIDES.filter((g) => g.featured);
  const lead = featured[0];
  const cats = (Object.keys(CATS) as CatKey[]).filter((c) => GUIDES.some((g) => g.cat === c));
  return (
    <AppShell active="learn" title="Learning center">
      <div className="pg-learn">
        <div className="page" data-testid="learn">
          <section className="card lhero">
            <div className="lh-t">
              <span className="eyebrow">Learning center</span>
              <h1>Get more from WhatsApp, Instagram and your ads.</h1>
              <p>Short, practical guides — most take under 5 minutes. Start with the one below: it saves most businesses a lot of frustration.</p>
            </div>
            <a className="lh-lead" href={`/learn/${lead.slug}`} data-testid="learn-lead">
              <span className="icon-tile lg grape"><Icon name={lead.icon} /></span>
              <span className="grow"><span className="eyebrow" style={{ color: "var(--grape-deep)" }}>Start here · {lead.minutes} min</span><b>{lead.title}</b><small>{lead.summary}</small></span>
              <span className="lc-go">Read<Icon name="arrow-right" size="xs" /></span>
            </a>
          </section>

          <section className="lfeat">
            {featured.slice(1).map((g) => (
              <a key={g.slug} className="card lc-card lc-big" href={`/learn/${g.slug}`}>
                <span className={`icon-tile lg ${CATS[g.cat].tone}`}><Icon name={g.icon} /></span>
                <b>{g.title}</b><small>{g.summary}</small>
                <span className="lc-meta">{CATS[g.cat].label} · {g.minutes} min read<Icon name="arrow-right" size="xs" /></span>
              </a>
            ))}
          </section>

          {cats.map((c) => (
            <section key={c} className="lcat" aria-label={CATS[c].label}>
              <div className="lcat-h"><span className={`icon-tile sm ${CATS[c].tone}`}><Icon name={CATS[c].icon} /></span><span className="h3">{CATS[c].label}</span></div>
              <div className="lgrid">
                {GUIDES.filter((g) => g.cat === c).map((g) => (
                  <a key={g.slug} className="card lc-card" href={`/learn/${g.slug}`} data-testid={`guide-${g.slug}`}>
                    <b>{g.title}</b><small>{g.summary}</small>
                    <span className="lc-meta">{g.minutes} min read<Icon name="arrow-right" size="xs" /></span>
                  </a>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
