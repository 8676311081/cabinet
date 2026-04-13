import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import {
  DATA_DIR,
  resolveContentPath,
  sanitizeFilename,
} from "@/lib/storage/path-utils";
import { downloadRegistryTemplate } from "@/lib/registry/github-fetch";
import { REGISTRY_TEMPLATES } from "@/lib/registry/registry-manifest";

interface ImportRequest {
  slug: string;
  targetPath?: string;
  name?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ImportRequest;
    const { slug, targetPath = "" } = body;

    if (!slug) {
      return NextResponse.json(
        { error: "Template slug is required" },
        { status: 400 }
      );
    }

    // Verify the template exists in our manifest
    const template = REGISTRY_TEMPLATES.find((t) => t.slug === slug);
    if (!template) {
      return NextResponse.json(
        { error: `Unknown template: ${slug}` },
        { status: 404 }
      );
    }

    // Determine target directory
    const dirName = body.name ? sanitizeFilename(body.name) : slug;
    const virtualPath = targetPath ? `${targetPath}/${dirName}` : dirName;
    const targetDir = resolveContentPath(virtualPath);

    // Check if already exists
    try {
      await fs.access(targetDir);
      return NextResponse.json(
        { error: `Directory "${dirName}" already exists` },
        { status: 409 }
      );
    } catch {
      // Good
    }

    // Download template from GitHub
    await downloadRegistryTemplate(slug, targetDir);

    // Ensure .cabinet-state exists
    await fs
      .mkdir(path.join(targetDir, ".cabinet-state"), { recursive: true })
      .catch(() => {});

    return NextResponse.json(
      {
        ok: true,
        path: virtualPath,
        name: template.name,
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Import failed: ${message}` },
      { status: 500 }
    );
  }
}
