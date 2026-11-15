"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";

/** Copy a share link (wa.me / Instagram profile). Falls back to selecting the text when the clipboard is blocked. */
export function CopyLink({ url, label, icon, testId }: { url: string; label: string; icon: string; testId?: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="share" data-testid={testId}>
      <span className="icon-tile sm"><Icon name={icon} /></span>
      <span className="grow"><b>{label}</b><input className="mono" readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label={label} /></span>
      <button type="button" className="btn btn-soft btn-sm" onClick={() => { navigator.clipboard?.writeText(url).then(() => { setDone(true); setTimeout(() => setDone(false), 1800); }).catch(() => {}); }}>
        <Icon name={done ? "check" : "copy"} />{done ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/** Opens NextBiz AI with a question already asked. */
export function AskAi({ prompt, label, className = "btn btn-soft ai-btn", testId }: { prompt: string; label: string; className?: string; testId?: string }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new CustomEvent("nbo:ai", { detail: { prompt } }))} data-testid={testId}>
      <Icon name="sparkle" />{label}
    </button>
  );
}

/**
 * Numbers count up once when the dashboard opens (KPIs marked data-count). Reads the server-rendered
 * text ("37", "4.4 h", "₹1,200"), animates the number inside it and restores the exact text at the end.
 */
export function CountUp() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-count]"));
    const raf: number[] = [];
    for (const el of els) {
      const final = el.textContent ?? ""; const m = final.match(/(\d[\d,]*\.?\d*)/);
      if (!m) continue;
      const target = parseFloat(m[1].replace(/,/g, "")); if (!target) continue;
      const dec = (m[1].split(".")[1] ?? "").length, start = performance.now(), dur = 700;
      const step = (t: number) => {
        const k = Math.min(1, (t - start) / dur), e = 1 - Math.pow(1 - k, 3);
        const v = (target * e).toFixed(dec);
        el.textContent = k < 1 ? final.replace(m[1], Number(v).toLocaleString("en-IN", { minimumFractionDigits: dec, maximumFractionDigits: dec })) : final;
        if (k < 1) raf.push(requestAnimationFrame(step));
      };
      raf.push(requestAnimationFrame(step));
    }
    return () => raf.forEach(cancelAnimationFrame);
  }, []);
  return null;
}
