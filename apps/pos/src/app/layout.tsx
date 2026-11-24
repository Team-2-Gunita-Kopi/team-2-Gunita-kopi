import React from "react";
import { Lora, Raleway, Noto_Sans_Tagalog } from "next/font/google";
import localFont from "next/font/local";
import type { Metadata, Viewport } from "next";
import "@gunita/ui/styles.css";
import "./globals.css";

const lora = Lora({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-lora", display: "swap" });
const raleway = Raleway({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-raleway", display: "swap" });
// Fira Code v6.2 (SIL OFL 1.1, github.com/tonsky/FiraCode) bundled locally: a failed Google Fonts
// download at dev start left every number in the fallback font.
const fira = localFont({ src: "./fonts/FiraCode-VF.woff2", weight: "300 700", variable: "--font-fira", display: "swap" });
const tagalog = Noto_Sans_Tagalog({ subsets: ["tagalog"], weight: ["400"], variable: "--font-tagalog", display: "swap" });

const fontVars = [lora, raleway, fira, tagalog].map((f) => f.variable).join(" ");

export const metadata: Metadata = {
  title: "Gunita Kopi | POS Terminal",
  description: "Private offline-first Point of Sale for Gunita Kopi Baristas",
  manifest: "/manifest.webmanifest",
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#0F1410",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={fontVars} suppressHydrationWarning>
      <body className="staff-mode" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
