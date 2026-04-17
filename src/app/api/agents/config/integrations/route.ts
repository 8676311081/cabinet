import path from "path";
import fs from "fs/promises";
import { DEFAULT_CABINET_CONFIG, type CabinetIntegrationConfig } from "@/lib/config/schema";
import { redactSecrets, restoreRedactedSecrets } from "@/lib/config/redact";
import { DATA_DIR } from "@/lib/storage/path-utils";
import {
  HttpError,
  createGetHandler,
  createHandler,
} from "@/lib/http/create-handler";

const CONFIG_DIR = path.join(DATA_DIR, ".agents", ".config");
const INTEGRATIONS_FILE = path.join(CONFIG_DIR, "integrations.json");

export type IntegrationConfig = CabinetIntegrationConfig;

const DEFAULT_CONFIG: IntegrationConfig = DEFAULT_CABINET_CONFIG.integrations;

function mergeWithDefaults(config: Partial<IntegrationConfig> | null | undefined): IntegrationConfig {
  return {
    mcp_servers: { ...DEFAULT_CONFIG.mcp_servers, ...config?.mcp_servers },
    notifications: { ...DEFAULT_CONFIG.notifications, ...config?.notifications },
    scheduling: { ...DEFAULT_CONFIG.scheduling, ...config?.scheduling },
  };
}

async function readConfigFile(): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(INTEGRATIONS_FILE, "utf-8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export const GET = createGetHandler({
  handler: async () => {
    const config = await readConfigFile();
    return redactSecrets(mergeWithDefaults(config as Partial<IntegrationConfig> | null));
  },
});

export const PUT = createHandler({
  handler: async (_input, req) => {
    try {
      const body = await req.json();
      const currentConfig = await readConfigFile();
      const nextConfig = restoreRedactedSecrets(currentConfig, body);
      await fs.mkdir(CONFIG_DIR, { recursive: true });
      await fs.writeFile(INTEGRATIONS_FILE, JSON.stringify(nextConfig, null, 2), "utf-8");
      return { ok: true };
    } catch (err) {
      throw new HttpError(500, String(err));
    }
  },
});
