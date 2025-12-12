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
  const raw = process.env.UPSTREAM_BASE_URL;
  if (!raw) {
    throw new Error(
      "Missing env UPSTREAM_BASE_URL, e.g. https://example.com (no trailing path).",
    );
  }
  return new URL(raw);
}

function joinPathname(basePathname: string, appendPathname: string) {
  const base = basePathname.endsWith("/") ? basePathname.slice(0, -1) : basePathname;
  const append = appendPathname.startsWith("/") ? appendPathname : `/${appendPathname}`;
  return `${base}${append}` || "/";
}

function buildUpstreamUrl(req: NextRequest, upstreamBase: URL) {
  // Preserve the incoming pathname as-is (avoid re-encoding / decoding surprises).
  // Current request is /api/proxy/<originalPath>.
  const prefix = "/api/proxy";
  const incomingPath = req.nextUrl.pathname.startsWith(prefix)
    ? req.nextUrl.pathname.slice(prefix.length) || "/"
    : req.nextUrl.pathname;

  const upstreamUrl = new URL(upstreamBase);
  upstreamUrl.pathname = joinPathname(upstreamUrl.pathname || "/", incomingPath);
  upstreamUrl.search = req.nextUrl.search;
  return upstreamUrl;
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
    // If redirect points to upstream origin, rewrite it back to our origin
    // so the browser keeps using the IP/host.
    if (locUrl.origin === upstreamBase.origin) {
      return `${publicOrigin}${locUrl.pathname}${locUrl.search}${locUrl.hash}`;
    }
    return location;
  } catch {
    return location;
  }
}

function maybeRewriteSetCookieDomain(
  setCookie: string,
  upstreamHost: string,
): string {
  if (process.env.PROXY_REWRITE_COOKIE_DOMAIN !== "1") return setCookie;

  // Remove `Domain=upstreamHost` (or `.upstreamHost`) so it becomes host-only.
  // Note: this is a best-effort string rewrite.
  const domainRegex = new RegExp(
    String.raw`;\s*Domain=\.?${upstreamHost.replaceAll(".", "\\.")}\s*`,
    "i",
  );
  return setCookie.replace(domainRegex, "; ");
}

async function proxy(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  const upstreamBase = getUpstreamBaseUrl();
  // Access params to satisfy Next's route signature, but do not use them for
  // URL construction to avoid losing raw pathname fidelity.
  await ctx.params;

  const upstreamUrl = buildUpstreamUrl(req, upstreamBase);

  const headers = copyRequestHeaders(req, upstreamBase.host);
  const method = req.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : req.body;

  const upstreamRes = await fetch(upstreamUrl, {
    method,
    headers,
    body,
    redirect: "manual",
    // Needed by Node fetch when a ReadableStream body is provided.
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
    if (key === "location") continue; // handled below
    if (key === "set-cookie") continue; // handled below
    resHeaders.set(k, v);
  }

  const publicOrigin = req.nextUrl.origin;
  const location = upstreamRes.headers.get("location");
  if (location) {
    resHeaders.set(
      "location",
      rewriteLocationHeader(location, upstreamBase, publicOrigin),
    );
  }

  // Preserve multi Set-Cookie values if available (undici/next supports getSetCookie()).
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

export async function GET(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  return proxy(req, ctx);
}
export async function POST(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  return proxy(req, ctx);
}
export async function PUT(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  return proxy(req, ctx);
}
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  return proxy(req, ctx);
}
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  return proxy(req, ctx);
}
export async function HEAD(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  return proxy(req, ctx);
}
export async function OPTIONS(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  return proxy(req, ctx);
}


