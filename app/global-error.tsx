"use client";

/** Last-resort error screen (the root layout itself failed), so it carries its own minimal styles. */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en"><body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#F7F3EB", fontFamily: "system-ui, sans-serif", color: "#1A1D23" }}>
      <div style={{ textAlign: "center", padding: 24 }}>
        <h1 style={{ fontSize: 24 }}>NextBiz One hit a snag</h1>
        <p style={{ color: "#545862" }}>Please try again in a moment.</p>
        <button onClick={reset} style={{ marginTop: 12, padding: "10px 18px", borderRadius: 12, border: 0, background: "#91C82B", fontWeight: 700, cursor: "pointer" }}>Try again</button>
      </div>
    </body></html>
  );
}
