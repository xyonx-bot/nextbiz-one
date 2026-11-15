import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { IconSprite } from "@/components/Icon";
import "./styles/tokens.css";
import "./styles/shell.css";
import "./styles/pages.css";

// Self-hosted variable font (weights 200–800, OFL) shipped in the repo — builds never depend on Google Fonts
// being reachable (next/font/google broke the container build when Google's CSS response changed).
const jakarta = localFont({
  src: "./fonts/PlusJakartaSans-latin.woff2",
  weight: "200 800",
  style: "normal",
  variable: "--font-jakarta",
  display: "swap",
});

const SITE = process.env.PUBLIC_URL ?? "https://one.nextbizstudio.com";
export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "NextBiz One",
  description: "WhatsApp, Instagram & Meta Ads — one inbox for your business.",
  icons: { icon: "/logo.png" },
  // link previews in WhatsApp / Slack / LinkedIn / X
  openGraph: { type: "website", siteName: "NextBiz One", title: "NextBiz One — every customer, answered.", description: "WhatsApp, Instagram & Meta Ads — one inbox for your business.",
    images: [{ url: "/art/og.jpg", width: 1200, height: 630, alt: "NextBiz One — every customer, answered." }] },
  twitter: { card: "summary_large_image", title: "NextBiz One — every customer, answered.", description: "WhatsApp, Instagram & Meta Ads — one inbox for your business.", images: ["/art/og.jpg"] },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#F7F3EB" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body>
        <IconSprite />
        {children}
      </body>
    </html>
  );
}
