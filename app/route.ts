import type { NextRequest } from "next/server";
import { proxyRequest } from "./_proxy/transparentProxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return proxyRequest(req);
}
export async function POST(req: NextRequest) {
  return proxyRequest(req);
}
export async function PUT(req: NextRequest) {
  return proxyRequest(req);
}
export async function PATCH(req: NextRequest) {
  return proxyRequest(req);
}
export async function DELETE(req: NextRequest) {
  return proxyRequest(req);
}
export async function HEAD(req: NextRequest) {
  return proxyRequest(req);
}
export async function OPTIONS(req: NextRequest) {
  return proxyRequest(req);
}


