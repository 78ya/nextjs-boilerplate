import type { NextRequest } from "next/server";
import { proxyRequest, runtime, dynamic } from "../../../_proxy/transparentProxy";

export { runtime, dynamic };

// Backwards-compatible proxy endpoint (internal use / debugging only).
// Proxies /api/proxy/<path> to UPSTREAM_BASE_URL/<path>.
export async function GET(req: NextRequest) {
  return proxyRequest(req, { stripPrefix: "/api/proxy" });
}
export async function POST(req: NextRequest) {
  return proxyRequest(req, { stripPrefix: "/api/proxy" });
}
export async function PUT(req: NextRequest) {
  return proxyRequest(req, { stripPrefix: "/api/proxy" });
}
export async function PATCH(req: NextRequest) {
  return proxyRequest(req, { stripPrefix: "/api/proxy" });
}
export async function DELETE(req: NextRequest) {
  return proxyRequest(req, { stripPrefix: "/api/proxy" });
}
export async function HEAD(req: NextRequest) {
  return proxyRequest(req, { stripPrefix: "/api/proxy" });
}
export async function OPTIONS(req: NextRequest) {
  return proxyRequest(req, { stripPrefix: "/api/proxy" });
}


