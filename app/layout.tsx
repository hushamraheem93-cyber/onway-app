import "./globals.css";
import type { ReactNode } from "react";

// The <html>/<body> tags live in app/[locale]/layout.tsx so that `lang` and
// `dir` can be set per locale. This root layout is a pass-through.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
