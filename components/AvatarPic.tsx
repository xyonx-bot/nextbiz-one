"use client";

import { useState } from "react";

/**
 * Profile picture inside an `.av` circle. Sits over the initials, so a missing picture (404, or a
 * WhatsApp contact — WhatsApp's API doesn't share profile photos) just leaves the initials showing.
 */
export function AvatarPic({ src }: { src: string | null | undefined }) {
  const [state, setState] = useState<"loading" | "ok" | "err">("loading");
  if (!src || state === "err") return null;
  return <img className={`av-pic${state === "ok" ? " on" : ""}`} src={src} alt="" loading="lazy" decoding="async" onLoad={() => setState("ok")} onError={() => setState("err")} />;
}
