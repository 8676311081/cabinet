export type TaskStatus = "pending" | "in_progress" | "completed" | "failed";

export interface AgentTask {
  id: string;
  fromAgent: string;
  fromEmoji?: string;
  fromName?: string;
  toAgent: string;
  channel?: string;
  title: string;
  description: string;
  kbRefs: string[];
  status: TaskStatus;
  priority: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  result?: string;
}

export type CreateAgentTaskInput = Omit<
  AgentTask,
  "id" | "createdAt" | "updatedAt" | "status"
>;

export type UpdateAgentTaskInput = Partial<Pick<AgentTask, "status" | "result">>;

export interface TaskInboxRepository {
  createTask(task: CreateAgentTaskInput): Promise<AgentTask>;
  getTasksForAgent(agentSlug: string, statusFilter?: TaskStatus): Promise<AgentTask[]>;
  getTask(agentSlug: string, taskId: string): Promise<AgentTask | null>;
  updateTask(
    agentSlug: string,
    taskId: string,
    updates: UpdateAgentTaskInput,
  ): Promise<AgentTask | null>;
  getAllTasks(statusFilter?: TaskStatus): Promise<AgentTask[]>;
  getPendingTaskCount(agentSlug: string): Promise<number>;
}

export function sortTasks(tasks: AgentTask[]): AgentTask[] {
  return [...tasks].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}
