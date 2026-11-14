"use client";

import { useEffect } from "react";

/**
 * Bridge between pages and the NextBiz AI drawer.
 *  · Pages describe what's on screen (setAiContext) so the assistant can help with "this chat" / "this form".
 *  · Pages register handlers for approved actions (useAiHandler): the campaign builder fills its form,
 *    the inbox drops a reply into its composer. Approve ≠ submit: the person still publishes / sends.
 *  · An action approved on another page is parked (sessionStorage) and picked up after navigating there.
 */
export type AiContext = { page: string; title?: string; entity?: Record<string, unknown> };
export type AiAction = { id: string; type: "campaign_form" | "reply" | "keyword_rule" | "template"; summary: string; payload: Record<string, unknown> };

let ctx: AiContext | null = null;
const listeners = new Set<() => void>();
export function setAiContext(c: AiContext | null) { ctx = c; listeners.forEach((f) => f()); }
export function getAiContext() { return ctx; }
export function onAiContext(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; }

const handlers = new Map<string, (payload: Record<string, unknown>) => void>();
export function useAiHandler(type: AiAction["type"], fn: (payload: Record<string, unknown>) => void) {
  useEffect(() => {
    handlers.set(type, fn);
    // pick up an action approved on another page
    try {
      const raw = sessionStorage.getItem(`nbo.ai.pending.${type}`);
      if (raw) { sessionStorage.removeItem(`nbo.ai.pending.${type}`); fn(JSON.parse(raw)); }
    } catch { /* storage blocked */ }
    return () => { if (handlers.get(type) === fn) handlers.delete(type); };
  }, [type, fn]);
}
export const hasAiHandler = (type: AiAction["type"]) => handlers.has(type);

/** Apply on this page if it can take it; otherwise park it and go to the page that can. */
export function applyAiAction(a: AiAction, router: { push: (u: string) => void }): "applied" | "navigating" {
  const h = handlers.get(a.type);
  if (h) { h(a.payload); return "applied"; }
  try { sessionStorage.setItem(`nbo.ai.pending.${a.type}`, JSON.stringify(a.payload)); } catch { /* storage blocked */ }
  const id = String(a.payload.conversation_id ?? "");
  router.push(a.type === "campaign_form" ? "/ads/new" : a.type === "reply" ? (id.startsWith("ig:") ? `/social/dms?open=${encodeURIComponent(id)}` : `/inbox${id ? `?open=${encodeURIComponent(id)}` : ""}`) : "/");
  return "navigating";
}

/** Is AI switched on for this workspace? (one request per page load) */
let status: Promise<{ available: boolean; usedToday: number; limit: number }> | null = null;
export function aiStatus() {
  status ??= fetch("/api/ai/status", { cache: "no-store" }).then((r) => r.json()).then((d) => ({ available: !!d?.available, usedToday: d?.usedToday ?? 0, limit: d?.limit ?? 0 })).catch(() => ({ available: false, usedToday: 0, limit: 0 }));
  return status;
}
