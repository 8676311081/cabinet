/**
 * MulticaPoller — polls Multica server for tasks assigned to cabinet agents,
 * executes them locally via PTY sessions through the cabinet daemon, and
 * reports results back to Multica.
 *
 * Activated when a persona.md has: multica_runtime_id: <uuid>
 * Auth: MULTICA_PAT env var (personal access token)
 */

import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { DATA_DIR } from "../src/lib/storage/path-utils";
import { getDaemonPort } from "../src/lib/runtime/runtime-config";
import { getOrCreateDaemonToken } from "../src/lib/agents/daemon-auth";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MULTICA_API_URL = (process.env.MULTICA_API_URL || "http://localhost:18080").replace(/\/+$/, "");
const POLL_INTERVAL_MS = 30_000;     // 30s between task polls per agent
const TASK_TIMEOUT_MS = 30 * 60_000; // 30 min max execution per task
const WAIT_POLL_MS = 3_000;          // 3s between session-output polls

const AGENTS_DIR = path.join(DATA_DIR, ".agents");

function readMulticaPATFile(filePath: string): string {
  try {
    if (!fs.existsSync(filePath)) return "";
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as { token?: unknown };
    return typeof data.token === "string" ? data.token.trim() : "";
  } catch {
    return "";
  }
}

function multicaPATCandidates(): string[] {
  const candidates = new Set<string>();
  candidates.add(path.resolve(DATA_DIR, "..", "multica-pat.json"));

  if (process.env.CABINET_DATA_DIR) {
    candidates.add(path.resolve(process.env.CABINET_DATA_DIR, "..", "multica-pat.json"));
  }

  const home = process.env.HOME || "";
  if (home) {
    candidates.add(path.join(home, "Library", "Application Support", "cabinet", "multica-pat.json"));
    candidates.add(path.join(home, "Library", "Application Support", "Cabinet", "multica-pat.json"));
  }

  const appData = process.env.APPDATA || "";
  if (appData) {
    candidates.add(path.join(appData, "cabinet", "multica-pat.json"));
    candidates.add(path.join(appData, "Cabinet", "multica-pat.json"));
  }

  return [...candidates];
}

