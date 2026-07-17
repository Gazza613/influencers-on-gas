import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { auth } from "@/auth";

// DIRECT-TO-BLOB UPLOAD for BRAIN documents (the signer).
//
// Same reason as the Studio signer: a serverless function's request body caps around 4.5MB, and a research PDF
// or a deck sails past that, so the file must never travel through our API. This route only signs a short-lived
// token; the browser uploads straight to Blob. It is still gated - the session is checked BEFORE a token is
// issued, so an anonymous caller cannot get one.
//
// A separate signer from the Studio one on purpose: this allows DOCUMENT types (a brain learns from writing),
// the Studio one allows brand assets (images and fonts). Neither should quietly become a way to upload the
// other, and a client's brain material is their proprietary information (Gary) - the narrower each door, the
// better.
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
          "application/pdf",
          "text/plain", "text/markdown", "text/csv",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
          "application/octet-stream", // browsers send this for some .md / .docx
        ],
        maximumSizeInBytes: 50 * 1024 * 1024,
        addRandomSuffix: true,
      }),
      // The client registers the source explicitly (see StudioIntake for why): this callback cannot be reached
      // on localhost, and a silent failure here would leave an orphan blob nobody knows about.
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 400 });
  }
}
