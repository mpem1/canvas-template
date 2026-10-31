import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PageForge Studio — Web Desktop Publishing",
  description:
    "A Scribus-inspired web desktop publishing studio: custom page sizes, text & image frames, alignment and equal-spacing tools, multi-page documents, and PDF/PNG export.",
  keywords: [
    "desktop publishing",
    "page layout",
    "Scribus",
    "poster designer",
    "flyer maker",
    "PDF export",
  ],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

const WEB_FONTS_CSS =
  "https://fonts.googleapis.com/css2?family=Anton&family=Bebas+Neue&family=DM+Sans:wght@400;500;700&family=Inter:wght@400;500;600;700&family=Lora:ital,wght@0,400;0,600;1,400&family=Merriweather:wght@400;700&family=Oswald:wght@400;500;600&family=Playfair+Display:ital,wght@0,400;0,600;0,800;1,400&display=swap";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* loaded via CDN so the user's browser fetches them at runtime */}
        <link rel="stylesheet" href={WEB_FONTS_CSS} />
        {children}
        <Toaster position="bottom-center" richColors />
      </body>
    </html>
  );
}
