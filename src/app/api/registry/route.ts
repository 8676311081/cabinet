import { NextResponse } from "next/server";
import { REGISTRY_TEMPLATES } from "@/lib/registry/registry-manifest";

export async function GET() {
  return NextResponse.json({ templates: REGISTRY_TEMPLATES });
}
