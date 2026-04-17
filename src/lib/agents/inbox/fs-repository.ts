import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";
import { assertValidSlug } from "@/lib/agents/persona/slug-utils";
import { ensureDirectory, fileExists } from "@/lib/storage/fs-operations";
import {
  sortTasks,
  type AgentTask,
  type CreateAgentTaskInput,
  type TaskInboxRepository,
  type TaskStatus,
  type UpdateAgentTaskInput,
} from "./repository";

export class FsTaskInboxRepository implements TaskInboxRepository {
  private readonly agentsDir: string;

  constructor(dataDir: string) {
    this.agentsDir = path.join(dataDir, ".agents");
  }

  private taskDir(agentSlug: string): string {
    assertValidSlug(agentSlug, "agentSlug");
    return path.join(this.agentsDir, agentSlug, "tasks");
  }

  private taskFilePath(agentSlug: string, taskId: string): string {
    return path.join(this.taskDir(agentSlug), `${taskId}.json`);
  }

  private async initTaskDir(agentSlug: string): Promise<void> {
    await ensureDirectory(this.taskDir(agentSlug));
  }

  async createTask(task: CreateAgentTaskInput): Promise<AgentTask> {
    assertValidSlug(task.fromAgent, "fromAgent");
    assertValidSlug(task.toAgent, "toAgent");
    await this.initTaskDir(task.toAgent);

    const full: AgentTask = {
      ...task,
      id: randomUUID(),
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await fs.writeFile(
      this.taskFilePath(task.toAgent, full.id),
      JSON.stringify(full, null, 2),
      "utf-8",
    );

    return full;
  }

  async getTasksForAgent(agentSlug: string, statusFilter?: TaskStatus): Promise<AgentTask[]> {
    assertValidSlug(agentSlug, "agentSlug");
    const dir = this.taskDir(agentSlug);
    if (!(await fileExists(dir))) return [];

    const entries = await fs.readdir(dir, { withFileTypes: true });
    const tasks: AgentTask[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(path.join(dir, entry.name), "utf-8");
        const task: AgentTask = JSON.parse(raw);
        if (!statusFilter || task.status === statusFilter) {
          tasks.push(task);
        }
      } catch {
        // Skip malformed task files.
      }
    }

    return sortTasks(tasks);
  }

  async getTask(agentSlug: string, taskId: string): Promise<AgentTask | null> {
    assertValidSlug(agentSlug, "agentSlug");
    const filePath = this.taskFilePath(agentSlug, taskId);
    if (!(await fileExists(filePath))) return null;

    try {
      const raw = await fs.readFile(filePath, "utf-8");
      return JSON.parse(raw) as AgentTask;
    } catch {
      return null;
    }
  }

  async updateTask(
    agentSlug: string,
    taskId: string,
    updates: UpdateAgentTaskInput,
  ): Promise<AgentTask | null> {
    assertValidSlug(agentSlug, "agentSlug");
    const task = await this.getTask(agentSlug, taskId);
    if (!task) return null;

    const updated: AgentTask = {
      ...task,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    if (updates.status === "completed" || updates.status === "failed") {
      updated.completedAt = new Date().toISOString();
    }

    await fs.writeFile(
      this.taskFilePath(agentSlug, taskId),
      JSON.stringify(updated, null, 2),
      "utf-8",
    );

    return updated;
  }

  async getAllTasks(statusFilter?: TaskStatus): Promise<AgentTask[]> {
    if (!(await fileExists(this.agentsDir))) return [];

    const entries = await fs.readdir(this.agentsDir, { withFileTypes: true });
    const allTasks: AgentTask[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const tasks = await this.getTasksForAgent(entry.name, statusFilter);
      allTasks.push(...tasks);
    }

    return sortTasks(allTasks);
  }

  async getPendingTaskCount(agentSlug: string): Promise<number> {
    assertValidSlug(agentSlug, "agentSlug");
    const tasks = await this.getTasksForAgent(agentSlug, "pending");
    return tasks.length;
  }
}
