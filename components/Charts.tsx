"use client";

import { useEffect, useRef, useState } from "react";

/** Paired-bar chart (design v2 dashboard). Measures its own width so labels never stretch. */
export function PairBars({ a, b, labels, colors = ["var(--chat)", "#C9C1B1"], names = ["Received", "Sent"], height = 240 }: {
  a: number[]; b: number[]; labels: string[]; colors?: [string, string]; names?: [string, string]; height?: number;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [w, setW] = useState(800);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 800)); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = height, L = 30, B = 22, n = a.length, cw = (w - L) / Math.max(n, 1), bw = Math.min(14, cw / 3.2);
  const raw = Math.max(...a, ...b, 1);
  const step = raw <= 4 ? 1 : raw <= 20 ? 5 : raw <= 100 ? 25 : Math.pow(10, Math.floor(Math.log10(raw)));
  const max = Math.ceil(raw / step) * step;
  const ticks: number[] = []; for (let v = 0; v <= max; v += step) ticks.push(v);
  const y = (v: number) => H - B - (v / max) * (H - B - 8);
  return (
    <div style={{ position: "relative" }}>
      <svg ref={ref} viewBox={`0 0 ${w} ${H}`} style={{ width: "100%", height: H, display: "block", overflow: "visible" }} role="img"
        aria-label={`${names[0]} and ${names[1]} per day`} onMouseLeave={() => setHover(null)}>
        {ticks.map((v) => (
          <g key={v}><line x1={L} x2={w} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray="2 4" />
            <text x={L - 8} y={y(v) + 3} textAnchor="end" fontSize="10" fontWeight="600" fill="var(--ink-3)">{v}</text></g>
        ))}
        {a.map((v, k) => {
          const x = L + k * cw + cw / 2;
          return (
            <g key={k} onMouseEnter={() => setHover(k)}>
              <rect x={x - cw / 2} y={0} width={cw} height={H - B} fill="transparent" />
              <rect x={x - bw - 1} y={y(v)} width={bw} height={Math.max(0, H - B - y(v))} rx={3} fill={colors[0]} opacity={hover === null || hover === k ? 1 : 0.55} />
              <rect x={x + 1} y={y(b[k])} width={bw} height={Math.max(0, H - B - y(b[k]))} rx={3} fill={colors[1]} opacity={hover === null || hover === k ? 1 : 0.55} />
              {(k % 2 === 0 || n < 10) && <text x={x} y={H - 5} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--ink-3)">{labels[k]}</text>}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div style={{ position: "absolute", top: 8, left: Math.min(Math.max(0, L + hover * cw + cw / 2 - 70), w - 150), background: "var(--ink)", color: "#fff", padding: "8px 10px", borderRadius: 9, fontSize: 11, fontWeight: 600, pointerEvents: "none", whiteSpace: "nowrap" }}>
          <b style={{ display: "block", fontSize: 10, opacity: .7 }}>{labels[hover]}</b>{a[hover]} {names[0].toLowerCase()} · {b[hover]} {names[1].toLowerCase()}
        </div>
      )}
    </div>
  );
}

/** Area sparkline. */
export function Spark({ data, color = "var(--chat)", fill = "var(--chat-tint)", height = 36 }: { data: number[]; color?: string; fill?: string; height?: number }) {
  const w = 200, h = height, mn = Math.min(...data), mx = Math.max(...data);
  const pts = data.map((v, k) => [k * (w / Math.max(data.length - 1, 1)), h - 4 - ((v - mn) / ((mx - mn) || 1)) * (h - 10)]);
  const line = pts.map((p, k) => (k ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join("");
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: h, display: "block" }} aria-hidden>
      <path d={`${line} L${w},${h} L0,${h}Z`} fill={fill} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
