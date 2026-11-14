"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "./Icon";
import { aiStatus } from "@/lib/ai-bridge";

/**
 * ✨ Reply suggestions for a chat or comment. Three options (short · friendly · detailed).
 * Tab / Shift+Tab in the reply box cycles them straight into the box, Esc restores what you had typed.
 * Nothing is ever sent from here — the person edits and presses Send.
 */
export type SuggestKind = "wa" | "ig" | "comment";
type S = { tone: string; text: string };

export function useAiSuggest(kind: SuggestKind, id: string | null, draft: string, setDraft: (s: string) => void) {
  const [enabled, setEnabled] = useState(false);
  const [list, setList] = useState<S[] | null>(null);
  const [idx, setIdx] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [orig, setOrig] = useState("");
  useEffect(() => { void aiStatus().then((s) => setEnabled(s.available)); }, []);
  useEffect(() => { setList(null); setIdx(-1); setError(""); }, [id]);

  const ask = useCallback(async () => {
    if (!id) return;
    setBusy(true); setError(""); setOrig(draft);
    const d = await fetch("/api/ai/suggest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, id, draft: draft.trim() || undefined }) })
      .then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (!d?.ok) { setError(d?.error ?? "Couldn't get suggestions"); setList(null); return; }
    setList(d.suggestions); setIdx(-1);
  }, [id, kind, draft]);

  const pick = useCallback((i: number) => { if (!list?.[i]) return; setIdx(i); setDraft(list[i].text); }, [list, setDraft]);
  const close = useCallback((restore = false) => { if (restore) setDraft(orig); setList(null); setIdx(-1); setError(""); }, [orig, setDraft]);

  /** Wire into the textarea's onKeyDown. Returns true when it handled the key. */
  const onKey = useCallback((e: React.KeyboardEvent) => {
    if (!list?.length) return false;
    if (e.key === "Tab") { e.preventDefault(); const n = list.length; pick(((idx + (e.shiftKey ? -1 : 1)) % n + n) % n); return true; }
    if (e.key === "Escape") { e.preventDefault(); close(true); return true; }
    return false;
  }, [list, idx, pick, close]);

  return { enabled, list, idx, busy, error, ask, pick, close, onKey };
}

export function AiSuggestButton({ s }: { s: ReturnType<typeof useAiSuggest> }) {
  if (!s.enabled) return null;
  return (
    <button type="button" className={`btn btn-ghost btn-sm ai-sug-btn${s.busy ? " busy" : ""}`} onClick={() => void s.ask()} disabled={s.busy} title="AI reply suggestions" data-testid="ai-suggest">
      <Icon name="sparkle" />{s.busy ? "Thinking…" : "Suggest"}
    </button>
  );
}

export function AiSuggestStrip({ s }: { s: ReturnType<typeof useAiSuggest> }) {
  if (!s.enabled || (!s.list && !s.error)) return null;
  return (
    <div className="ai-strip" data-testid="ai-strip">
      <span className="ai-strip-h"><Icon name="sparkle" size="sm" />{s.error ? <span className="err">{s.error}</span> : <>AI suggestions <span className="kbd">Tab</span> to cycle · edit freely · you send</>}
        <span className="sp" /><button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => s.close(true)} aria-label="Close suggestions"><Icon name="x" /></button></span>
      {s.list && (
        <div className="ai-opts">
          {s.list.map((o, i) => (
            <button key={i} type="button" className={`ai-opt${s.idx === i ? " on" : ""}`} onClick={() => s.pick(i)} data-testid="ai-opt">
              <b>{o.tone || `Option ${i + 1}`}</b><span>{o.text}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
