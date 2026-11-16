import React from "react";
import { Lora, Raleway, Fira_Code, Noto_Sans_Tagalog } from "next/font/google";
import type { Metadata } from "next";
import "@gunita/ui/styles.css";
import "./globals.css";

const lora = Lora({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-lora", display: "swap" });
const raleway = Raleway({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-raleway", display: "swap" });
const fira = Fira_Code({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-fira", display: "swap" });
const tagalog = Noto_Sans_Tagalog({ subsets: ["tagalog"], weight: ["400"], variable: "--font-tagalog", display: "swap" });

const fontVars = [lora, raleway, fira, tagalog].map((f) => f.variable).join(" ");

export const metadata: Metadata = {
  title: "Gunita Kopi | Admin Portal",
  description: "Private administration portal for Gunita Kopi Owner",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={fontVars}>
      <body className="owner-mode">
        {children}
      </body>
    </html>
  );
}
