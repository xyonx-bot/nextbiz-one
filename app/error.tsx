"use client";
import { useEffect } from "react";

/** Any page that crashes lands here instead of a blank screen. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="pg-oops" data-testid="error-page">
      <img src="/art/ads-waiting.webp" alt="" width={200} height={200} />
      <h1>Something didn&apos;t load</h1>
      <p>It&apos;s on our side, not yours. Try again — if it keeps happening, tell us the code below.</p>
      {error.digest && <code>{error.digest}</code>}
      <div className="row gap-6" style={{ justifyContent: "center" }}><button className="btn btn-primary" onClick={reset}>Try again</button><a className="btn btn-soft" href="/">Dashboard</a></div>
    </main>
  );
}
