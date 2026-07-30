import Script from "next/script";

// Google Analytics 4 measurement ID. GA IDs are public (they ship in the page
// HTML), so it is safe to keep here. Override with NEXT_PUBLIC_GA_ID if needed.
const GA_ID = process.env.NEXT_PUBLIC_GA_ID || "G-L0CT34EMBE";

/**
 * Loads Google Analytics 4 (gtag.js) after the page becomes interactive.
 * Rendered only in production so local development never pollutes the
 * analytics property with test traffic.
 */
export function Analytics() {
  if (process.env.NODE_ENV !== "production" || !GA_ID) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
      </Script>
    </>
  );
}
