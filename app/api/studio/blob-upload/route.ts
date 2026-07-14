import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { auth } from "@/auth";

// DIRECT-TO-BLOB UPLOAD (the signer).
//
// A Vercel serverless function's request body is capped at ~4.5MB. Fonts and logos slip under it, but a
// full-resolution 1:1 design export does not - so posting the file THROUGH our API failed before a single
// line of our code ran ("failed to upload masthead"). This route never receives the file: it only signs a
// short-lived token, and the browser then uploads straight to Blob storage. File size stops being a limit.
//
// The upload is still gated: we check the session BEFORE issuing a token, so an anonymous caller can't get
// one. The client registers the finished blob with /api/studio/register, which is where the DB row and the
// dimension-read happen.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          "image/png", "image/jpeg", "image/webp", "image/svg+xml",
          "application/pdf",
          "font/woff2", "font/woff", "font/otf", "font/ttf",
          "application/octet-stream", // browsers often send this for .otf/.ttf
        ],
        maximumSizeInBytes: 100 * 1024 * 1024, // a design export, not a film
        addRandomSuffix: true,
      }),
      // Fires server-side when the browser finishes. We deliberately do NOT write the DB row here: on
      // localhost this callback can't be reached, and a silent failure would leave an orphan blob. The
      // client calls /api/studio/register explicitly instead, so the row is always written.
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 400 });
  }
}
