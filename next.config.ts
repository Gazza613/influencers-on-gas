import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The texture pass (lib/texture.ts) shells out to the real ffmpeg binary, so keep ffmpeg-static OUT of the
  // bundler (it ships a native binary, not JS) and make sure file tracing copies that binary into the Inngest
  // function - the only route that runs it.
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/inngest": ["./node_modules/ffmpeg-static/ffmpeg"],
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
