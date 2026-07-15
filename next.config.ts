import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The texture pass (lib/texture.ts) shells out to the real ffmpeg binary, so keep ffmpeg-static OUT of the
  // bundler (it ships a native binary, not JS) and make sure file tracing copies that binary into the Inngest
  // function - the only route that runs it.
  // Native binaries: keep them out of the bundler, and keep them in SEPARATE functions. ffmpeg (77MB) is
  // traced only into /api/inngest; Chromium (67MB) only into the Studio render lane. Together in one function
  // they would blow Vercel's 250MB limit.
  serverExternalPackages: ["ffmpeg-static", "@sparticuz/chromium", "puppeteer-core"],
  outputFileTracingIncludes: {
    "/api/inngest": ["./node_modules/ffmpeg-static/ffmpeg"],
    // THE RENDER LANE. Both of these packages read DATA files at runtime that nothing statically imports,
    // so Next's tracer cannot infer them and silently ships a function that dies on first use:
    //   - @sparticuz/chromium keeps the browser itself as brotli blobs (bin/chromium.br, fonts, swiftshader)
    //   - the browser driver reads data files via dynamic require. This bit us as
    //     "Cannot find module /var/task/node_modules/playwright-core/browsers.json", a blank HTML 500.
    //     (We are on puppeteer-core now - see lib/studio-render.ts for why - but the same trap applies.)
    // Scoped to the produce function only - 80MB has no business riding along in every other route.
    // Every route that TYPESETS (headline overlay, etc.) via Chromium needs the browser traced in, or the
    // render silently fails and the reference's baked copy shows through - which is exactly why the builder's
    // sliders were coming back un-themed ("Deals Made for Your FYP" instead of the campaign headline).
    "/api/studio/campaign/produce": ["./node_modules/@sparticuz/chromium/bin/**", "./node_modules/puppeteer-core/**"],
    "/api/studio/build": ["./node_modules/@sparticuz/chromium/bin/**", "./node_modules/puppeteer-core/**"],
    "/api/studio/build-all": ["./node_modules/@sparticuz/chromium/bin/**", "./node_modules/puppeteer-core/**"],
    "/api/studio/momo-set": ["./node_modules/@sparticuz/chromium/bin/**", "./node_modules/puppeteer-core/**"],
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
