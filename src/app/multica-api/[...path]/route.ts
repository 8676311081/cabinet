import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function multicaBaseUrl(): string {
  return (process.env.MULTICA_API_URL || "http://localhost:8080").replace(/\/+$/, "");
}

function copyHeaders(req: NextRequest): Headers {
  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("content-length");
  return headers;
}

async function proxyRequest(req: NextRequest, pathSegments: string[]): Promise<NextResponse> {
  const baseUrl = multicaBaseUrl();
  const joined = pathSegments.join("/");
  const normalized = joined.replace(/^\/+/, "");
  const pathname =
    normalized === "health"
      ? "/health"
      : normalized.startsWith("auth/") || normalized === "auth"
        ? `/${normalized}`
        : normalized.startsWith("api/") || normalized === "api"
          ? `/${normalized}`
          : `/api/${normalized}`;
  const target = `${baseUrl}${pathname}${req.nextUrl.search}`;

  const method = req.method.toUpperCase();
  const init: RequestInit = {
    method,
    headers: copyHeaders(req),
    redirect: "manual",
    cache: "no-store",
  };

  if (method !== "GET" && method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }

  try {
    const upstream = await fetch(target, init);
    const headers = new Headers(upstream.headers);
    headers.delete("content-encoding");
    headers.delete("content-length");

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upstream unavailable";
    console.error("[multica-api] proxy failed", {
      method,
      target,
      message,
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params;
  return proxyRequest(req, path || []);
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params;
  return proxyRequest(req, path || []);
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params;
  return proxyRequest(req, path || []);
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params;
  return proxyRequest(req, path || []);
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params;
  return proxyRequest(req, path || []);
}

export async function OPTIONS(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params;
  return proxyRequest(req, path || []);
}