function getMulticaPAT(): string {
  for (const candidate of multicaPATCandidates()) {
    const token = readMulticaPATFile(candidate);
    if (token) {
      process.env.MULTICA_PAT = token;
      return token;
    }
  }

  const envPat = process.env.MULTICA_PAT?.trim();
  return envPat || "";
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MulticaTask {
  id: string;
  agent_id: string;
  runtime_id: string;
  issue_id: string;
  workspace_id: string;
  agent?: {
    id: string;
    name: string;
    instructions: string;
    skills?: Array<{ name: string; content: string }>;
  };
  prior_session_id?: string;
  prior_work_dir?: string;
  chat_session_id?: string;
  chat_message?: string;
}

interface PersonaSummary {
  slug: string;
  runtimeId: string;
  name: string;
  provider?: string;
  body: string;
  instructions?: string; // from persona.body or agent.instructions
  workdir: string;
}

// ---------------------------------------------------------------------------
// Per-agent state
// ---------------------------------------------------------------------------

interface AgentState {
  summary: PersonaSummary;
  running: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

const agentStates = new Map<string, AgentState>();
let pollerActive = false;

// ---------------------------------------------------------------------------
// Multica HTTP helpers
// ---------------------------------------------------------------------------

function multicaHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const multicaPAT = getMulticaPAT();
  if (multicaPAT) h["Authorization"] = `Bearer ${multicaPAT}`;
  return h;
}

async function multicaPost<T = unknown>(
  urlPath: string,
  body: Record<string, unknown>,
): Promise<T | null> {
  try {
    const res = await fetch(`${MULTICA_API_URL}${urlPath}`, {
      method: "POST",
      headers: multicaHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`[multica-poller] POST ${urlPath} → ${res.status}: ${text.slice(0, 200)}`);
      return null;
    }
    if (res.status === 204) return null;
    return res.json() as Promise<T>;
  } catch (err) {
    console.warn(`[multica-poller] POST ${urlPath} failed:`, (err as Error).message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Daemon HTTP helpers (call cabinet daemon's own API)
// ---------------------------------------------------------------------------

async function daemonFetch(urlPath: string, init?: RequestInit): Promise<Response> {
  const token = await getOrCreateDaemonToken();
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const base = `http://127.0.0.1:${getDaemonPort()}`;
  return fetch(`${base}${urlPath}`, { ...init, headers });
}

async function createDaemonSession(opts: {
  id: string;
  prompt: string;
  providerId?: string;
  cwd?: string;
  timeoutSeconds?: number;
}): Promise<boolean> {
  try {
    const res = await daemonFetch("/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[multica-poller] createDaemonSession failed (${res.status}): ${text.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[multica-poller] createDaemonSession error:", (err as Error).message);
    return false;
  }
}

async function waitForSession(
  sessionId: string,
  timeoutMs: number,
): Promise<{ status: string; output: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(WAIT_POLL_MS);
    try {
      const res = await daemonFetch(`/session/${sessionId}/output`);
      if (res.ok) {
        const data = await res.json() as { status: string; output: string };
        if (data.status !== "running") return data;
      }
    } catch {
      // retry
    }
  }
  return { status: "failed", output: "Task execution timed out." };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Persona scanning
// ---------------------------------------------------------------------------

function readPersonaSummary(agentDir: string, slug: string): PersonaSummary | null {
  const personaPath = path.join(agentDir, slug, "persona.md");
  if (!fs.existsSync(personaPath)) return null;

  try {
    const raw = fs.readFileSync(personaPath, "utf-8");
    const { data, content } = matter(raw);
    const runtimeId = typeof data.multica_runtime_id === "string" ? data.multica_runtime_id.trim() : "";
    if (!runtimeId) return null;

    return {
      slug,
      runtimeId,
      name: typeof data.name === "string" ? data.name : slug,
      provider: typeof data.provider === "string" ? data.provider : undefined,
      body: content.trim(),
      workdir: typeof data.workdir === "string" ? data.workdir : "/data",
    };
  } catch {
    return null;
  }
}

function scanPersonas(): PersonaSummary[] {
  if (!fs.existsSync(AGENTS_DIR)) return [];
  const results: PersonaSummary[] = [];
  try {
    const entries = fs.readdirSync(AGENTS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const summary = readPersonaSummary(AGENTS_DIR, entry.name);
      if (summary) results.push(summary);
    }
  } catch {
    // ignore
  }
  return results;
}

// ---------------------------------------------------------------------------
// Prompt building
// ---------------------------------------------------------------------------

function buildTaskPrompt(task: MulticaTask, persona: PersonaSummary): string {
  // TODO: Prompt injection is inherent here because user-controlled task/chat content is
  // intentionally sent to the agent. Mitigate with least-privilege tooling, sandboxing,
  // explicit confirmation for high-impact actions, and downstream validation/auditing.
  const lines: string[] = [];

  // Persona body / instructions
  if (persona.body) {
    lines.push(persona.body, "");
  }

  // Agent-level instructions from Multica (may override or extend persona body)
  if (task.agent?.instructions && task.agent.instructions !== persona.body) {
    lines.push("## Agent Instructions (from Multica)", "", task.agent.instructions, "");
  }

  // Skills
  if (task.agent?.skills && task.agent.skills.length > 0) {
    lines.push("## Skills", "");
    for (const skill of task.agent.skills) {
      lines.push(`### ${skill.name}`, "", skill.content, "");
    }
  }

  lines.push("---", "");

  if (task.chat_session_id && task.chat_message) {
    // Chat task — respond to message
    lines.push(
      "## Chat Message",
      "",
      task.chat_message,
      "",
      "Respond to this message. Be concise and helpful.",
    );
  } else {
    // Issue task
    lines.push(
      "## Your Task",
      "",
      `You have been assigned Multica issue: **${task.issue_id}**`,
      "",
      `Run \`multica issue get ${task.issue_id} --output json\` to get the full issue details.`,
      "",
      "After completing the task:",
      "1. Save relevant knowledge to the Cabinet knowledge base (markdown files)",
      "2. If you modified KB files, run: `git push origin HEAD:master`",
      `3. Post a completion report: \`multica issue comment ${task.issue_id}\` with your summary`,
    );
  }

  lines.push(
    "",
    "At the end of your response, include:",
    "```cabinet",
    "SUMMARY: one-line summary of what you accomplished",
    "ARTIFACT: relative/path/to/any/kb/file/you/created/or/updated",
    "```",
  );

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Task execution
// ---------------------------------------------------------------------------

async function executeTask(task: MulticaTask, persona: PersonaSummary): Promise<void> {
  console.log(`[multica-poller] executing task ${task.id} (issue: ${task.issue_id}) for agent ${persona.slug}`);

  // 1. Notify Multica: task has started
  await multicaPost(`/api/daemon/tasks/${task.id}/start`, {});

  // 2. Build prompt
  const prompt = buildTaskPrompt(task, persona);

  // 3. Resolve working directory
  let cwd: string;
  if (task.prior_work_dir && task.prior_work_dir.trim()) {
    cwd = task.prior_work_dir;
  } else if (persona.workdir && persona.workdir !== "/data") {
    cwd = path.join(DATA_DIR, persona.workdir.replace(/^\/+/, ""));
  } else {
    cwd = DATA_DIR;
  }

  // 4. Start PTY session via cabinet daemon
  const sessionId = `multica-${task.id}`;
  const started = await createDaemonSession({
    id: sessionId,
    prompt,
    providerId: persona.provider,
    cwd,
    timeoutSeconds: Math.floor(TASK_TIMEOUT_MS / 1000),
  });

  if (!started) {
    await multicaPost(`/api/daemon/tasks/${task.id}/fail`, {
      error: "Failed to start PTY session in cabinet daemon",
    });
    return;
  }

  // 5. Wait for session to finish
  const result = await waitForSession(sessionId, TASK_TIMEOUT_MS);

  // 6. Report result back to Multica
  if (result.status === "completed") {
    await multicaPost(`/api/daemon/tasks/${task.id}/complete`, {
      output: result.output.slice(0, 50_000),
      session_id: sessionId,
      work_dir: cwd,
    });
    console.log(`[multica-poller] task ${task.id} completed`);
  } else {
    const errMsg = result.output
      ? result.output.slice(-2000) // last 2k chars of output for context
      : "Task execution failed or timed out";
    await multicaPost(`/api/daemon/tasks/${task.id}/fail`, { error: errMsg.slice(0, 2000) });
    console.log(`[multica-poller] task ${task.id} failed: ${result.status}`);
  }
}

// ---------------------------------------------------------------------------
// Poll loop for a single agent
// ---------------------------------------------------------------------------

async function pollOnce(state: AgentState): Promise<void> {
  if (!pollerActive || state.running) return;

  const { summary } = state;

  // Claim a task
  let claimed: { task: MulticaTask | null } | null = null;
  try {
    const res = await fetch(
      `${MULTICA_API_URL}/api/daemon/runtimes/${summary.runtimeId}/tasks/claim`,
      {
        method: "POST",
        headers: multicaHeaders(),
        body: JSON.stringify({}),
      }
    );
    if (res.status === 204 || res.status === 404) return; // no tasks
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`[multica-poller] claim failed (${res.status}): ${text.slice(0, 200)}`);
      return;
    }
    claimed = await res.json() as { task: MulticaTask | null };
  } catch (err) {
    console.warn(`[multica-poller] claim error for ${summary.slug}:`, (err as Error).message);
    return;
  }

  const task = claimed?.task;
  if (!task) return;

  // Execute the task
  state.running = true;
  try {
    await executeTask(task, summary);
  } catch (err) {
    console.error(`[multica-poller] unhandled error for task ${task.id}:`, err);
    await multicaPost(`/api/daemon/tasks/${task.id}/fail`, {
      error: err instanceof Error ? err.message : "Unknown error",
    }).catch(() => {});
  } finally {
    state.running = false;
  }
}

function scheduleNextPoll(state: AgentState): void {
  if (!pollerActive) return;
  state.timer = setTimeout(async () => {
    await pollOnce(state).catch(() => {});
    scheduleNextPoll(state);
  }, POLL_INTERVAL_MS);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Reload personas and (re)start polling for those with multica_runtime_id. */
export function reloadMulticaPoller(): void {
  if (!getMulticaPAT()) {
    // Don't spam logs on every reload if PAT is not configured
    return;
  }

  const personas = scanPersonas();
  const newSlugs = new Set(personas.map((p) => p.slug));

  // Stop agents that no longer have multica_runtime_id
  for (const [slug, state] of agentStates) {
    if (!newSlugs.has(slug)) {
      if (state.timer) clearTimeout(state.timer);
      agentStates.delete(slug);
      console.log(`[multica-poller] stopped poller for ${slug}`);
    }
  }

  // Add or update agents
  for (const summary of personas) {
    const existing = agentStates.get(summary.slug);
    if (existing) {
      // Update summary in place; don't restart timer
      existing.summary = summary;
    } else {
      // New agent — start polling
      const state: AgentState = { summary, running: false, timer: null };
      agentStates.set(summary.slug, state);
      scheduleNextPoll(state);
      console.log(`[multica-poller] started poller for ${summary.slug} (runtime: ${summary.runtimeId})`);
    }
  }
}

/** Start the Multica task poller. Call after the daemon HTTP server is listening. */
export function startMulticaPoller(): void {
  if (!getMulticaPAT()) {
    console.log("[multica-poller] MULTICA_PAT not set — task polling disabled");
    return;
  }

  pollerActive = true;
  reloadMulticaPoller();

  const agentCount = agentStates.size;
  if (agentCount === 0) {
    console.log("[multica-poller] no agents with multica_runtime_id found — polling inactive");
  } else {
    console.log(`[multica-poller] polling ${agentCount} agent(s) every ${POLL_INTERVAL_MS / 1000}s`);
  }
}

/** Stop all polling (for graceful shutdown). */
export function stopMulticaPoller(): void {
  pollerActive = false;
  for (const state of agentStates.values()) {
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
  }
  agentStates.clear();
}
