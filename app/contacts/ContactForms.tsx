"use client";

import { useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { fmtPhone } from "@/lib/ui";

/** Add one contact · Import a CSV (column mapping, preview, consent). */

function Modal({ title, onClose, children, wide = false, testId }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean; testId?: string }) {
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className={`card modal${wide ? "" : " sm"}`} style={wide ? { width: "min(820px, 100%)" } : { width: "min(480px, 100%)" }} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} data-testid={testId}>
        <div className="card-h line"><span className="h3">{title}</span><span className="sp" /><button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close"><Icon name="x" /></button></div>
        <div style={{ padding: "var(--pad)", display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>
      </div>
    </div>
  );
}

/** Same rules as the server (lib/contacts.ts normalizePhone) — for the live preview only. */
function normPhone(raw: string, cc: string): string | null {
  let d = String(raw ?? "").trim().replace(/[^\d+]/g, "");
  if (!d) return null;
  if (d.startsWith("+")) d = d.slice(1).replace(/\D/g, "");
  else if (d.startsWith("00")) d = d.slice(2);
  else { d = d.replace(/\D/g, "").replace(/^0+/, ""); if (d.length <= 10) d = cc + d; }
  return /^\d{8,15}$/.test(d) ? d : null;
}

const Consent = ({ on, set, many = false }: { on: boolean; set: (v: boolean) => void; many?: boolean }) => (
  <label className="consent"><input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} data-testid="consent" />
    <span><b>{many ? "These people agreed to get WhatsApp offers from us" : "They agreed to get WhatsApp offers from us"}</b>
      <small>Only then can broadcasts reach them. WhatsApp blocks numbers that message people who didn&apos;t opt in.</small></span></label>
);

export function AddContactModal({ onClose, onAdded }: { onClose: () => void; onAdded: (c: unknown, existed: boolean) => void }) {
  const [phone, setPhone] = useState(""); const [name, setName] = useState(""); const [tags, setTags] = useState(""); const [company, setCompany] = useState("");
  const [cc, setCc] = useState("91"); const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const n = normPhone(phone, cc);
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!n) { setErr("Enter a WhatsApp number."); return; }
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/contacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, name: name || undefined, tags, company: company || undefined, optIn: consent, consent, defaultCc: cc }) });
      const d = (await r.json().catch(() => null)) as { ok?: boolean; error?: string; contact?: unknown; existed?: boolean } | null;
      if (!r.ok || !d?.ok) setErr(d?.error ?? "Couldn't add the contact."); else onAdded(d.contact, !!d.existed);
    } finally { setBusy(false); }
  }
  return (
    <Modal title="Add a contact" onClose={onClose} testId="add-contact">
      <form onSubmit={save} className="col" style={{ gap: 12 }}>
        <div className="field"><label htmlFor="ac-phone">WhatsApp number</label>
          <div className="row gap-6"><select className="select" style={{ width: 96 }} value={cc} onChange={(e) => setCc(e.target.value)} aria-label="Country code"><option value="91">🇮🇳 +91</option><option value="1">🇺🇸 +1</option><option value="44">🇬🇧 +44</option><option value="971">🇦🇪 +971</option><option value="65">🇸🇬 +65</option><option value="61">🇦🇺 +61</option><option value="880">🇧🇩 +880</option><option value="977">🇳🇵 +977</option></select>
            <input id="ac-phone" className="input grow" autoFocus inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" data-testid="ac-phone" /></div>
          <span className={`hint${phone && !n ? " err" : ""}`}>{phone ? (n ? `Will be saved as ${fmtPhone(n)}` : "That doesn't look like a phone number") : "A number with + uses its own country code"}</span></div>
        <div className="g2"><div className="field"><label htmlFor="ac-name">Name</label><input id="ac-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Priya Sharma" data-testid="ac-name" /></div>
          <div className="field"><label htmlFor="ac-co">Company <span className="faint">(optional)</span></label><input id="ac-co" className="input" value={company} onChange={(e) => setCompany(e.target.value)} /></div></div>
        <div className="field"><label htmlFor="ac-tags">Tags <span className="faint">(comma separated)</span></label><input id="ac-tags" className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="lead, diwali" /></div>
        <Consent on={consent} set={setConsent} />
        {err && <div className="note bad" style={{ fontSize: "var(--fs-xs)" }}><Icon name="warning-circle" size="sm" /><span>{err}</span></div>}
        <div className="row gap-6" style={{ justifyContent: "flex-end" }}><button type="button" className="btn btn-soft" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !n} data-testid="ac-save"><Icon name="user-plus" />{busy ? "Adding…" : "Add contact"}</button></div>
      </form>
    </Modal>
  );
}

