import { spawn } from "child_process";
import { NextRequest, NextResponse } from "next/server";

function isAllowedBrowserOrigin(value: string | null): boolean {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function isAllowedRequestSource(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  return isAllowedBrowserOrigin(origin) || isAllowedBrowserOrigin(referer);
}

function spawnDetached(command: string, args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const child = spawn(command, args, {
        detached: true,
        stdio: "ignore",
      });

      child.once("error", reject);
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function openTerminal(home: string): Promise<void> {
  if (process.platform === "darwin") {
    await spawnDetached("open", ["-a", "Terminal", home]);
    return;
  }

  if (process.platform === "linux") {
    const launchers = [
      ["x-terminal-emulator", ["--working-directory", home]],
      ["gnome-terminal", ["--working-directory", home]],
    ] as const;

    let lastError: unknown = null;
    for (const [command, args] of launchers) {
      try {
        await spawnDetached(command, args);
        return;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError ?? new Error("No supported terminal launcher found");
  }

  throw new Error(`Opening Terminal is not supported on ${process.platform}`);
}

export async function POST(request: NextRequest) {
  // Local-only Electron helper: keep this POST-only so setup flows can open a terminal
  // without first doing a daemon-auth round trip from the renderer.
  if (request.method !== "POST") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  if (!isAllowedRequestSource(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const home = process.env.HOME || "~";

  try {
    await openTerminal(home);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
