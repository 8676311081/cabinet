import fs from "fs/promises";
import path from "path";

const REPO_OWNER = "hilash";
const REPO_NAME = "cabinets";
const API_BASE = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents`;

interface GitHubEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  download_url: string | null;
}

async function ghFetch(url: string): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Cabinet-App",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(url, { headers });
}

async function listDirectory(repoPath: string): Promise<GitHubEntry[]> {
  const res = await ghFetch(`${API_BASE}/${repoPath}`);
  if (!res.ok) throw new Error(`GitHub API error ${res.status}: ${repoPath}`);
  return res.json();
}

async function downloadFile(downloadUrl: string): Promise<string> {
  const res = await fetch(downloadUrl);
  if (!res.ok) throw new Error(`Download failed: ${downloadUrl}`);
  return res.text();
}

/**
 * Recursively download a directory from the cabinets registry repo
 * and write it to a local target directory.
 */
export async function downloadRegistryTemplate(
  slug: string,
  targetDir: string
): Promise<void> {
  await downloadDirectory(slug, targetDir);
}

async function downloadDirectory(
  repoPath: string,
  localDir: string
): Promise<void> {
  await fs.mkdir(localDir, { recursive: true });

  const entries = await listDirectory(repoPath);

  for (const entry of entries) {
    const localPath = path.join(localDir, entry.name);

    if (entry.type === "dir") {
      await downloadDirectory(entry.path, localPath);
    } else if (entry.type === "file" && entry.download_url) {
      const content = await downloadFile(entry.download_url);
      await fs.writeFile(localPath, content, "utf-8");
    }
  }
}
