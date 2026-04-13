import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import yaml from "js-yaml";
import {
  DATA_DIR,
  resolveContentPath,
  sanitizeFilename,
} from "@/lib/storage/path-utils";

interface CreateCabinetRequest {
  name: string;
  parentPath?: string;
  description?: string;
  selectedAgents?: string[];
}

const LIBRARY_DIR = path.join(DATA_DIR, ".agents", ".library");

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreateCabinetRequest;
    const { name, parentPath = "", description = "", selectedAgents = [] } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const slug = sanitizeFilename(name);
    if (!slug) {
      return NextResponse.json(
        { error: "Name must contain alphanumeric characters" },
        { status: 400 }
      );
    }

    // Resolve target directory
    const virtualPath = parentPath ? `${parentPath}/${slug}` : slug;
    const targetDir = resolveContentPath(virtualPath);

    // Check if directory already exists
    try {
      await fs.access(targetDir);
      return NextResponse.json(
        { error: `Directory "${slug}" already exists` },
        { status: 409 }
      );
    } catch {
      // Good — doesn't exist
    }

    // Create directory structure
    await fs.mkdir(targetDir, { recursive: true });
    await fs.mkdir(path.join(targetDir, ".agents"), { recursive: true });
    await fs.mkdir(path.join(targetDir, ".jobs"), { recursive: true });
    await fs.mkdir(path.join(targetDir, ".cabinet-state"), { recursive: true });

    // Determine kind based on whether it's nested
    const kind = parentPath ? "child" : "root";

    // Write .cabinet manifest
    const manifest = {
      schemaVersion: 1,
      id: `${slug}-${kind}`,
      name: name.trim(),
      kind,
      version: "0.1.0",
      description: description || `${name.trim()} cabinet.`,
      entry: "index.md",
    };
    await fs.writeFile(
      path.join(targetDir, ".cabinet"),
      yaml.dump(manifest, { lineWidth: -1 }),
      "utf-8"
    );

    // Write index.md
    const now = new Date().toISOString();
    const indexContent = [
      "---",
      `title: "${name.trim()}"`,
      `created: "${now}"`,
      `modified: "${now}"`,
      "---",
      "",
      `# ${name.trim()}`,
      "",
    ].join("\n");
    await fs.writeFile(path.join(targetDir, "index.md"), indexContent, "utf-8");

    // Copy selected agents from library
    for (const agentSlug of selectedAgents) {
      const templateDir = path.join(LIBRARY_DIR, agentSlug);
      const agentTargetDir = path.join(targetDir, ".agents", agentSlug);

      try {
        await fs.access(templateDir);
      } catch {
        continue; // Template doesn't exist, skip
      }

      try {
        await fs.access(agentTargetDir);
        continue; // Already exists
      } catch {
        // Good
      }

      await copyDir(templateDir, agentTargetDir);

      // Create standard subdirectories
      for (const subdir of ["jobs", "skills", "sessions", "memory"]) {
        await fs.mkdir(path.join(agentTargetDir, subdir), { recursive: true });
      }
    }

    return NextResponse.json(
      { ok: true, path: virtualPath, name: name.trim() },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}
