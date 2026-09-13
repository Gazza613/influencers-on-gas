"use client";

import { useRouter } from "next/navigation";

// THE STRETCHED TILE LINK, without a browser status-bar URL (Gary: hovering a pod should not flash the raw
// destination in the corner). A real <a href> always previews its href on hover, and CSS cannot hide it - so the
// tile navigates on click instead, with no href to preview. Kept fully keyboard-accessible: role="link" + Enter
// / Space, so it still behaves like the anchor it replaces.
export default function TileLink({ href, external, label }: { href: string; external?: boolean; label: string }) {
  const router = useRouter();
  const go = () => {
    if (external) window.open(href, "_blank", "noopener,noreferrer");
    else router.push(href);
  };
  return (
    <span
      role="link"
      tabIndex={0}
      aria-label={label}
      className="agn-tlink"
      onClick={go}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } }}
    />
  );
}
