import { Big_Shoulders, Roboto, Roboto_Mono } from "next/font/google";
import Script from "next/script";
import { THEME_INIT } from "@/lib/themes";
import "./globals.css";

// Tall heavy caps for names, headings and labels; Roboto for prose; Roboto Mono for figures, dates and codes.
const shoulders = Big_Shoulders({ subsets: ["latin"], weight: "variable", axes: ["opsz"], variable: "--font-shoulders", display: "swap" });
const roboto = Roboto({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-roboto", display: "swap" });
const mono = Roboto_Mono({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-roboto-mono", display: "swap" });

export const metadata = {
  title: "Snackible CRM",
  description: "Everything we know about each B2B client, and what they buy.",
};

export const viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="safelight" className={`${shoulders.variable} ${roboto.variable} ${mono.variable}`} suppressHydrationWarning>
      <body>
        <Script id="theme-init" strategy="beforeInteractive">{THEME_INIT}</Script>
        {children}
      </body>
    </html>
  );
}
