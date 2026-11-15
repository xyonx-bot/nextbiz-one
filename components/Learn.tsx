import { Icon } from "./Icon";
import type { Block } from "@/lib/learn";

/** **bold** → <b>. Nothing else is interpreted, so guide text can never inject markup. */
export function Rich({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*)/g).map((p, i) => p.startsWith("**") && p.endsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : <span key={i}>{p}</span>)}</>;
}

const TIP_ICON = { info: "info", warn: "warning-circle", good: "check-circle" } as const;

export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.t) {
          case "p": return <p key={i}><Rich text={b.text} /></p>;
          case "h": return <h2 key={i}>{b.text}</h2>;
          case "list": return <ul key={i}>{b.items.map((x, j) => <li key={j}><Rich text={x} /></li>)}</ul>;
          case "steps": return (
            <ol key={i} className="lsteps">{b.items.map(([t, d], j) => (
              <li key={j}><span className="lc-n">{j + 1}</span><span><b>{t.replace(/^\d+\s*·\s*/, "")}</b><small><Rich text={d} /></small></span></li>
            ))}</ol>
          );
          case "tip": return (
            <div key={i} className={`ltip ${b.tone ?? "info"}`}><Icon name={TIP_ICON[b.tone ?? "info"]} /><span><b>{b.title}</b><small><Rich text={b.text} /></small></span></div>
          );
          case "compare": return (
            <div key={i} className="lcompare">
              {[b.left, b.right].map((side, j) => (
                <div key={j} className={j ? "r" : "l"}><b>{side.title}</b><ul>{side.items.map((x, k) => <li key={k}><Icon name={j ? "arrow-right" : "check"} size="xs" /><span><Rich text={x} /></span></li>)}</ul></div>
              ))}
            </div>
          );
          case "example": return (
            <figure key={i} className="lchat"><figcaption>{b.label}</figcaption>
              {b.lines.map(([dir, text], j) => <div key={j} className={`lb ${dir}`}>{text}</div>)}
            </figure>
          );
        }
      })}
    </>
  );
}
