"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const CHANNEL = "nbo";

/** Tell every open tab that a channel was connected or disconnected. */
export function announceChannels() {
  try { const c = new BroadcastChannel(CHANNEL); c.postMessage("channels"); c.close(); } catch { /* old browser: tabs refresh on focus */ }
}

/** Keeps a server-rendered page current: every 30s while visible, when the tab comes back, and when a channel changes in another tab. */
export function AutoRefresh({ everyMs = 30_000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    let last = Date.now();
    const go = (minGap: number) => { if (document.visibilityState === "visible" && Date.now() - last >= minGap) { last = Date.now(); router.refresh(); } };
    const back = () => go(2000);
    const restored = (e: PageTransitionEvent) => { if (e.persisted) go(0); }; // browser back/forward cache
    const t = setInterval(() => go(everyMs - 1000), everyMs);
    let bc: BroadcastChannel | null = null;
    try { bc = new BroadcastChannel(CHANNEL); bc.onmessage = () => { last = Date.now(); router.refresh(); }; } catch { /* not supported */ }
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);
    window.addEventListener("pageshow", restored);
    return () => { clearInterval(t); bc?.close(); document.removeEventListener("visibilitychange", back); window.removeEventListener("focus", back); window.removeEventListener("pageshow", restored); };
  }, [router, everyMs]);
  return null;
}
