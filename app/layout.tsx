import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import { BRAND, SITE_URL } from "@/lib/site";
import "./globals.css";

// Self-hosted by next/font — no request ever leaves the visitor's browser for
// a font, which is what lets the CSP stay locked to 'self'.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["SOFT", "WONK", "opsz"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: BRAND.title,
  description: BRAND.description,
  applicationName: BRAND.name,
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
  openGraph: {
    title: BRAND.title,
    description: BRAND.description,
    url: "/",
    siteName: BRAND.name,
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: BRAND.name }],
  },
  twitter: {
    card: "summary_large_image",
    title: BRAND.title,
    description: BRAND.description,
    images: ["/og.png"],
  },
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <head>
        {/* JSON-LD in the head, not injected client-side, so crawlers that
            don't execute scripts still read it. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: BRAND.name,
              url: SITE_URL,
              applicationCategory: "BusinessApplication",
              operatingSystem: "Any",
              description: BRAND.description,
              offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
            }),
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
