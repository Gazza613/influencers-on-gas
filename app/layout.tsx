import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import HardRefreshGate from "@/components/HardRefreshGate";
import RouteProgress from "@/components/RouteProgress";
import FlexToasts from "@/components/FlexToasts";
import ConfirmHost from "@/components/ConfirmHost";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Studio on GAS",
  description: "Studio on GAS - GAS Marketing's platform for campaigns, creative and market intelligence.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        {/* Re-gate on hard refresh BEFORE paint: a reload of any signed-in page clears the session
            (via /api/relogin) and lands the user on the PUBLIC LANDING PAGE, with no flash of the page they
            were on. The front door, not the login form - being dropped straight onto a password prompt read
            as "you have been kicked out" (Gary). NOTHING is carried across - no ?next=, no query string on the
            landing page - so the URL stays clean and the journey simply starts again. Skips the homepage,
            login, reset and public share links so they never needlessly bounce. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=(performance&&performance.navigation&&performance.navigation.type);var r=(t===1);if(!r&&performance.getEntriesByType){var e=performance.getEntriesByType('navigation')[0];r=!!(e&&e.type==='reload');}var p=location.pathname;if(r&&p!=='/'&&p!=='/login'&&p.lastIndexOf('/reset',0)!==0&&p.lastIndexOf('/invite',0)!==0&&p.lastIndexOf('/api/',0)!==0&&p.lastIndexOf('/s/',0)!==0){location.replace('/api/relogin');}}catch(_){}})();",
          }}
        />
      </head>
      <body className="min-h-full">
        <RouteProgress />
        <FlexToasts />
        <ConfirmHost />
        <HardRefreshGate />
        {children}
      </body>
    </html>
  );
}
