import {
  sortTasks,
  type AgentTask,
  type CreateAgentTaskInput,
  type TaskInboxRepository,
  type TaskStatus,
  type UpdateAgentTaskInput,
} from "./repository";

export class MemoryTaskInboxRepository implements TaskInboxRepository {
  private readonly tasks = new Map<string, Map<string, AgentTask>>();
  private idCounter = 0;

  private cloneTask(task: AgentTask): AgentTask {
    return { ...task, kbRefs: [...task.kbRefs] };
  }

  private agentTasks(agentSlug: string): Map<string, AgentTask> {
    const existing = this.tasks.get(agentSlug);
    if (existing) return existing;

    const next = new Map<string, AgentTask>();
    this.tasks.set(agentSlug, next);
    return next;
  }

  async createTask(task: CreateAgentTaskInput): Promise<AgentTask> {
    const full: AgentTask = {
      ...task,
      id: `task-${++this.idCounter}`,
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.agentTasks(task.toAgent).set(full.id, this.cloneTask(full));
    return this.cloneTask(full);
  }

  async getTasksForAgent(agentSlug: string, statusFilter?: TaskStatus): Promise<AgentTask[]> {
    const tasks = Array.from(this.agentTasks(agentSlug).values())
      .filter((task) => !statusFilter || task.status === statusFilter)
      .map((task) => this.cloneTask(task));

    return sortTasks(tasks);
  }

  async getTask(agentSlug: string, taskId: string): Promise<AgentTask | null> {
    const task = this.agentTasks(agentSlug).get(taskId);
    return task ? this.cloneTask(task) : null;
  }

  async updateTask(
    agentSlug: string,
    taskId: string,
    updates: UpdateAgentTaskInput,
  ): Promise<AgentTask | null> {
    const existing = this.agentTasks(agentSlug).get(taskId);
    if (!existing) return null;

    const updated: AgentTask = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    if (updates.status === "completed" || updates.status === "failed") {
      updated.completedAt = new Date().toISOString();
    }

    this.agentTasks(agentSlug).set(taskId, this.cloneTask(updated));
    return this.cloneTask(updated);
  }

  async getAllTasks(statusFilter?: TaskStatus): Promise<AgentTask[]> {
    const allTasks = Array.from(this.tasks.values())
      .flatMap((agentTasks) => Array.from(agentTasks.values()))
      .filter((task) => !statusFilter || task.status === statusFilter)
      .map((task) => this.cloneTask(task));

    return sortTasks(allTasks);
  }

  async getPendingTaskCount(agentSlug: string): Promise<number> {
    const tasks = await this.getTasksForAgent(agentSlug, "pending");
    return tasks.length;
  }
}
