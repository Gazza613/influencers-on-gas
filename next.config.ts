import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Let the image optimiser fetch + downsize hero images from our two known hosts so the
    // home-page cards serve small fast WebP instead of full-resolution source. Scoped hosts,
    // so no open SSRF surface.
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "d8j0ntlcm91z4.cloudfront.net" },
    ],
  },
};

export default nextConfig;
