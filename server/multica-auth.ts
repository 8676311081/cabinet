import fs from "fs";
import path from "path";

export function getMulticaPatFile(dataDir: string): string {
  return path.join(dataDir, ".agents", ".config", "multica-pat.json");
}

export function getMulticaWorkspaceIdFile(dataDir: string): string {
  return path.join(dataDir, ".agents", ".telegram", "workspace-id.txt");
}

export function readMulticaPATFile(filePath: string): string {
  try {
    if (!fs.existsSync(filePath)) return "";
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as { token?: unknown };
    return typeof data.token === "string" ? data.token.trim() : "";
  } catch {
    return "";
  }
}

// Prefer the file over process.env.MULTICA_PAT: the file is rewritten on every
// multica-server start, while env may be stale after a restart. Mirrors the
// fresh value back to env for downstream callers that still read from there.
export function readMulticaPAT(dataDir: string): string {
  const fromFile = readMulticaPATFile(getMulticaPatFile(dataDir));
  if (fromFile) {
    process.env.MULTICA_PAT = fromFile;
    return fromFile;
  }

  const envPat = process.env.MULTICA_PAT?.trim();
  return envPat || "";
}

export function readMulticaWorkspaceId(dataDir: string): string {
  try {
    const filePath = getMulticaWorkspaceIdFile(dataDir);
    if (!fs.existsSync(filePath)) return "";
    return fs.readFileSync(filePath, "utf-8").trim();
  } catch {
    return "";
  }
}
