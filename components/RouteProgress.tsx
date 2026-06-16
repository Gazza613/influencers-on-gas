"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Thin top progress bar on route changes, so navigation never feels frozen.
export default function RouteProgress() {
  const pathname = usePathname();
  const [width, setWidth] = useState(0);
  const [show, setShow] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; } // skip initial mount
    setShow(true); setWidth(15);
    const t1 = setTimeout(() => setWidth(70), 80);
    const t2 = setTimeout(() => setWidth(100), 420);
    const t3 = setTimeout(() => setShow(false), 700);
    const t4 = setTimeout(() => setWidth(0), 1000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [pathname]);

  return <div className="route-progress" style={{ width: `${width}%`, opacity: show ? 1 : 0 }} aria-hidden />;
}
