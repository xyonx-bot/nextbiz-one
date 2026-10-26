"use client";

import { useState } from "react";

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
  children,
}: {
  active?: "dashboard" | "inbox" | "contacts" | "templates" | "broadcasts" | "automation" | "settings";
  userInitials: string;
  userName: string;
  unread?: number;
  children: React.ReactNode;
}) {
  const [railExpanded, setRailExpanded] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [panelFlyout, setPanelFlyout] = useState(false);
  // v4.3: Dashboard + Settings are LEAF pages (panel hidden); Chat module
  // pages (Inbox, Contacts, Templates, Broadcasts, Automation) show the panel.
  const leafActive = active === "dashboard" || active === "settings";
  const chatActive =
    active === "inbox" || active === "contacts" || active === "templates" ||
    active === "broadcasts" || active === "automation";

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
          <div className="ri mod-ads parent"><span className="mdoti" style={{ background: "var(--ads)" }} /><img src="https://cdn.joyverse.fun/mira-assets/phosphor/regular/megaphone.svg" alt="" /><span className="lbl">NextBiz Ads</span><span className="tip">NextBiz Ads</span></div>
          <div className="ri mod-social parent"><span className="mdoti" style={{ background: "var(--social)" }} /><img src="https://cdn.joyverse.fun/mira-assets/phosphor/regular/images.svg" alt="" /><span className="lbl">NextBiz Social</span><span className="tip">NextBiz Social</span></div>
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
              <div className="tree" data-tree="chat">
                <div className="sec"><span className="mdot" style={{ background: "var(--chat)" }} />NextBiz Chat</div>
                <div className="sub-chips">
                  <a href="/inbox" style={{ display: "contents" }}><div className={`schip${active === "inbox" ? " on" : ""}`}><img src="https://cdn.joyverse.fun/mira-assets/phosphor/regular/tray.svg" alt="" /><span className="lbl">Inbox</span>{unread > 0 && <span className="cnt">{unread}</span>}</div></a>
                  <a href="/contacts" style={{ display: "contents" }}><div className={`schip${active === "contacts" ? " on" : ""}`}><img src="https://cdn.joyverse.fun/mira-assets/phosphor/regular/users.svg" alt="" /><span className="lbl">Contacts</span></div></a>
                  <a href="/templates" style={{ display: "contents" }}><div className={`schip${active === "templates" ? " on" : ""}`}><img src="https://cdn.joyverse.fun/mira-assets/phosphor/regular/notebook.svg" alt="" /><span className="lbl">Templates</span></div></a>
                  <a href="/broadcasts" style={{ display: "contents" }}><div className={`schip${active === "broadcasts" ? " on" : ""}`}><img src="https://cdn.joyverse.fun/mira-assets/phosphor/regular/megaphone.svg" alt="" /><span className="lbl">Broadcasts</span></div></a>
                  <a href="/automation" style={{ display: "contents" }}><div className={`schip${active === "automation" ? " on" : ""}`}><img src="https://cdn.joyverse.fun/mira-assets/phosphor/regular/lightning.svg" alt="" /><span className="lbl">Automation</span></div></a>
                </div>
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
