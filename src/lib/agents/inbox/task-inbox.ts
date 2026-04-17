import { DATA_DIR } from "@/lib/storage/path-utils";
import { assertValidSlug } from "@/lib/agents/persona/slug-utils";
import { FsTaskInboxRepository } from "./fs-repository";
import type {
  AgentTask,
  CreateAgentTaskInput,
  TaskInboxRepository,
  TaskStatus,
  UpdateAgentTaskInput,
} from "./repository";

let repository: TaskInboxRepository = new FsTaskInboxRepository(DATA_DIR);

export type { AgentTask, CreateAgentTaskInput, TaskInboxRepository, TaskStatus, UpdateAgentTaskInput };

export function setTaskInboxRepository(nextRepository: TaskInboxRepository): void {
  repository = nextRepository;
}

export function resetTaskInboxRepository(): void {
  repository = new FsTaskInboxRepository(DATA_DIR);
}

export async function createTask(
  task: CreateAgentTaskInput
): Promise<AgentTask> {
  assertValidSlug(task.fromAgent, "fromAgent");
  assertValidSlug(task.toAgent, "toAgent");
  return repository.createTask(task);
}

export async function getTasksForAgent(
  agentSlug: string,
  statusFilter?: TaskStatus
): Promise<AgentTask[]> {
  assertValidSlug(agentSlug, "agent");
  return repository.getTasksForAgent(agentSlug, statusFilter);
}

export async function getTask(
  agentSlug: string,
  taskId: string
): Promise<AgentTask | null> {
  assertValidSlug(agentSlug, "agent");
  return repository.getTask(agentSlug, taskId);
}

export async function updateTask(
  agentSlug: string,
  taskId: string,
  updates: UpdateAgentTaskInput
): Promise<AgentTask | null> {
  assertValidSlug(agentSlug, "agent");
  return repository.updateTask(agentSlug, taskId, updates);
}

export async function getAllTasks(
  statusFilter?: TaskStatus
): Promise<AgentTask[]> {
  return repository.getAllTasks(statusFilter);
}

export async function getPendingTaskCount(agentSlug: string): Promise<number> {
  assertValidSlug(agentSlug, "agent");
  return repository.getPendingTaskCount(agentSlug);
}
