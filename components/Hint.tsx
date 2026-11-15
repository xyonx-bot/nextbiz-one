"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";

/**
 * A small, dismissible tip that links to a Learning center guide. Dismissal is remembered in this browser.
 * Renders nothing until mounted, so a dismissed hint never flashes.
 */
export function Hint({ id, title, text, guide, tone = "grape", className = "" }: { id: string; title: string; text: string; guide?: string; tone?: "grape" | "green" | "pink" | "orange" | "banana"; className?: string }) {
  const key = `nbo-hint-${id}`;
  const [show, setShow] = useState(false);
  useEffect(() => { try { setShow(localStorage.getItem(key) !== "1"); } catch { setShow(true); } }, [key]);
  if (!show) return null;
  const close = () => { setShow(false); try { localStorage.setItem(key, "1"); } catch { /* private mode */ } };
  return (
    <div className={`tipcard ${tone} ${className}`} role="note" data-testid={`hint-${id}`}>
      <span className={`icon-tile sm ${tone}`}><Icon name="lightbulb" /></span>
      <span className="grow"><b>{title}</b><small>{text}</small></span>
      {guide && <a className="tipcard-go" href={`/learn/${guide}`}>Read guide<Icon name="arrow-right" size="xs" /></a>}
      <button className="tipcard-x" onClick={close} aria-label="Dismiss tip" title="Got it"><Icon name="x" size="xs" /></button>
    </div>
  );
}
