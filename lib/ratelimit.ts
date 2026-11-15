/**
 * Small in-memory rate limiter (single app container). Fixed windows per key.
 * Good enough to stop password guessing and form floods; resets on deploy.
 */
const hits = new Map<string, { n: number; reset: number }>();
export function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}
/** true = allowed. `limit` requests per `windowSec` for this key. */
export function allow(key: string, limit: number, windowSec: number): boolean {
  const now = Date.now();
  if (hits.size > 50_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  const h = hits.get(key);
  if (!h || h.reset < now) { hits.set(key, { n: 1, reset: now + windowSec * 1000 }); return true; }
  h.n++;
  return h.n <= limit;
}
export const tooMany = () => new Response(JSON.stringify({ error: "Too many attempts — wait a few minutes and try again." }), { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "300" } });

/** Failure-only counters (logins): successful sign-ins never count against anyone. */
export function blocked(key: string, limit: number): boolean {
  const h = hits.get(key);
  return !!h && h.reset >= Date.now() && h.n >= limit;
}
export function fail(key: string, windowSec: number) { allow(key, Number.MAX_SAFE_INTEGER, windowSec); }
