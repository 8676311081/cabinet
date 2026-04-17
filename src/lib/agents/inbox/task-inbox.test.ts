import test from "node:test";
import assert from "node:assert/strict";
import {
  createTask,
  getTask,
  getTasksForAgent,
  resetTaskInboxRepository,
  setTaskInboxRepository,
  updateTask,
} from "./task-inbox";
import { MemoryTaskInboxRepository } from "./memory-repository";

function useMemoryRepository(t: test.TestContext): void {
  setTaskInboxRepository(new MemoryTaskInboxRepository());
  t.after(() => {
    resetTaskInboxRepository();
  });
}

test("createTask stores a pending task for the target agent", async (t) => {
  useMemoryRepository(t);

  const created = await createTask({
    fromAgent: "ceo",
    fromEmoji: "🧠",
    fromName: "CEO",
    toAgent: "editor",
    channel: "general",
    title: "Draft post",
    description: "Write the first draft",
    kbRefs: ["notes/brief.md"],
    priority: 2,
  });

  assert.ok(created.id);
  assert.equal(created.status, "pending");
  assert.equal(created.toAgent, "editor");

  const loaded = await getTask("editor", created.id);
  assert.deepEqual(loaded, created);
});

test("getTasksForAgent filters by status and sorts by priority then createdAt", async (t) => {
  useMemoryRepository(t);

  const lowPriority = await createTask({
    fromAgent: "ceo",
    toAgent: "editor",
    channel: "general",
    title: "Later task",
    description: "",
    kbRefs: [],
    priority: 4,
  });

  const highPriority = await createTask({
    fromAgent: "ceo",
    toAgent: "editor",
    channel: "general",
    title: "Urgent task",
    description: "",
    kbRefs: [],
    priority: 1,
  });

  await updateTask("editor", lowPriority.id, { status: "in_progress" });

  const pending = await getTasksForAgent("editor", "pending");
  const all = await getTasksForAgent("editor");

  assert.equal(pending.length, 1);
  assert.equal(pending[0].id, highPriority.id);
  assert.deepEqual(
    all.map((task) => task.id),
    [highPriority.id, lowPriority.id],
  );
});

test("updateTask changes status, result, and completedAt", async (t) => {
  useMemoryRepository(t);

  const created = await createTask({
    fromAgent: "ceo",
    toAgent: "editor",
    channel: "general",
    title: "Ship update",
    description: "Complete the work",
    kbRefs: [],
    priority: 3,
  });

  const updated = await updateTask("editor", created.id, {
    status: "completed",
    result: "Done",
  });

  assert.ok(updated);
  assert.equal(updated?.status, "completed");
  assert.equal(updated?.result, "Done");
  assert.ok(updated?.completedAt);
});
