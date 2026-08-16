import type { Metadata } from "next";
import Contact from "@/components/contact";
import { BRAND, SITE_URL, CONTACT_EMAIL, CONTACT_PHONE } from "@/lib/site";

const TITLE = `Contact — ${BRAND.name}`;
const DESCRIPTION =
  "Talk to us about the gaps in your Google Business Profile — review, photo, category and attribute work. Email or call.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/contact" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/contact",
    siteName: BRAND.name,
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: BRAND.name }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/og.png"] },
};

export default function ContactPage() {
  return (
    <>
      {/* Rendered server-side so crawlers that don't execute JS still read it. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ContactPage",
            name: TITLE,
            url: `${SITE_URL}/contact`,
            mainEntity: {
              "@type": "Organization",
              name: BRAND.name,
              url: SITE_URL,
              email: CONTACT_EMAIL,
              telephone: CONTACT_PHONE,
              contactPoint: [
                {
                  "@type": "ContactPoint",
                  contactType: "customer support",
                  email: CONTACT_EMAIL,
                  telephone: CONTACT_PHONE,
                  availableLanguage: ["en", "hi"],
                },
              ],
            },
          }),
        }}
      />
      <Contact />
    </>
  );
}
