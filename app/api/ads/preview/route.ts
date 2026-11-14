import { NextResponse } from "next/server";
import { z } from "zod";
import { getTenant, unauthorized } from "@/lib/tenant";
import { adsConnection } from "@/lib/meta-ads";
import { PREVIEW_FORMATS, previewAd, storySpecOf } from "@/lib/meta-ads-create";
import { Welcome } from "@/lib/ads-spec";

/** POST { creative fields, format } → Meta's own preview of the ad for one placement (iframe src). */
const Body = z.object({
  format: z.enum(PREVIEW_FORMATS),
  goal: z.enum(["whatsapp", "instagram_dm", "website"]),
  pageId: z.string().regex(/^\d{5,}$/),
  instagramId: z.string().regex(/^\d{5,}$/).nullable().optional(),
  kind: z.enum(["image", "video"]),
  imageHash: z.string().max(80).nullable().optional(),
  videoId: z.string().regex(/^\d{5,}$/).nullable().optional(),
  videoThumb: z.string().url().nullable().optional(),
  primaryText: z.string().max(2200).default(""),
  headline: z.string().max(255).default(""),
  description: z.string().max(255).nullable().optional(),
  websiteUrl: z.string().url().nullable().optional(),
  cta: z.string().regex(/^[A-Z_]{3,30}$/).nullable().optional(),
  welcome: Welcome.nullable().optional(),
});

export async function POST(req: Request) {
  const t = await getTenant();
  if (!t) return unauthorized();
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Choose a Page and upload media to see Meta's preview." }, { status: 400 });
  const c = await adsConnection(t.wsId);
  if (!c) return NextResponse.json({ error: "Connect an ad account to see Meta's preview." }, { status: 409 });
  const d = b.data;
  if (d.kind === "image" ? !d.imageHash : !d.videoId) return NextResponse.json({ error: "Upload media to see Meta's preview." }, { status: 400 });
  const story = storySpecOf({ ...d, format: d.kind, instagramId: d.instagramId ?? null, primaryText: d.primaryText || " ", headline: d.headline || " ",
    websiteUrl: d.goal === "website" ? d.websiteUrl ?? "https://example.com" : null });
  const r = await previewAd(c, story, d.format);
  return r.ok ? NextResponse.json({ ok: true, src: r.src, width: r.width, height: r.height }) : NextResponse.json({ error: r.error }, { status: 422 });
}
