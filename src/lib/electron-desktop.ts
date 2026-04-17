import type { StorageAdapter } from "@multica/core/types";

export interface MulticaFetchRequest {
  path: string;
  method?: string;
  headers?: Record<string, string>;
  bodyBase64?: string | null;
}

export interface MulticaFetchResponse {
  status: number;
  headers: Array<[string, string]>;
  bodyBase64: string | null;
}

interface CabinetDesktopBridge {
  runtime?: string;
  multicaWsUrl?: string | null;
  multicaFetch?: (request: MulticaFetchRequest) => Promise<MulticaFetchResponse>;
}

declare global {
  interface Window {
    CabinetDesktop?: CabinetDesktopBridge;
  }
}

const ELECTRON_MANAGED_MULTICA_TOKEN = "electron-managed";
let electronManagedSessionActive = true;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToUint8Array(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function normalizeBrowserPath(path: string): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (
    normalized === "/multica-api" ||
    normalized.startsWith("/multica-api/") ||
    normalized === "/multica-auth" ||
    normalized.startsWith("/multica-auth/")
  ) {
    return normalized;
  }

  const prefix = normalized === "/auth" || normalized.startsWith("/auth/")
    ? "/multica-auth"
    : "/multica-api";
  return `${prefix}${normalized}`;
}

export function getCabinetDesktop(): CabinetDesktopBridge | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.CabinetDesktop ?? null;
}

export function isElectronDesktop(): boolean {
  return getCabinetDesktop()?.runtime === "electron";
}

export function primeElectronMulticaSession(): string {
  if (isElectronDesktop()) {
    electronManagedSessionActive = true;
    return ELECTRON_MANAGED_MULTICA_TOKEN;
  }
  return process.env.NEXT_PUBLIC_MULTICA_PAT || "";
}

export function getStoredMulticaWorkspaceId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return localStorage.getItem("multica_workspace_id");
}

export const multicaStorage: StorageAdapter = {
  getItem: (key) => {
    if (typeof window === "undefined") {
      return null;
    }
    if (key === "multica_token" && isElectronDesktop()) {
      return electronManagedSessionActive ? ELECTRON_MANAGED_MULTICA_TOKEN : null;
    }
    return localStorage.getItem(key);
  },
  setItem: (key, value) => {
    if (typeof window === "undefined") {
      return;
    }
    if (key === "multica_token" && isElectronDesktop()) {
      electronManagedSessionActive = true;
      return;
    }
    localStorage.setItem(key, value);
  },
  removeItem: (key) => {
    if (typeof window === "undefined") {
      return;
    }
    if (key === "multica_token" && isElectronDesktop()) {
      electronManagedSessionActive = false;
      return;
    }
    localStorage.removeItem(key);
  },
};

export async function multicaFetch(path: string, init?: RequestInit): Promise<Response> {
  const browserPath = normalizeBrowserPath(path);
  const desktop = getCabinetDesktop();

  if (!desktop?.multicaFetch) {
    return fetch(browserPath, init);
  }

  const request = new Request(browserPath, init);
  const method = request.method.toUpperCase();
  const url = new URL(request.url, window.location.href);
  const headers = Object.fromEntries(request.headers.entries());

  let bodyBase64: string | null = null;
  if (method !== "GET" && method !== "HEAD") {
    const body = await request.clone().arrayBuffer();
    if (body.byteLength > 0) {
      bodyBase64 = arrayBufferToBase64(body);
    }
  }

  const response = await desktop.multicaFetch({
    path: `${url.pathname}${url.search}`,
    method,
    headers,
    bodyBase64,
  });

  return new Response(
    response.bodyBase64 ? new Uint8Array(Array.from(base64ToUint8Array(response.bodyBase64))) : null,
    {
      status: response.status,
      headers: response.headers,
    }
  );
}
