/**
 * Human handoff — when a person replies in a chat, automation steps aside,
 * but only for a while: after HANDOFF_HOURS without a manual reply it
 * resumes on its own. Explicit commands (START / STOP …) are answered even
 * during a handoff, because the customer is asking for that reply.
 * Pure + client-safe (the inbox uses it to show the banner).
 */
export const HANDOFF_HOURS = 12;

/** Same words webhook.ts uses to flip contacts.opt_in. */
export const OPT_IN_RE = /^(start|optin|opt-in|promo|subcribe|subscribe)$/i;
export const OPT_OUT_RE = /^(stop|unsubscribe|cancel)$/i;
export const isCommand = (text: string): boolean => {
  const t = String(text ?? "").trim();
  return OPT_IN_RE.test(t) || OPT_OUT_RE.test(t);
};

/** When the handoff ends, or null if there is no active one.
 *  A paused flag without a timestamp (rows from before this change) counts as expired. */
export function handoffEndsAt(paused: boolean, pausedAt: Date | string | null | undefined): Date | null {
  if (!paused || !pausedAt) return null;
  const t = new Date(pausedAt).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t + HANDOFF_HOURS * 3600_000);
}

export function handoffActive(paused: boolean, pausedAt: Date | string | null | undefined, now: number = Date.now()): boolean {
  const end = handoffEndsAt(paused, pausedAt);
  return !!end && end.getTime() > now;
}
