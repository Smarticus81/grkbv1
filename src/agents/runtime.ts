/**
 * AgentRuntime — Orchestrates ephemeral task execution.
 *
 * Creates a fresh InMemoryTaskStore per run, executes tasks in
 * topological order, collects results, and halts on failure.
 */

import { v4 as uuidv4 } from "uuid";
import { InMemoryTaskStore } from "./store.js";
import { getExecutionOrder, getTaskDefinition } from "./registry.js";
import type {
  TaskConfig,
  TaskInputBundle,
  TaskResult,
  PsurTaskType,
  AgentRunResult,
} from "./types.js";

export class AgentRuntime {
  private config: TaskConfig;

  constructor(config: TaskConfig) {
    this.config = config;
  }

  async execute(): Promise<AgentRunResult> {
    const correlationId = uuidv4();
    const store = new InMemoryTaskStore();
    const taskResults = new Map<PsurTaskType, TaskResult>();
    const t0 = Date.now();

    const executionOrder = getExecutionOrder();

    for (const taskType of executionOrder) {
      const def = getTaskDefinition(taskType);
      const taskId = uuidv4();

      const inputBundle: TaskInputBundle = {
        taskType,
        taskId,
        correlationId,
        inputRefs: [],
      };

      const result = await def.handler(inputBundle, store, this.config);
      taskResults.set(taskType, result);

      if (result.status === "failed") {
        return {
          correlationId,
          taskResults,
          store,
          totalDurationMs: Date.now() - t0,
        };
      }
    }

    return {
      correlationId,
      taskResults,
      store,
      totalDurationMs: Date.now() - t0,
    };
  }
}
