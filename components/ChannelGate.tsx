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
          {f.needs[0] === "ads"
            ? <img className="ga-img wide" src="/art/ads-hero.webp" alt="" width={1100} height={733} />
            : <img className="ga-img" src={`/art/${f.needs.length > 1 ? "connect" : f.needs[0] === "instagram" ? "instagram" : "whatsapp"}.webp`} alt="" width={280} height={280} />}
          <span className="ga-blob b1" /><span className="ga-blob b2" />
        </div>
      </section>
    </div>
  );
}
