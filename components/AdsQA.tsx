"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Header quick-action for ads pages (P2) — ported from the ads wireframes'
 * qa-wrap: split button "New Campaign" (ads accent) + 3-tile flyout menu.
 * Click pins the menu, hover previews, outside click closes (wireframe JS).
 */
export function AdsQA() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  return (
    <div className={`qa-wrap${open ? " open" : ""}`} ref={ref} data-testid="qa-wrap">
      <button
        className="qa-btn ads"
        data-testid="qa-btn"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/plus-circle-bold.svg" alt="" />
        <span className="lbl">New Campaign</span>
        <span className="qa-sep" />
        <span className="qa-chev"><img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/caret-down-bold.svg" alt="" /></span>
      </button>
      <div className="qa-menu" data-testid="qa-menu">
        <a href="/ads/new" style={{ display: "contents" }} onClick={() => setOpen(false)}>
          <div className="qa-tile"><img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/megaphone-bold.svg" alt="" style={{ color: "var(--ads-deep)", background: "var(--ads-tint)" }} /><b>New Campaign</b><span className="qa-k">7-step guided flow</span></div>
        </a>
        <a href="/ads/performance" style={{ display: "contents" }} onClick={() => setOpen(false)}>
          <div className="qa-tile"><img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/chart-line-up-bold.svg" alt="" style={{ color: "var(--ads-deep)", background: "var(--ads-tint)" }} /><b>Performance</b><span className="qa-k">Spend and results</span></div>
        </a>
        <a href="/ads" style={{ display: "contents" }} onClick={() => setOpen(false)}>
          <div className="qa-tile"><img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/copy-bold.svg" alt="" style={{ color: "var(--ink-2)", background: "var(--surface-sunken)" }} /><b>All campaigns</b><span className="qa-k">Browse the list</span></div>
        </a>
      </div>
    </div>
  );
}
