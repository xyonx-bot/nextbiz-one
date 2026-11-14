"use client";

import { useState } from "react";
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
