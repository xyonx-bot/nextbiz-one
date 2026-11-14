"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Mouse/touch/keyboard resizable panel widths.
 *  · useStoredWidth — a width in px remembered per browser (localStorage), null = the layout's default.
 *  · <Resizer> — a thin vertical grab bar. Drag to resize, arrow keys nudge (Shift = bigger steps),
 *    double-click resets to the default.
 * `edge` says which edge of the panel the bar sits on: "right" (panel grows when dragged right, e.g. a
 * left list) or "left" (panel grows when dragged left, e.g. a right-hand details panel or drawer).
 */
export function useStoredWidth(key: string): [number | null, (w: number | null) => void] {
  const [w, setW] = useState<number | null>(null);
  useEffect(() => {
    try { const v = Number(localStorage.getItem(key)); if (Number.isFinite(v) && v > 0) setW(v); } catch { /* storage blocked */ }
  }, [key]);
  const set = useCallback((v: number | null) => {
    setW(v);
    try { if (v == null) localStorage.removeItem(key); else localStorage.setItem(key, String(Math.round(v))); } catch { /* storage blocked */ }
  }, [key]);
  return [w, set];
}

export function Resizer({
  edge, width, min, max, onResize, onReset, label, className = "", style, testId,
}: {
  edge: "left" | "right";
  /** current rendered width of the panel (px) — the drag starts from here */
  width: () => number;
  min: number;
  max: () => number;
  onResize: (w: number) => void;
  onReset: () => void;
  label: string;
  className?: string;
  style?: React.CSSProperties;
  testId?: string;
}) {
  const drag = useRef<{ x: number; w: number } | null>(null);
  const [active, setActive] = useState(false);
  const clamp = (v: number) => Math.round(Math.max(min, Math.min(max(), v)));

  function down(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    drag.current = { x: e.clientX, w: width() };
    e.currentTarget.setPointerCapture(e.pointerId);
    setActive(true);
    document.documentElement.classList.add("is-resizing");
  }
  function move(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.x;
    onResize(clamp(edge === "right" ? d.w + dx : d.w - dx));
  }
  function up(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    drag.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    setActive(false);
    document.documentElement.classList.remove("is-resizing");
  }
  function key(e: React.KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 48 : 16;
    const grow = edge === "right" ? "ArrowRight" : "ArrowLeft";
    const shrink = edge === "right" ? "ArrowLeft" : "ArrowRight";
    if (e.key === grow) { e.preventDefault(); onResize(clamp(width() + step)); }
    else if (e.key === shrink) { e.preventDefault(); onResize(clamp(width() - step)); }
    else if (e.key === "Home" || e.key === "Enter") { e.preventDefault(); onReset(); }
  }

  return (
    <div
      className={`rz rz-${edge}${active ? " on" : ""} ${className}`}
      style={style}
      role="separator"
      aria-orientation="vertical"
      aria-label={`${label} — drag to resize, double-click to reset`}
      title="Drag to resize · double-click to reset"
      tabIndex={0}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onDoubleClick={onReset}
      onKeyDown={key}
      data-testid={testId}
    ><span className="grip" /></div>
  );
}
