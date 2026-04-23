import { NextResponse, type NextRequest } from "next/server";

// Section routes that live under app/(app) — these need the Python backend
// and a local YAML vault, so they can't work on Vercel. Redirect them to the
// demo so someone who lands there gets something usable instead of a sea of
// "backend unreachable" banners.
const APP_SECTIONS = new Set([
  "septena",
  "exercise",
  "nutrition",
  "habits",
  "chores",
  "supplements",
  "cannabis",
  "caffeine",
  "health",
  "sleep",
  "body",
  "insights",
  "groceries",
  "weather",
  "calendar",
  "air",
  "gut",
  "data",
  "settings",
  "test",
  "timeline",
]);

export function middleware(req: NextRequest) {
  if (!process.env.VERCEL) return NextResponse.next();

  const { pathname } = req.nextUrl;
  const first = pathname.split("/", 2)[1] ?? "";
  if (!APP_SECTIONS.has(first)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = first === "septena" ? "/demo" : `/demo/${first}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next|api|demo|favicon|icon|manifest|screenshots|.*\\.).*)"],
};
