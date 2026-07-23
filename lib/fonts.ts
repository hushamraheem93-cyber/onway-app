import { Cairo, Space_Grotesk, Inter } from "next/font/google";

// Arabic display + body
export const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-arabic",
  display: "swap",
});

// Latin display — techy, motion-forward, avoids the generic hero look
export const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

// Latin body
export const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

export const fontVariables = `${cairo.variable} ${spaceGrotesk.variable} ${inter.variable}`;
