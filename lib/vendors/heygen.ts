import { getSecret } from "../connections";

// HeyGen client — the "Presenter" (talking a-roll) vendor. Vendor-neutral in the UI.
const API = "https://api.heygen.com";
const UPLOAD = "https://upload.heygen.com";

async function key(): Promise<string> {
  const k = await getSecret("heygen");
  if (!k) throw new Error("Presenter (HeyGen) is not connected");
  return k;
}

// Verify the key works + return remaining quota (credits).
export async function remainingQuota(): Promise<unknown> {
  const res = await fetch(`${API}/v2/user/remaining_quota`, {
    headers: { "x-api-key": await key() },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HeyGen quota failed (${res.status}): ${JSON.stringify(data).slice(0, 160)}`);
  return data;
}

// Turn a hero image into a HeyGen Talking Photo → talking_photo_id (the "presenter").
// The image is fetched and uploaded as raw bytes to HeyGen's upload endpoint.
export async function createTalkingPhoto(imageUrl: string): Promise<string> {
  const k = await key();
  const img = await fetch(imageUrl);
  if (!img.ok) throw new Error(`Could not fetch hero image (${img.status})`);
  const ct = (img.headers.get("content-type") || "").toLowerCase();
  const contentType = ct.includes("png") ? "image/png" : "image/jpeg";
  const bytes = Buffer.from(await img.arrayBuffer());

  const res = await fetch(`${UPLOAD}/v1/talking_photo`, {
    method: "POST",
    headers: { "x-api-key": k, "Content-Type": contentType },
    body: bytes,
  });
  const data = (await res.json().catch(() => ({}))) as { code?: number; data?: { talking_photo_id?: string }; message?: string; msg?: string };
  const id = data?.data?.talking_photo_id;
  if (!id) throw new Error(`No talking_photo_id (${res.status}): ${(data.message || data.msg || JSON.stringify(data)).slice(0, 180)}`);
  return id;
}
