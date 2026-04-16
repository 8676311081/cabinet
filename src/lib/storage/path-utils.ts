import fs from "fs";
import path from "path";
import { getManagedDataDir, isElectronRuntime, PROJECT_ROOT } from "@/lib/runtime/runtime-config";

export const DATA_DIR = getManagedDataDir();
export const CABINET_INTERNAL_DIR = path.join(DATA_DIR, ".cabinet");
export const ROOT_INSTALL_METADATA_PATH = path.join(PROJECT_ROOT, ".cabinet-install.json");
export const DATA_INSTALL_METADATA_PATH = path.join(CABINET_INTERNAL_DIR, "install.json");
export const PROJECT_RELEASE_MANIFEST_PATH = path.join(PROJECT_ROOT, "cabinet-release.json");
export const UPDATE_STATUS_PATH = path.join(CABINET_INTERNAL_DIR, "update-status.json");
export const FILE_SCHEMA_STATE_PATH = path.join(CABINET_INTERNAL_DIR, "file-schema.json");
export const BACKUP_ROOT = isElectronRuntime()
  ? path.join(path.dirname(DATA_DIR), "cabinet-backups")
  : path.resolve(PROJECT_ROOT, "..", ".cabinet-backups", path.basename(PROJECT_ROOT));

function isWithinDirectory(baseDir: string, candidatePath: string): boolean {
  const relative = path.relative(baseDir, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveNearestRealPath(targetPath: string): string {
  let currentPath = targetPath;
  const missingSegments: string[] = [];

  while (true) {
    try {
      const realPath = fs.realpathSync(currentPath);
      return path.resolve(realPath, ...missingSegments.reverse());
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }

      const parentPath = path.dirname(currentPath);
      if (parentPath === currentPath) {
        return targetPath;
      }

      missingSegments.push(path.basename(currentPath));
      currentPath = parentPath;
    }
  }
}

export function resolveContentPath(virtualPath: string): string {
  const resolved = path.resolve(DATA_DIR, virtualPath);
  if (!isWithinDirectory(DATA_DIR, resolved)) {
    throw new Error("Path traversal detected");
  }

  try {
    const realDataDir = fs.realpathSync(DATA_DIR);
    const realResolved = resolveNearestRealPath(resolved);
    if (!isWithinDirectory(realDataDir, realResolved)) {
      throw new Error("Path traversal detected");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  return resolved;
}

export function virtualPathFromFs(fsPath: string): string {
  return fsPath.replace(DATA_DIR, "").replace(/^\//, "");
}

export function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
}

export function isMarkdownFile(name: string): boolean {
  return name.endsWith(".md");
}

const IGNORED_DIRS = new Set(["node_modules", "__pycache__", ".venv", "dist", "build", "out", "coverage"]);

export function isHiddenEntry(name: string): boolean {
  return name.startsWith(".") || IGNORED_DIRS.has(name);
}
