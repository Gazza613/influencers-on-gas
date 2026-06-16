import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import HardRefreshGate from "@/components/HardRefreshGate";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Influencers on GAS",
  description: "GAS Marketing's AI influencer video studio.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        {/* Re-gate on hard refresh BEFORE paint: a reload of any signed-in page
            jumps straight to /login (via /api/relogin which clears the session),
            with no flash of the current page. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=(performance&&performance.navigation&&performance.navigation.type);var r=(t===1);if(!r&&performance.getEntriesByType){var e=performance.getEntriesByType('navigation')[0];r=!!(e&&e.type==='reload');}var p=location.pathname;if(r&&p!=='/login'&&p.lastIndexOf('/api/',0)!==0){location.replace('/api/relogin');}}catch(_){}})();",
          }}
        />
      </head>
      <body className="min-h-full">
        <HardRefreshGate />
        {children}
      </body>
    </html>
  );
}
