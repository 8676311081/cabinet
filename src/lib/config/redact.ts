import type { CabinetIntegrationConfig } from "./schema";

type JsonRecord = Record<string, unknown>;

export const SECRET_FIELD_PATHS = [
  "notifications.telegram.bot_token",
  "notifications.slack_webhook.url",
  "notifications.email.smtp_password",
  "notifications.email.smtp_user",
  "mcp_servers.reddit.env.REDDIT_CLIENT_SECRET",
  "mcp_servers.linkedin.env.LINKEDIN_ACCESS_TOKEN",
  "mcp_servers.github.env.GITHUB_TOKEN",
  "mcp_servers.slack.env.SLACK_BOT_TOKEN",
  "mcp_servers.email.env.SMTP_USER",
  "mcp_servers.email.env.SMTP_PASS",
  "mcp_servers.gsheets.env.GOOGLE_CREDENTIALS",
] as const;

const SECRET_MASK_PREFIX = "***";
const LEGACY_SECRET_MASK_PATTERN = /^\*{3}.+\*{3}$/;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item)) as T;
  }

  if (isRecord(value)) {
    const copy: JsonRecord = {};
    for (const [key, entry] of Object.entries(value)) {
      copy[key] = cloneValue(entry);
    }
    return copy as T;
  }

  return value;
}

function getPathValue(config: unknown, fieldPath: string): unknown {
  let current = config;
  for (const segment of fieldPath.split(".")) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function setPathValueIfParentExists(config: unknown, fieldPath: string, value: string): void {
  if (!isRecord(config)) {
    return;
  }

  const segments = fieldPath.split(".");
  let current: JsonRecord = config;

  for (const segment of segments.slice(0, -1)) {
    const next = current[segment];
    if (!isRecord(next)) {
      return;
    }
    current = next;
  }

  current[segments[segments.length - 1]] = value;
}

function redactSecretValue(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    return "";
  }

  return `${SECRET_MASK_PREFIX}${value.slice(-4)}`;
}

function shouldPreserveSecret(currentValue: unknown, nextValue: unknown): currentValue is string {
  if (typeof currentValue !== "string" || currentValue.length === 0) {
    return false;
  }

  if (nextValue === "") {
    return true;
  }

  if (typeof nextValue !== "string") {
    return false;
  }

  return nextValue === redactSecretValue(currentValue) || LEGACY_SECRET_MASK_PATTERN.test(nextValue);
}

export function redactSecrets<T extends CabinetIntegrationConfig | JsonRecord | null | undefined>(
  config: T,
): T {
  const copy = cloneValue(config);

  for (const fieldPath of SECRET_FIELD_PATHS) {
    setPathValueIfParentExists(copy, fieldPath, redactSecretValue(getPathValue(copy, fieldPath)));
  }

  return copy;
}

export function hasSecret(config: unknown, fieldPath: string): boolean {
  const value = getPathValue(config, fieldPath);
  return typeof value === "string" && value.length > 0;
}

export function restoreRedactedSecrets<T extends JsonRecord | null | undefined>(
  currentConfig: unknown,
  nextConfig: T,
): T {
  const copy = cloneValue(nextConfig);

  for (const fieldPath of SECRET_FIELD_PATHS) {
    const currentValue = getPathValue(currentConfig, fieldPath);
    const nextValue = getPathValue(copy, fieldPath);

    if (!shouldPreserveSecret(currentValue, nextValue)) {
      continue;
    }

    setPathValueIfParentExists(copy, fieldPath, currentValue);
  }

  return copy;
}
