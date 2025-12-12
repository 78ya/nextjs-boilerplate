import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOP_BY_HOP_REQUEST_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

const HOP_BY_HOP_RESPONSE_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function getUpstreamBaseUrl(): URL {
  // Hardcoded upstream (per requirement)
  return new URL("http://182.92.3.138/");
}

function joinPathname(basePathname: string, appendPathname: string) {
  const base = basePathname.endsWith("/") ? basePathname.slice(0, -1) : basePathname;
  const append = appendPathname.startsWith("/") ? appendPathname : `/${appendPathname}`;
  return `${base}${append}` || "/";
}

function copyRequestHeaders(req: NextRequest, upstreamHost: string) {
  const headers = new Headers();
  for (const [k, v] of req.headers.entries()) {
    const key = k.toLowerCase();
    if (HOP_BY_HOP_REQUEST_HEADERS.has(key)) continue;
    // Let fetch/undici manage compression.
    if (key === "accept-encoding") continue;
    headers.set(k, v);
  }

  headers.set("host", upstreamHost);

  // Forwarding chain hints
  headers.set("x-forwarded-host", req.headers.get("host") ?? "");
  headers.set("x-forwarded-proto", req.nextUrl.protocol.replace(":", ""));
  headers.set("x-forwarded-for", req.headers.get("x-forwarded-for") ?? "");

  return headers;
}

function rewriteLocationHeader(
  location: string,
  upstreamBase: URL,
  publicOrigin: string,
) {
  try {
    const locUrl = new URL(location, upstreamBase);
    if (locUrl.origin === upstreamBase.origin) {
      return `${publicOrigin}${locUrl.pathname}${locUrl.search}${locUrl.hash}`;
    }
    return location;
  } catch {
    return location;
  }
}

function maybeRewriteSetCookieDomain(setCookie: string, upstreamHost: string): string {
  if (process.env.PROXY_REWRITE_COOKIE_DOMAIN !== "1") return setCookie;

  const domainRegex = new RegExp(
    String.raw`;\s*Domain=\.?${upstreamHost.replaceAll(".", "\\.")}\s*`,
    "i",
  );
  return setCookie.replace(domainRegex, "; ");
}

export async function proxyRequest(
  req: NextRequest,
  opts?: { stripPrefix?: string },
) {
  const upstreamBase = getUpstreamBaseUrl();
  const stripPrefix = opts?.stripPrefix ?? "";

  const incomingPath = stripPrefix && req.nextUrl.pathname.startsWith(stripPrefix)
    ? req.nextUrl.pathname.slice(stripPrefix.length) || "/"
    : req.nextUrl.pathname;

  const upstreamUrl = new URL(upstreamBase);
  upstreamUrl.pathname = joinPathname(upstreamUrl.pathname || "/", incomingPath);
  upstreamUrl.search = req.nextUrl.search;

  const headers = copyRequestHeaders(req, upstreamBase.host);
  const method = req.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : req.body;

  const upstreamRes = await fetch(upstreamUrl, {
    method,
    headers,
    body,
    redirect: "manual",
    ...(body ? ({ duplex: "half" } as const) : {}),
  });

  const resHeaders = new Headers();
  // Debug helpers (safe to remove later)
  resHeaders.set("x-proxy-upstream", upstreamUrl.toString());
  resHeaders.set("x-proxy-status", String(upstreamRes.status));

  for (const [k, v] of upstreamRes.headers.entries()) {
    const key = k.toLowerCase();
    if (HOP_BY_HOP_RESPONSE_HEADERS.has(key)) continue;
    if (key === "content-length") continue;
    if (key === "location") continue;
    if (key === "set-cookie") continue;
    resHeaders.set(k, v);
  }

  const publicOrigin = req.nextUrl.origin;
  const location = upstreamRes.headers.get("location");
  if (location) {
    resHeaders.set("location", rewriteLocationHeader(location, upstreamBase, publicOrigin));
  }

  const getSetCookie = (upstreamRes.headers as unknown as { getSetCookie?: () => string[] })
    .getSetCookie;
  const setCookies = getSetCookie ? getSetCookie() : [];
  if (setCookies.length) {
    for (const sc of setCookies) {
      resHeaders.append(
        "set-cookie",
        maybeRewriteSetCookieDomain(sc, upstreamBase.hostname),
      );
    }
  } else {
    const sc = upstreamRes.headers.get("set-cookie");
    if (sc) {
      resHeaders.append(
        "set-cookie",
        maybeRewriteSetCookieDomain(sc, upstreamBase.hostname),
      );
    }
  }

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    statusText: upstreamRes.statusText,
    headers: resHeaders,
  });
}


