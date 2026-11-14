import { Icon } from "./Icon";
import { CHANNEL_META, FEATURES, type Channels, type FeatureKey } from "@/lib/channels";

/**
 * Guided "not connected yet" state — shown in place of a page whose channel isn't connected.
 * Says what the page does, which channel unlocks it, and links straight to the right Connections card.
 * Ads can also be explored with demo data (sets a cookie; the page then shows mock-badged campaigns).
 */
export function ChannelGate({ feature, channels }: { feature: FeatureKey; channels: Channels }) {
  const f = FEATURES[feature];
  const anyConnected = channels.whatsapp || channels.instagram || channels.ads;
  return (
    <div className="gate" data-testid="channel-gate" data-feature={feature}>
      <section className="card gate-card">
        <div className="gate-copy">
          <div className="gate-chips">
            {f.needs.map((c) => (
              <span key={c} className={`gchip ${CHANNEL_META[c].tone}`}><Icon name={CHANNEL_META[c].icon} size="sm" />{CHANNEL_META[c].label}<i>{channels[c] ? "connected" : "not connected"}</i></span>
            ))}
          </div>
          <h1 className="gate-h">{f.title}</h1>
          <p className="gate-p">{f.blurb}</p>
          <ul className="gate-perks">
            {f.perks.map(([icon, line]) => <li key={line}><span className="icon-tile sm"><Icon name={icon} /></span>{line}</li>)}
          </ul>
          <div className="gate-acts">
            {f.needs.map((c, i) => (
              <a key={c} className={`btn ${i === 0 ? "btn-primary" : "btn-soft"}`} href={`/connections#${CHANNEL_META[c].anchor}`} data-testid={`gate-connect-${c}`}>
                <Icon name={CHANNEL_META[c].icon} />Connect {CHANNEL_META[c].label}
              </a>
            ))}
            {feature === "ads" && <a className="btn btn-ghost" href="/api/ads/demo?on=1&next=/ads" data-testid="gate-demo"><Icon name="play-circle" />Explore with demo data</a>}
          </div>
          <p className="gate-foot"><Icon name="info" size="sm" />{anyConnected
            ? "Each channel connects on its own — add this one whenever you're ready."
            : "Takes a few minutes with your Facebook or Instagram login. No Meta Business portfolio yet? The WhatsApp connect window creates one for you."}</p>
        </div>
        <div className={`gate-art art-${f.preview}`} aria-hidden="true">
          <div className="ga-win">
            <div className="ga-top"><span /><span /><span /></div>
            {f.preview === "inbox" && <div className="ga-inbox">{[0, 1, 2, 3].map((i) => <div key={i} className="ga-row"><b className={`ga-av c${i + 1}`} /><span><i style={{ width: `${70 - i * 9}%` }} /><i style={{ width: `${45 + i * 8}%` }} /></span></div>)}<div className="ga-bubbles"><em className="in" /><em className="out" /><em className="in s" /></div></div>}
            {f.preview === "list" && <div className="ga-list">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="ga-row"><b className={`ga-av c${(i % 4) + 1}`} /><span><i style={{ width: `${62 - i * 6}%` }} /></span><u className={i % 2 ? "ok" : ""} /></div>)}</div>}
            {f.preview === "chart" && <div className="ga-chart">{[38, 62, 48, 80, 56, 92, 70].map((h, i) => <span key={i} style={{ height: `${h}%` }} />)}</div>}
            {f.preview === "rules" && <div className="ga-rules">{["hi, hello", "price, cost", "timing, open"].map((k, i) => <div key={k} className="ga-rule"><span className="kw">{k}</span><Icon name="arrow-right" size="xs" /><span className="rp"><i style={{ width: `${80 - i * 12}%` }} /></span><u className="ok" /></div>)}</div>}
          </div>
          <span className="ga-blob b1" /><span className="ga-blob b2" />
        </div>
      </section>
    </div>
  );
}
