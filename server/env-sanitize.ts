/**
 * Strip management-plane secrets from env before handing it to agent PTYs.
 *
 * Any env var whose presence would let an agent child process (claude/codex
 * CLI, user-spawned shells, etc.) escalate into Cabinet's or Multica's
 * control plane MUST be listed here. Keep in sync with new secrets added
 * elsewhere in the codebase.
 */
const AGENT_ENV_BLOCKLIST = new Set([
  "MULTICA_PAT",
  "NEXT_PUBLIC_MULTICA_PAT",
  "CABINET_DAEMON_TOKEN",
  "KB_PASSWORD",
  "TELEGRAM_BOT_TOKEN",
]);

export function buildAgentEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (AGENT_ENV_BLOCKLIST.has(key)) continue;
    env[key] = value;
  }
  return env;
}
