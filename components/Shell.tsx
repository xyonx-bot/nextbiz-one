"use client";

import { useEffect, useState } from "react";

/**
 * Shell v4.3 (locked app-wide, approval-nbo-sidebar) — ported 1:1 from
 * Mira's dashboard wireframe: 64px cream rail (floating icon card,
 * expandable) + 248px white panel side-by-side; compact single-row
 * header card; NO page-title row (pagehead lives in the content zone).
 * Leaf pages (Dashboard, Settings) hide the panel; module pages open it.
 *
 * State wiring mirrors the wireframe's body-class toggles, scoped to the
 * shell wrapper: nav-open (mobile drawer), panel-flyout (tablet panel
 * flyout, opened by the parent chip at 640–1179), leaf-active.
 */
export function Shell({
  active = "dashboard",
  userInitials,
  userName,
  unread = 0,
  qa,
  children,
}: {
  active?: "dashboard" | "inbox" | "contacts" | "templates" | "broadcasts" | "automation" | "settings" | "ads" | "ads-new" | "ads-perf";
  userInitials: string;
  userName: string;
  unread?: number;
  /** header quick-action slot (ads pages pass <AdsQA />) */
  qa?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [railExpanded, setRailExpanded] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [panelFlyout, setPanelFlyout] = useState(false);
  const [adsOpen, setAdsOpen] = useState(true);
  const [socialOpen, setSocialOpen] = useState(false);
  const [adsCounts, setAdsCounts] = useState<{ all: number; drafts: number; review: number } | null>(null);
  // v4.3: Dashboard + Settings are LEAF pages (panel hidden); Chat module
  // pages (Inbox, Contacts, Templates, Broadcasts, Automation) show the panel.
  const leafActive = active === "dashboard" || active === "settings";
  const chatActive =
    active === "inbox" || active === "contacts" || active === "templates" ||
    active === "broadcasts" || active === "automation";
  const adsActive = active === "ads" || active === "ads-new" || active === "ads-perf";

  // P2 unlock: ads panel chips carry live counts from the mock API
  useEffect(() => {
    if (!adsActive) return;
    fetch("/api/ads/campaigns", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.campaigns) return;
        const cs = d.campaigns as { status: string }[];
        setAdsCounts({
          all: cs.length,
          drafts: cs.filter((c) => c.status === "DRAFT").length,
          review: cs.filter((c) => c.status === "IN_REVIEW").length,
        });
      })
      .catch(() => {});
  }, [adsActive]);

  // Wireframe behavior: clicking a parent module chip at tablet width opens
  // the panel flyout (scrim behind); at desktop it navigates straight to
  // the module's first child. Leaf chips always navigate.
  function onParentChip(e: React.MouseEvent) {
    const w = window.innerWidth;
    if (w >= 640 && w < 1180) {
      e.preventDefault();
      setPanelFlyout((v) => !v);
      setNavOpen(false);
    }
  }

  // Social/Instagram module: no P3 route yet — open the panel with the
  // social tree (connect CTA + P3-pending note) instead of a dead button.
  function onSocialChip(e: React.MouseEvent) {
    const w = window.innerWidth;
    setSocialOpen(true);
    if (w >= 640 && w < 1180) {
      e.preventDefault();
      setPanelFlyout(true);
      setNavOpen(false);
    } else if (w < 640) {
      setNavOpen(true); // drawer + scrim (mobile)
      setPanelFlyout(false);
    }
    // desktop ≥1180: panel is always visible; tree toggles via socialOpen
  }

  const closeNav = () => {
    setNavOpen(false);
    setPanelFlyout(false);
  };

  return (
    <>
    <div className={`scrim${navOpen || panelFlyout ? " open" : ""}`} onClick={closeNav} />
    <div className={`shell ${railExpanded ? "rail-expanded" : ""}${leafActive ? " leaf-active" : ""}${navOpen ? " nav-open" : ""}${panelFlyout ? " panel-flyout" : ""}`}>
      {/* ═══ dual-pane nav — side-by-side floating ═══ */}
      <div className="navwrap" data-testid="nav">
        {/* RAIL — floating icon card */}
        <div className="rail" id="rail">
          <div className="brand">
            <div className="logo">
              <img src="https://cdn.joyverse.fun/nextbiz-one-transparent.png" alt="NextBiz One" />
            </div>
            <div className="wordmark">NextBiz One<small>Workspace</small></div>
          </div>
          <div className={`ri mod-ws leaf${active === "dashboard" ? " on" : ""}`}><a href="/" style={{ display: "contents" }}><img src="https://cdn.joyverse.fun/mira-assets/phosphor/regular/squares-four.svg" alt="" /><span className="lbl">Dashboard</span></a><span className="tip">Dashboard</span></div>
          <div className={`ri mod-chat parent${chatActive ? " on" : ""}`} onClick={onParentChip}>
            <a href="/inbox" style={{ display: "contents" }}>
              <span className="mdoti" style={{ background: "var(--chat)" }} />
              <img src="https://cdn.joyverse.fun/mira-assets/phosphor/regular/chat-circle-dots.svg" alt="" />
              <span className="lbl">NextBiz Chat</span>
              {unread > 0 && <span className="cnt">{unread}</span>}
            </a>
            <span className="tip">NextBiz Chat</span>
          </div>
          <div className={`ri mod-ads parent${adsActive ? " on" : ""}`} onClick={onParentChip}>
            <a href="/ads" style={{ display: "contents" }}>
              <span className="mdoti" style={{ background: "var(--ads)" }} />
              <img src="https://cdn.joyverse.fun/mira-assets/phosphor/regular/megaphone.svg" alt="" />
              <span className="lbl">NextBiz Ads</span>
            </a>
            <span className="tip">NextBiz Ads</span>
          </div>
          <div className={`ri mod-social parent${socialOpen ? " on" : ""}`} onClick={onSocialChip} data-testid="rail-social">
            <span className="mdoti" style={{ background: "var(--social)" }} />
            <img src="https://cdn.joyverse.fun/mira-assets/phosphor/regular/images.svg" alt="" />
            <span className="lbl">NextBiz Social</span><span className="tip">NextBiz Social (Instagram)</span>
          </div>
          <div className="sp" />
          <div className={`ri mod-ws leaf${active === "settings" ? " on" : ""}`}><a href="/settings" style={{ display: "contents" }}><img src="https://cdn.joyverse.fun/mira-assets/phosphor/regular/gear.svg" alt="" /><span className="lbl">Settings</span></a><span className="tip">Settings</span></div>
          <div className="exp" onClick={() => setRailExpanded(!railExpanded)} title="Expand / collapse" data-testid="rail-expand">
            <img src="https://cdn.joyverse.fun/mira-assets/phosphor/regular/caret-right.svg" alt="" />
          </div>
          <div className="usr">
            <div className="a">{userInitials}</div>
            <div className="t"><b>{userName}</b><span>Admin</span></div>
          </div>
        </div>

        {/* PANEL — module children (hidden on leaf pages) */}
        {!leafActive && (
          <div className="npanel" id="npanel" data-testid="nav-panel">
            <div className="ws">
              <div className="a">AS</div>
              <div className="t"><b>Acme Studio</b><span>Business workspace</span></div>
              <img src="https://cdn.joyverse.fun/mira-assets/phosphor/regular/caret-down.svg" alt="" />
            </div>
            <div className="trees">
              <div className={`tree${adsActive || socialOpen ? " hidden" : ""}`} data-tree="chat">
                <div className="sec"><span className="mdot" style={{ background: "var(--chat)" }} />NextBiz Chat</div>
                <div className="sub-chips">
                  <a href="/inbox" style={{ display: "contents" }}><div className={`schip${active === "inbox" ? " on" : ""}`}><img src="https://cdn.joyverse.fun/mira-assets/phosphor/regular/tray.svg" alt="" /><span className="lbl">Inbox</span>{unread > 0 && <span className="cnt">{unread}</span>}</div></a>
                  <a href="/contacts" style={{ display: "contents" }}><div className={`schip${active === "contacts" ? " on" : ""}`}><img src="https://cdn.joyverse.fun/mira-assets/phosphor/regular/users.svg" alt="" /><span className="lbl">Contacts</span></div></a>
                  <a href="/templates" style={{ display: "contents" }}><div className={`schip${active === "templates" ? " on" : ""}`}><img src="https://cdn.joyverse.fun/mira-assets/phosphor/regular/notebook.svg" alt="" /><span className="lbl">Templates</span></div></a>
                  <a href="/broadcasts" style={{ display: "contents" }}><div className={`schip${active === "broadcasts" ? " on" : ""}`}><img src="https://cdn.joyverse.fun/mira-assets/phosphor/regular/megaphone.svg" alt="" /><span className="lbl">Broadcasts</span></div></a>
                  <a href="/automation" style={{ display: "contents" }}><div className={`schip${active === "automation" ? " on" : ""}`}><img src="https://cdn.joyverse.fun/mira-assets/phosphor/regular/lightning.svg" alt="" /><span className="lbl">Automation</span></div></a>
                </div>
              </div>
              <div className={`tree${!adsActive || socialOpen ? " hidden" : ""}`} data-tree="ads">
                <div className="sec"><span className="mdot" style={{ background: "var(--ads)" }} />NextBiz Ads</div>
                <div className="sub-chips" style={{ paddingBottom: 2 }}>
                  <a href="/ads/performance" style={{ display: "contents" }}><div className={`schip${active === "ads-perf" ? " on" : ""}`}><img src="https://cdn.joyverse.fun/mira-assets/phosphor/regular/chart-line-up.svg" alt="" /><span className="lbl">Performance</span></div></a>
                </div>
                <div className={`modrow${adsOpen ? " open" : ""}`} onClick={() => setAdsOpen((v) => !v)} data-testid="ads-campaigns-modrow"><span>Campaigns</span><img className="chev" src="https://cdn.joyverse.fun/mira-assets/phosphor/regular/caret-right.svg" alt="" /></div>
                {adsOpen && (
                <div className="sub-chips">
                  <a href="/ads" style={{ display: "contents" }}><div className={`schip${active === "ads" ? " on" : ""}`}><img src="https://cdn.joyverse.fun/mira-assets/phosphor/regular/list.svg" alt="" /><span className="lbl">All campaigns</span>{adsCounts && <span className="cnt">{adsCounts.all}</span>}</div></a>
                  <a href="/ads?status=DRAFT" style={{ display: "contents" }}><div className={`schip${active === "ads" ? "" : ""}`}><img src="https://cdn.joyverse.fun/mira-assets/phosphor/regular/files.svg" alt="" /><span className="lbl">Drafts</span>{adsCounts && <span className="cnt">{adsCounts.drafts}</span>}</div></a>
                  <a href="/ads?status=IN_REVIEW" style={{ display: "contents" }}><div className="schip"><img src="https://cdn.joyverse.fun/mira-assets/phosphor/regular/warning-circle.svg" alt="" /><span className="lbl">Needs review</span>{adsCounts && <span className="cnt">{adsCounts.review}</span>}</div></a>
                </div>
                )}
              </div>
              <div className={`tree${socialOpen ? "" : " hidden"}`} data-tree="social" data-testid="social-tree">
                <div className="sec"><span className="mdot" style={{ background: "var(--social)" }} />NextBiz Social</div>
                <div className="sub-chips">
                  <div className="schip" style={{ opacity: .55, cursor: "default" }} data-testid="ig-p3-pending">
                    <img src="https://cdn.joyverse.fun/mira-assets/phosphor/regular/instagram-logo.svg" alt="" />
                    <span className="lbl">Instagram DMs · P3 UI pending</span>
                  </div>
                  <a href="/settings" style={{ display: "contents" }} onClick={closeNav}><div className="schip" data-testid="ig-connect-link">
                    <img src="https://cdn.joyverse.fun/mira-assets/phosphor/regular/plugs-connected.svg" alt="" />
                    <span className="lbl">Connect Instagram</span>
                  </div></a>
                </div>
                <div className="treenote">Webhook + business-login backend live on beta (mock-badged until app review). P3.1 inbox/automation UI is Mira's queued design package.</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MAIN */}
      <div className="main">
        <div className="header-card">
          <div className="top1">
            <button className="burger" onClick={() => setNavOpen(true)} aria-label="Menu" data-testid="burger">
              <img src="https://cdn.joyverse.fun/mira-assets/phosphor/regular/list.svg" alt="" />
            </button>
            <div className="search">
              <img src="https://cdn.joyverse.fun/mira-assets/phosphor/regular/magnifying-glass.svg" alt="" />
              <span>Search…</span>
              <span className="kbd">⌘K</span>
            </div>
            <div className="spacer" />
            {qa}
            <div className="status-pill"><span className="pulse" />Connected</div>
            <div className="iconbtn">
              <img src="https://cdn.joyverse.fun/mira-assets/phosphor/regular/bell.svg" alt="" />
              <span className="dot" />
            </div>
            <div className="av av-36" style={{ background: "var(--chat-deep)" }}>{userInitials}</div>
          </div>
        </div>
        {children}
      </div>
    </div>
    </>
  );
}
