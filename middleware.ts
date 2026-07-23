import { NextRequest, NextResponse } from "next/server";
import { locales, defaultLocale } from "./lib/config";

// Redirect the bare "/" (and any path missing a locale prefix) to a localized route.
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const hasLocale = locales.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)
  );
  if (hasLocale) return NextResponse.next();

  // Pick preferred locale from the Accept-Language header, otherwise the default.
  const accept = request.headers.get("accept-language")?.toLowerCase() ?? "";
  const preferred = accept.startsWith("en") ? "en" : defaultLocale;

  const url = request.nextUrl.clone();
  url.pathname = `/${preferred}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Skip Next internals, API routes and static files.
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
