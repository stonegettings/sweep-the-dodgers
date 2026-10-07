import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { siteUrl as siteUrlFn } from "@/lib/site";

// Absolute base for link-preview images, so iMessage, X and Slack can fetch them.
const siteUrl = siteUrlFn();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Sweep the Dodgers",
  description: "Build a 16-man roster from baseball history and try to sweep the two-time champs.",
  openGraph: {
    title: "Sweep the Dodgers",
    description: "The champs are going for three straight. Build a 16-man roster from baseball history and try to beat them four straight.",
  },
};

export const viewport: Viewport = { themeColor: "#173a2c" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@600;800;900&family=Barlow:wght@400;500;600&display=swap"
        />
      </head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
