"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";

/**
 * Demo workspaces only (never rendered for real ones). Invisible until Ctrl+Shift+M (⌘⇧M on Mac): makes a
 * customer message arrive live, for recording promo videos. Also scriptable: window.nboDemo({ channel, name, text }).
 * While mounted it nudges open pages to refresh every 3 s, so arrivals and ✓✓ ticks show up quickly on camera.
 */
type Ch = "whatsapp" | "instagram" | "comment";
const PRESETS: { ch: Ch; name: string; handle?: string; text: string; post?: number }[] = [
  { ch: "whatsapp", name: "Rahul Sharma", text: "Hi! Is the Monsoon gift set still available? Need 3 for Friday 🙏" },
  { ch: "whatsapp", name: "Ananya Iyer", text: "What's the price of the large sandalwood candle?" },
  { ch: "instagram", name: "Priya Nair", handle: "priya.nair", text: "Hey! Do you ship to Pune? Loved the new collection 😍" },
  { ch: "comment", name: "Karan Mehta", handle: "karan.mehta", text: "PRICE", post: 1 },
];

async function send(b: { channel: Ch; name: string; handle?: string; text: string; post?: number }) {
  const r = await fetch("/api/demo/incoming", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
  const d = await r.json().catch(() => null);
  if (!r.ok) throw new Error(d?.error ?? "Couldn't send");
  window.dispatchEvent(new Event("nbo:refresh"));
  return d;
}

export function DemoDock() {
  const [open, setOpen] = useState(false);
  const [ch, setCh] = useState<Ch>("whatsapp");
  const [name, setName] = useState(PRESETS[0].name);
  const [handle, setHandle] = useState("");
  const [text, setText] = useState(PRESETS[0].text);
  const [post, setPost] = useState(1);
  const [note, setNote] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "m") { e.preventDefault(); setOpen((o) => !o); } };
    window.addEventListener("keydown", onKey);
    (window as unknown as { nboDemo: typeof send }).nboDemo = send;
    const t = setInterval(() => { if (document.visibilityState === "visible") window.dispatchEvent(new Event("nbo:refresh")); }, 3000);
    return () => { window.removeEventListener("keydown", onKey); clearInterval(t); };
  }, []);
  if (!open) return null;

  const go = async (delay = 0) => {
    setNote(delay ? `Arrives in ${delay / 1000}s…` : "Sending…");
    if (delay) setOpen(false);
    await new Promise((r) => setTimeout(r, delay));
    try { await send({ channel: ch, name, handle: handle || undefined, text, post: ch === "comment" ? post : undefined }); setNote("Arrived ✓"); }
    catch (e) { setNote((e as Error).message); setOpen(true); }
  };

  return (
    <div className="modal-scrim" onClick={() => setOpen(false)}>
      <div className="card modal sm" role="dialog" aria-modal="true" aria-label="Demo: incoming message" onClick={(e) => e.stopPropagation()} data-testid="demo-dock">
        <div className="card-h line"><span className="h3">Demo · customer message</span><span className="sp" /><button className="btn btn-ghost btn-icon btn-sm" onClick={() => setOpen(false)} aria-label="Close"><Icon name="x" /></button></div>
        <div style={{ padding: "var(--pad)", display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="chips">{([["whatsapp", "WhatsApp"], ["instagram", "Instagram DM"], ["comment", "IG comment"]] as const).map(([k, l]) => <button key={k} type="button" className={`chip${ch === k ? " on" : ""}`} onClick={() => setCh(k)}>{l}</button>)}</div>
          <div className="chips">{PRESETS.map((p) => <button key={p.name} type="button" className="chip" onClick={() => { setCh(p.ch); setName(p.name); setHandle(p.handle ?? ""); setText(p.text); if (p.post) setPost(p.post); }}>{p.name}</button>)}</div>
          <div className="field"><label htmlFor="dd-name">Name</label><input id="dd-name" className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
          {ch !== "whatsapp" && <div className="field"><label htmlFor="dd-handle">Instagram username</label><input id="dd-handle" className="input" value={handle} placeholder={name.toLowerCase().replace(/\s+/g, ".")} onChange={(e) => setHandle(e.target.value)} /></div>}
          {ch === "comment" && <div className="field"><label htmlFor="dd-post">On post</label><select id="dd-post" className="select" value={post} onChange={(e) => setPost(Number(e.target.value))}>{[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>Post {n}</option>)}</select></div>}
          <div className="field"><label htmlFor="dd-text">Message</label><textarea id="dd-text" className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} /></div>
          <div className="row gap-6 wrap" style={{ alignItems: "center" }}>
            <button className="btn btn-primary" onClick={() => void go()}>Send now</button>
            <button className="btn btn-soft" onClick={() => void go(5000)}>Send in 5s</button>
            <small className="muted">{note}</small>
          </div>
        </div>
      </div>
    </div>
  );
}
