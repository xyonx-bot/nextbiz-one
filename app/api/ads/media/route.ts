import { NextResponse } from "next/server";
import { getTenant, unauthorized } from "@/lib/tenant";
import { adsConnection } from "@/lib/meta-ads";
import { uploadImage, uploadVideo } from "@/lib/meta-ads-create";

export const maxDuration = 300;
const IMG = ["image/jpeg", "image/png"], VID = ["video/mp4", "video/quicktime"];

/** POST multipart { file } — uploads ad media straight to the connected ad account's library. */
export async function POST(req: Request) {
  const t = await getTenant();
  if (!t) return unauthorized();
  const c = await adsConnection(t.wsId);
  if (!c) return NextResponse.json({ error: "Connect an ad account first — media is uploaded to it." }, { status: 409 });
  const fd = await req.formData().catch(() => null);
  const file = fd?.get("file");
  if (!(file instanceof Blob) || file.size === 0) return NextResponse.json({ error: "Choose an image or video." }, { status: 400 });
  const name = (file as File).name || "upload";
  if (IMG.includes(file.type)) {
    if (file.size > 30 * 1024 * 1024) return NextResponse.json({ error: "Images can be up to 30 MB." }, { status: 413 });
    const r = await uploadImage(c, file, name);
    return r.ok ? NextResponse.json({ ok: true, kind: "image", hash: r.hash, url: r.url }) : NextResponse.json({ error: r.error }, { status: 502 });
  }
  if (VID.includes(file.type)) {
    if (file.size > 95 * 1024 * 1024) return NextResponse.json({ error: "Videos can be up to 95 MB here — compress it or trim it." }, { status: 413 });
    const r = await uploadVideo(c, file, name);
    return r.ok ? NextResponse.json({ ok: true, kind: "video", id: r.id }) : NextResponse.json({ error: r.error }, { status: 502 });
  }
  return NextResponse.json({ error: "Use a JPG or PNG image, or an MP4/MOV video." }, { status: 415 });
}
