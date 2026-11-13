/** Small display helpers shared by server and client components. */
export function avatarClass(seed: string) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return `c${(h % 8) + 1}`;
}
export function initials(name: string | null, fallback: string) {
  return (name ?? fallback).replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase() || "?";
}
export const fmtPhone = (wa: string) => (wa.length > 10 ? `+${wa.slice(0, wa.length - 10)} ${wa.slice(-10, -5)} ${wa.slice(-5)}` : `+${wa}`);
