"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";
import type { ShellData } from "@/lib/shell";

/**
 * Shell v5 — design v2 (~/workspaces/mira/prototypes/nextbiz-one-v2/shared/shell.js).
 * rail (64) | module panel (232, collapsible) | main (topbar + content).
 * One gutter everywhere. ≥1280 panel docked · 768–1279 panel flyout · <768 bottom tab bar + "More" sheet.
 */
export type ShellActive =
  | "dashboard" | "inbox" | "contacts" | "templates" | "broadcasts" | "automation" | "settings"
  | "ads" | "ads-new" | "ads-perf";

type Item = { key: ShellActive; label: string; icon: string; href: string };
const CHAT: Item[] = [
  { key: "inbox", label: "Inbox", icon: "tray", href: "/inbox" },
  { key: "contacts", label: "Contacts", icon: "users", href: "/contacts" },
  { key: "templates", label: "Templates", icon: "notebook", href: "/templates" },
  { key: "broadcasts", label: "Broadcasts", icon: "megaphone", href: "/broadcasts" },
  { key: "automation", label: "Automation", icon: "lightning", href: "/automation" },
];
const ADS: Item[] = [
  { key: "ads", label: "Campaigns", icon: "target", href: "/ads" },
  { key: "ads-new", label: "Create campaign", icon: "plus", href: "/ads/new" },
  { key: "ads-perf", label: "Performance", icon: "chart-line-up", href: "/ads/performance" },
];
const LOGO = "/logo.png";

