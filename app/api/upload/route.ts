import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { auth } from "@/auth";

// Client-side direct upload to Vercel Blob. This issues a short-lived upload token
// so the browser uploads straight to Blob, bypassing the 4.5MB serverless request
// body limit (large PNGs etc. now work). Auth is checked before the token is issued.
export async function POST(req: Request) {
  const body = (await req.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => {
        const session = await auth();
        if (!session?.user) throw new Error("Unauthorized");
        return {
          allowedContentTypes: [
            "image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "image/avif",
            // Voice samples (clone your own voice).
            "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/x-m4a", "audio/mp4", "audio/aac", "audio/ogg", "audio/webm",
            // End-card clips (End Cards library).
            "video/mp4", "video/quicktime", "video/webm",
          ],
          maximumSizeInBytes: 60 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => { /* no-op */ },
    });
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 400 });
  }
}