/* ── CSV ── */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let q = false;
  const delim = (text.split("\n")[0].match(/;/g)?.length ?? 0) > (text.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : (text.split("\n")[0].includes("\t") ? "\t" : ",");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.some((c) => c.trim())) rows.push(row); row = []; }
    else cell += ch;
  }
  row.push(cell); if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}
type Field = "phone" | "name" | "tags" | "optIn" | "company" | "location" | "";
const GUESS: [Field, RegExp][] = [["phone", /phone|mobile|whats ?app|number|contact|cell|msisdn/i], ["name", /name/i], ["tags", /tag|label|group|segment/i], ["optIn", /opt|consent|subscri|marketing/i], ["company", /company|business|org/i], ["location", /city|location|town|state|address/i]];
const FIELDS: [Field, string][] = [["", "Skip"], ["phone", "Phone"], ["name", "Name"], ["tags", "Tags"], ["optIn", "Opted in (yes/no)"], ["company", "Company"], ["location", "City"]];
const yes = (v: string) => /^(y|yes|true|1|opted|opt.?in|subscribed)$/i.test(v.trim());

export function ImportContactsModal({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const [rows, setRows] = useState<string[][] | null>(null);
  const [fname, setFname] = useState("");
  const [hasHeader, setHasHeader] = useState(true);
  const [map, setMap] = useState<Field[]>([]);
  const [cc, setCc] = useState("91"); const [tag, setTag] = useState(""); const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const [result, setResult] = useState<{ added: number; updated: number; skipped: number; duplicates: number; invalid: { row: number; phone: string }[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load(f: File) {
    setErr(""); setResult(null);
    if (f.size > 5 * 1024 * 1024) { setErr("That file is over 5 MB — split it into smaller files."); return; }
    const r = parseCsv(await f.text());
    if (!r.length) { setErr("The file is empty."); return; }
    setFname(f.name); setRows(r);
    const head = r[0], looksHeader = head.some((h) => GUESS.some(([, re]) => re.test(h))) && !head.some((h) => /^\+?[\d\s()-]{8,}$/.test(h.trim()));
    setHasHeader(looksHeader);
    const used = new Set<Field>();
    setMap(head.map((h, i) => {
      if (looksHeader) { const g = GUESS.find(([k, re]) => !used.has(k) && re.test(h)); if (g) { used.add(g[0]); return g[0]; } return ""; }
      // no header: guess by content of the first rows
      const col = r.slice(0, 5).map((x) => x[i] ?? "");
      if (!used.has("phone") && col.every((v) => !v || /^\+?[\d\s()-]{8,}$/.test(v.trim()))) { used.add("phone"); return "phone"; }
      if (!used.has("name") && col.some((v) => /[a-z]/i.test(v))) { used.add("name"); return "name"; }
      return "";
    }));
  }
  const body = useMemo(() => (rows ? rows.slice(hasHeader ? 1 : 0) : []), [rows, hasHeader]);
  const phoneCol = map.indexOf("phone");
  const parsed = useMemo(() => body.map((r) => {
    const o: Record<string, string> = {}; map.forEach((f, i) => { if (f) o[f] = (r[i] ?? "").trim(); });
    return { v: o, ok: !!normPhone(o.phone ?? "", cc) };
  }), [body, map, cc]);
  const valid = parsed.filter((r) => r.ok).length;
  const hasOptCol = map.includes("optIn");

  async function run() {
    if (phoneCol < 0 || !valid) return;
    setBusy(true); setErr("");
    try {
      const payload = parsed.map(({ v }) => ({ phone: v.phone ?? "", name: v.name || null, tags: v.tags || null,
        company: v.company || null, location: v.location || null, optIn: hasOptCol ? yes(v.optIn ?? "") : consent }));
      const res = await fetch("/api/contacts/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: payload.slice(0, 5000), defaultCc: cc, consent, tags: tag ? [tag] : [] }) });
      const d = (await res.json().catch(() => null)) as ({ ok?: boolean; error?: string } & NonNullable<typeof result>) | null;
      if (!res.ok || !d?.ok) setErr(d?.error ?? "Import failed — try again."); else { setResult(d); onDone(`Imported ${d.added} new, updated ${d.updated}.`); }
    } finally { setBusy(false); }
  }

  return (
    <Modal title="Import contacts" onClose={onClose} wide testId="import-contacts">
      {result ? (
        <div className="imp-done" data-testid="import-result">
          <span className="icon-tile green lg"><Icon name="check-circle" /></span>
          <div className="grow"><b>{result.added} new contact{result.added === 1 ? "" : "s"} added</b>
            <p>{result.updated} already existed and were updated (names and tags filled in, never removed){result.duplicates ? ` · ${result.duplicates} duplicate rows skipped` : ""}{result.skipped ? ` · ${result.skipped} rows had no valid number` : ""}.</p>
            {result.invalid.length > 0 && <p className="xs faint">Not imported: {result.invalid.slice(0, 6).map((x) => `row ${x.row} (${x.phone || "empty"})`).join(", ")}{result.invalid.length > 6 ? "…" : ""}</p>}</div>
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      ) : !rows ? (
        <>
          <button className="imp-drop" onClick={() => fileRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void load(f); }} data-testid="import-drop">
            <Icon name="upload-simple" /><b>Choose a CSV file</b><small>or drop it here · exported from Excel, Google Sheets or your phone</small></button>
          <input ref={fileRef} type="file" hidden accept=".csv,text/csv,.txt" onChange={(e) => { const f = e.target.files?.[0]; if (f) void load(f); }} data-testid="import-file" />
          <div className="imp-eg"><b>Example</b><code>name,phone,tags{"\n"}Priya Sharma,+91 98765 43210,lead{"\n"}Rahul,9876501234,customer</code>
            <span className="xs faint">Numbers without a country code get +{cc}. Existing contacts are matched by number, so importing twice is safe.</span></div>
        </>
      ) : (
        <>
          <div className="row gap-6 wrap"><span className="icon-tile sm green"><Icon name="clipboard-text" /></span><b className="small">{fname}</b><span className="xs faint">{body.length} rows</span><span className="sp" />
            <label className="row gap-6 xs" style={{ fontWeight: 600 }}><input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />First row is column names</label>
            <button className="btn btn-ghost btn-sm" onClick={() => { setRows(null); setMap([]); }}>Choose another file</button></div>
          <div className="imp-tbl">
            <table className="dt"><thead><tr>{(rows[0] ?? []).map((h, i) => (
              <th key={i}><select className="select sm" value={map[i] ?? ""} onChange={(e) => setMap(map.map((m, k) => (k === i ? e.target.value as Field : m === e.target.value && e.target.value ? "" : m)))} aria-label={`Column ${i + 1}`} data-testid={`map-${i}`}>
                {FIELDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>{hasHeader && <small className="faint">{h}</small>}</th>))}<th /></tr></thead>
              <tbody>{parsed.slice(0, 6).map((r, k) => <tr key={k}>{(body[k] ?? []).map((c, i) => <td key={i} className={map[i] === "phone" && !r.ok ? "bad" : ""}>{c}</td>)}<td>{r.ok ? <Icon name="check" style={{ color: "var(--chat-deep)" }} /> : <Icon name="warning-circle" style={{ color: "var(--danger-deep)" }} />}</td></tr>)}</tbody></table>
          </div>
          {phoneCol < 0 && <div className="note warn" style={{ fontSize: "var(--fs-xs)" }}><Icon name="warning" size="sm" /><span>Pick which column has the phone numbers.</span></div>}
          <div className="g2">
            <div className="field"><label>Numbers without a country code</label><select className="select" value={cc} onChange={(e) => setCc(e.target.value)}><option value="91">India · +91</option><option value="1">US / Canada · +1</option><option value="44">UK · +44</option><option value="971">UAE · +971</option><option value="65">Singapore · +65</option><option value="880">Bangladesh · +880</option></select></div>
            <div className="field"><label>Add a tag to everyone <span className="faint">(optional)</span></label><input className="input" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="e.g. expo-2026" data-testid="import-tag" /></div>
          </div>
          <Consent on={consent} set={setConsent} many />
          {hasOptCol && <p className="xs faint" style={{ marginTop: -6 }}>Your file has an opt-in column — rows marked yes are opted in only if you tick the box above.</p>}
          {err && <div className="note bad" style={{ fontSize: "var(--fs-xs)" }}><Icon name="warning-circle" size="sm" /><span>{err}</span></div>}
          <div className="row gap-6"><span className="xs faint grow" style={{ fontWeight: 600 }}>{valid} of {body.length} rows have a valid number{body.length > 5000 ? " · the first 5,000 are imported" : ""}</span>
            <button className="btn btn-soft" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy || phoneCol < 0 || !valid} onClick={() => void run()} data-testid="import-run"><Icon name="upload-simple" />{busy ? "Importing…" : `Import ${Math.min(valid, 5000)} contact${valid === 1 ? "" : "s"}`}</button></div>
        </>
      )}
    </Modal>
  );
}
