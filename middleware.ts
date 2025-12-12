import { NextResponse, type NextRequest } from "next/server";

/**
 * Transparent reverse-proxy switch.
 *
 * When PROXY_MODE=1, rewrite all requests to /api/proxy/* so that the browser
 * keeps using the IP/host, while the server fetches from UPSTREAM_BASE_URL.
 */
export function middleware(req: NextRequest) {
  if (process.env.PROXY_MODE !== "1") return NextResponse.next();

  const { pathname, search } = req.nextUrl;

  // Prevent loop: do not rewrite the proxy endpoint itself.
  if (pathname.startsWith("/api/proxy")) return NextResponse.next();

  const rewriteUrl = req.nextUrl.clone();
  rewriteUrl.pathname = `/api/proxy${pathname}`;
  rewriteUrl.search = search;

  return NextResponse.rewrite(rewriteUrl);
}

export const config = {
  // Apply to all paths. The middleware itself early-returns when PROXY_MODE!=1
  // or when the request already targets /api/proxy.
  matcher: "/:path*",
};