export function ShellClient({
  active, title, actions, fixed = false, data, children,
}: {
  active: ShellActive;
  title: string;
  actions?: React.ReactNode;
  /** content manages its own scroll (inbox, master-detail pages) */
  fixed?: boolean;
  data: ShellData;
  children: React.ReactNode;
}) {
  const mod: "chat" | "ads" | null = CHAT.some((i) => i.key === active) ? "chat" : ADS.some((i) => i.key === active) ? "ads" : null;
  const leaf = mod === null;
  const [panelOff, setPanelOff] = useState(false);
  const [flyout, setFlyout] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [wide, setWide] = useState(true);
  const [me, setMe] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    try { setPanelOff(localStorage.getItem("nbo.panelOff") === "1"); } catch { /* storage blocked */ }
    const mq = window.matchMedia("(min-width: 1280px)");
    const on = () => setWide(mq.matches);
    on(); mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  useEffect(() => { setFlyout(false); setSheet(false); }, [pathname]);

  const collapse = (off: boolean) => {
    setPanelOff(off);
    try { localStorage.setItem("nbo.panelOff", off ? "1" : "0"); } catch { /* storage blocked */ }
  };
  const openPanel = () => {
    if (window.innerWidth >= 1280) collapse(false);
    else if (window.innerWidth >= 768) setFlyout((v) => !v);
    else setSheet(true);
  };
  const closeAll = () => { setFlyout(false); setSheet(false); setMe(false); };
  const signOut = async () => { await fetch("/api/auth/logout", { method: "POST" }).catch(() => {}); window.location.href = "/login"; };
  const showBurger = !leaf && (!wide || panelOff);
  const items = mod === "ads" ? ADS : CHAT;
  const modName = mod === "ads" ? "NextBiz Ads" : "NextBiz Chat";
  const waNumber = data.wa?.displayName?.match(/\(([^)]+)\)/)?.[1] ?? null;
  const inMore = ["templates", "automation", "settings", "ads", "ads-new", "ads-perf"].includes(active);

  return (
    <div
      className={`app${leaf ? " leaf" : ""}${panelOff ? " panel-off" : ""}${flyout ? " panel-open" : ""}`}
      data-module={mod ?? "ws"}
      data-testid="app-shell"
    >
      <nav className="rail" aria-label="Main" data-testid="nav">
        <a className="logo" href="/"><img src={LOGO} alt="NextBiz One" /></a>
        <a className={`ri${active === "dashboard" ? " on" : ""}`} href="/" aria-label="Dashboard"><Icon name="squares-four" /><span className="tip">Dashboard</span></a>
        <a className={`ri m-chat${mod === "chat" ? " on" : ""}`} href="/inbox" aria-label="NextBiz Chat" data-testid="rail-chat">
          <Icon name="chat-circle-dots" />{data.unread > 0 && <span className="badge red">{data.unread > 99 ? "99+" : data.unread}</span>}<span className="tip">NextBiz Chat</span>
        </a>
        <a className={`ri m-ads${mod === "ads" ? " on" : ""}`} href="/ads" aria-label="NextBiz Ads" data-testid="rail-ads"><Icon name="megaphone" /><span className="dot" /><span className="tip">NextBiz Ads</span></a>
        <a className="ri m-social" href="/settings#channels" aria-label="NextBiz Social" data-testid="rail-social"><Icon name="images" /><span className="tip">NextBiz Social · Instagram</span></a>
        <span className="sp" />
        <a className={`ri${active === "settings" ? " on" : ""}`} href="/settings" aria-label="Settings"><Icon name="gear" /><span className="tip">Settings</span></a>
        <button className="av sm c2 me" title={data.userName} onClick={() => setMe((v) => !v)} aria-label="Account menu" data-testid="account-btn">{data.initials}</button>
        {me && (
          <div className="menu" style={{ left: "calc(var(--rail-w) + var(--g) * 2)", bottom: "var(--g)" }} role="menu">
            <div style={{ padding: "8px 10px 6px" }}><b className="small">{data.userName}</b><div className="xs faint">{data.user?.email}</div></div>
            <div className="sep" />
            <a href="/settings" role="menuitem"><Icon name="gear" />Settings</a>
            {data.user?.isOperator && <a href="/operator" role="menuitem"><Icon name="shield-check" />Operator console</a>}
            <button className="danger" onClick={signOut} role="menuitem"><Icon name="sign-out" />Sign out</button>
          </div>
        )}
      </nav>

      {!leaf && (
        <aside className="panel" aria-label={modName} data-testid="nav-panel">
          <div className="ws">
            <span className="av c2">{data.workspaceName.slice(0, 2).toUpperCase()}</span>
            <span className="grow"><b className="trunc" style={{ display: "block" }}>{data.workspaceName}</b><small>Business workspace</small></span>
            <Icon name="caret-down" size="sm" />
          </div>
          <div className="pmod">
            <span className="sw" /><span className="eyebrow">{modName}</span>
            {mod === "ads" && <span className="demo">Demo</span>}
            <button className="collapse" onClick={() => collapse(true)} title="Collapse panel" aria-label="Collapse panel"><Icon name="sidebar-simple" size="sm" /></button>
          </div>
          <nav className="pnav">
            {items.map((i) => (
              <a key={i.key} className={`pi${i.key === active ? " on" : ""}`} href={i.href} data-testid={`nav-${i.key}`}>
                <Icon name={i.icon} /><span>{i.label}</span>
                {i.key === "inbox" && data.unread > 0 && <span className="badge">{data.unread}</span>}
              </a>
            ))}
          </nav>
          <div className="pfoot">
            {mod === "chat" ? (
              <div className="numcard" data-testid="wa-numcard">
                <div className="top"><span className="wa"><Icon name="whatsapp-logo" /></span><span className="grow"><b className="trunc" style={{ display: "block" }}>{data.workspaceName}</b><small>{waNumber ? `+${waNumber}`.replace(/^\+\+/, "+") : "WhatsApp Business"}</small></span></div>
                <div className="stats">
                  <div><span>Status</span><strong className={data.wa?.connected ? "good" : ""}>{data.wa?.connected ? "Connected" : "Not connected"}</strong></div>
                  <div><span>Unread</span><strong>{data.unread}</strong></div>
                </div>
              </div>
            ) : (
              <div className="note warn" style={{ fontSize: "10.5px" }}><Icon name="info" size="sm" /><span><b>Demo data.</b> Connect an ad account to see live campaigns.</span></div>
            )}
          </div>
        </aside>
      )}

      <div className="main">
        <header className="topbar">
          {showBurger && <button className="btn btn-ghost btn-icon burger show" onClick={openPanel} aria-label="Open module menu" data-testid="burger"><Icon name="sidebar-simple" /></button>}
          <a className="mlogo" href="/"><img src={LOGO} alt="" /></a>
          <div className="ptitle">{!leaf && <span className="crumb">{modName}<Icon name="caret-right" /></span>}<h1>{title}</h1></div>
          <label className="search gsearch"><Icon name="magnifying-glass" size="sm" /><input placeholder="Search conversations, contacts, templates…" aria-label="Search" /><span className="kbd">⌘K</span></label>
          <div className="acts">
            {actions && <span className="page-acts row">{actions}</span>}
            <span className="vsep" />
            <span className="conn" title={data.wa?.connected ? "WhatsApp connected" : "WhatsApp not connected"} style={data.wa?.connected ? undefined : { background: "var(--banana-tint)", color: "var(--banana-deep)", borderColor: "var(--banana-line)" }}>
              <span className="pulse" style={data.wa?.connected ? undefined : { background: "var(--banana)" }} /><span className="txt">{data.wa?.connected ? "Connected" : "Not connected"}</span>
            </span>
            <a className="btn btn-ghost btn-icon bell" href="/inbox" aria-label="Notifications">
              <Icon name="bell" />{data.unread > 0 && <span className="ndot" />}
            </a>
            <span className="av sm c2 me" title={data.userName}>{data.initials}</span>
          </div>
        </header>
        <main className={`content${fixed ? " fixed" : ""}`}>{children}</main>
      </div>

      <nav className="tabbar" aria-label="Main">
        <a className={active === "dashboard" ? "on" : ""} href="/"><Icon name="house" /><span>Home</span></a>
        <a className={active === "inbox" ? "on" : ""} href="/inbox"><Icon name="tray" /><span>Inbox</span>{data.unread > 0 && <span className="badge red">{data.unread}</span>}</a>
        <a className={active === "contacts" ? "on" : ""} href="/contacts"><Icon name="users" /><span>Contacts</span></a>
        <a className={active === "broadcasts" ? "on" : ""} href="/broadcasts"><Icon name="megaphone" /><span>Broadcasts</span></a>
        <button className={inMore ? "on" : ""} onClick={() => setSheet(true)}><Icon name="list" /><span>More</span></button>
      </nav>
      <div className={`scrim${flyout || sheet ? " open" : ""}`} onClick={closeAll} />
      {me && <div style={{ position: "fixed", inset: 0, zIndex: 55 }} onClick={() => setMe(false)} />}
      <div className={`sheet${sheet ? " open" : ""}`} role="dialog" aria-label="More">
        <div className="grab" />
        <div className="sgrp eyebrow">NextBiz Chat</div>
        {CHAT.map((i) => <a key={i.key} className={`pi${i.key === active ? " on" : ""}`} href={i.href}><Icon name={i.icon} /><span>{i.label}</span></a>)}
        <div className="sgrp eyebrow">NextBiz Ads <span className="demo" style={{ marginLeft: 6 }}>Demo</span></div>
        {ADS.map((i) => <a key={i.key} className={`pi${i.key === active ? " on" : ""}`} href={i.href}><Icon name={i.icon} /><span>{i.label}</span></a>)}
        <div className="sgrp eyebrow">Workspace</div>
        <a className={`pi${active === "settings" ? " on" : ""}`} href="/settings"><Icon name="gear" /><span>Settings</span></a>
        <button className="pi" style={{ width: "100%" }} onClick={signOut}><Icon name="sign-out" /><span>Sign out</span></button>
      </div>
    </div>
  );
}
