"use client";

import { Icon } from "@/components/Icon";

/** Client-side template shape (GET /api/templates). */
export type TplButton = { type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER"; text: string; url?: string; phone?: string };
export type HeaderFormat = "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
export type Tpl = {
  id: string; name: string; meta_name: string | null; category: string; language: string; body: string;
  variables: string[] | null; status: string; rejection_reason: string | null; updated_at: string;
  header: string | null; header_format: HeaderFormat; header_media_id: string | null; header_media_name?: string | null; header_media_mime?: string | null;
  footer: string | null; buttons_json: TplButton[];
};
export const SAMPLE: Record<string, string> = { "1": "Rahul", "2": "Nov 21", "3": "Acme Studio" };
export const tokensOf = (b: string) => [...new Set(b.match(/\{\{\d+\}\}/g) ?? [])].map((t) => t.replace(/\D/g, "")).sort((a, b) => +a - +b);

/**
 * One WhatsApp template message as the customer sees it: media / text header, body with variables
 * filled in, footer, and buttons (quick replies, website, call). Used by the editor and the senders.
 */
export function WaBubble({ format, headerText, mediaUrl, mediaName, body, values, footer, buttons, time = "11:02", testId }: {
  format: HeaderFormat; headerText?: string | null; mediaUrl?: string | null; mediaName?: string | null;
  body: string; values: Record<string, string>; footer?: string | null; buttons?: TplButton[]; time?: string; testId?: string;
}) {
  const parts = body.split(/(\{\{\d+\}\})/g);
  return (
    <div className="wbub" data-testid={testId}>
      {format === "IMAGE" && (mediaUrl ? <img className="hm" src={mediaUrl} alt="" /> : <div className="hm ph"><Icon name="image" /><span>Image</span></div>)}
      {format === "VIDEO" && (mediaUrl ? <div className="hm vid"><video src={mediaUrl} muted playsInline preload="metadata" /><span className="pl"><Icon name="play" /></span></div> : <div className="hm ph"><Icon name="video-camera" /><span>Video</span></div>)}
      {format === "DOCUMENT" && <div className="hdoc"><span className="ic"><Icon name="file-pdf" /></span><span className="trunc">{mediaName || "document.pdf"}</span></div>}
      {format === "TEXT" && headerText && <div className="hd">{headerText}</div>}
      <div className="bd" data-testid="tpl-preview-body">{body ? parts.map((p, i) => { const m = p.match(/^\{\{(\d+)\}\}$/); return m ? <b key={i}>{values[m[1]] || SAMPLE[m[1]] || p}</b> : <span key={i}>{p}</span>; }) : <span className="faint">Your message…</span>}</div>
      <div className="ft"><span>{footer ?? ""}</span><span>{time}</span></div>
      {(buttons ?? []).map((b, i) => (
        <div key={i} className="bt"><Icon name={b.type === "URL" ? "arrow-square-out" : b.type === "PHONE_NUMBER" ? "phone" : "arrow-counter-clockwise"} size="sm" />{b.text || "Button"}</div>
      ))}
    </div>
  );
}

export const tplMediaUrl = (t: Pick<Tpl, "header_media_id">) => (t.header_media_id ? `/api/media/${t.header_media_id}` : null);
