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

export const metadata: Metadata = {
  title: "NextBiz One",
  description: "WhatsApp-first client messaging for small businesses.",
  icons: { icon: "/logo.png" },
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
