import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { IconSprite } from "@/components/Icon";
import "./styles/tokens.css";
import "./styles/shell.css";
import "./styles/pages.css";

// Self-hosted at build time — no runtime dependency on Google Fonts, no silent fallback to system fonts.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800"],
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
