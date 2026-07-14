import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The texture pass (lib/texture.ts) shells out to the real ffmpeg binary, so keep ffmpeg-static OUT of the
  // bundler (it ships a native binary, not JS) and make sure file tracing copies that binary into the Inngest
  // function - the only route that runs it.
  // Native binaries: keep them out of the bundler, and keep them in SEPARATE functions. ffmpeg (77MB) is
  // traced only into /api/inngest; Chromium (67MB) only into the Studio render lane. Together in one function
  // they would blow Vercel's 250MB limit.
  serverExternalPackages: ["ffmpeg-static", "@sparticuz/chromium", "playwright-core"],
  outputFileTracingIncludes: {
    "/api/inngest": ["./node_modules/ffmpeg-static/ffmpeg"],
    // Chromium ships its BROWSER as brotli data files (bin/chromium.br, fonts, swiftshader). Nothing
    // statically imports them, so the tracer cannot infer them - they have to be named, or the require
    // fails at cold start and the route returns an HTML error page instead of JSON. Scoped to the produce
    // function only: 67MB has no business riding along in every other route.
    "/api/studio/campaign/produce": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
  images: {
    // Let the image optimiser fetch + downsize hero images from our two known hosts so the
    // home-page cards serve small fast WebP instead of full-resolution source. Scoped hosts,
    // so no open SSRF surface.
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "d8j0ntlcm91z4.cloudfront.net" },
    ],
    qualities: [75], // Next 16 only allows qualities listed here; the cards request q=75
  },
};

export default nextConfig;
