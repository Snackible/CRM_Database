import { Barlow_Condensed, Libre_Franklin } from "next/font/google";
import Script from "next/script";
import { THEME_INIT } from "@/lib/themes";
import "./globals.css";

const condensed = Barlow_Condensed({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-condensed", display: "swap" });
const franklin = Libre_Franklin({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-franklin", display: "swap" });

export const metadata = {
  title: "Snackible CRM",
  description: "Everything we know about each B2B client, and what they buy.",
};

export const viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="goldenrod" className={`${condensed.variable} ${franklin.variable}`} suppressHydrationWarning>
      <body>
        <Script id="theme-init" strategy="beforeInteractive">{THEME_INIT}</Script>
        {children}
      </body>
    </html>
  );
}
