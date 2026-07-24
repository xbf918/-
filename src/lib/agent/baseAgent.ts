import type {
  AgentId,
  AgentRole,
  AgentCapability,
  AgentStatus,
  AgentMetrics,
  AgentInput,
  AgentOutput,
  TaskContext,
  AgentMessage,
} from "./types";
import { llmClient } from "@/lib/llm/llmClient";

export abstract class BaseAgent {
  readonly id: AgentId;
  readonly name: string;
  readonly role: AgentRole;
  readonly description: string;
  readonly icon: string;
  readonly capabilities: AgentCapability[];

  protected status: AgentStatus;
  protected metrics: AgentMetrics;
  protected messageHandlers: Map<string, (msg: AgentMessage) => Promise<void>>;
  protected cache: Map<string, { data: any; timestamp: number; ttl: number }>;
  protected useLLM: boolean;
  protected llmSystemPrompt: string;

  constructor(
    id: AgentId,
    name: string,
    role: AgentRole,
    description: string,
    icon: string,
    capabilities: AgentCapability[],
  ) {
    this.id = id;
    this.name = name;
    this.role = role;
    this.description = description;
    this.icon = icon;
    this.capabilities = capabilities;
    this.useLLM = false;
    this.llmSystemPrompt = `你是一位${name}，负责${description}。请根据输入数据进行专业分析并返回结果。`;

    this.metrics = {
      tasksCompleted: 0,
      avgResponseTime: 0,
      errorRate: 0,
      cacheHits: 0,
      cacheMisses: 0,
    };

    this.status = {
      id,
      name,
      role,
      description,
      icon,
      status: "idle",
      lastActiveAt: Date.now(),
      metrics: this.metrics,
    };

    this.messageHandlers = new Map();
    this.cache = new Map();
  }

  getStatus(): AgentStatus {
    return this.status;
  }

  getMetrics(): AgentMetrics {
    return this.metrics;
  }

  protected setStatus(status: AgentStatus["status"], error?: string): void {
    this.status = {
      ...this.status,
      status,
      lastActiveAt: Date.now(),
      error: error ?? undefined,
    };
  }

  protected updateMetrics(completed: boolean, responseTime: number, error: boolean): void {
    this.metrics.tasksCompleted += completed ? 1 : 0;
    const totalTasks = this.metrics.tasksCompleted;
    this.metrics.avgResponseTime =
      (this.metrics.avgResponseTime * (totalTasks - 1) + responseTime) / totalTasks;
    this.metrics.errorRate =
      (this.metrics.errorRate * (totalTasks - 1) + (error ? 1 : 0)) / totalTasks;
  }

  protected cacheGet(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.metrics.cacheMisses++;
      return null;
    }
    if (Date.now() > entry.timestamp + entry.ttl) {
      this.cache.delete(key);
      this.metrics.cacheMisses++;
      return null;
    }
    this.metrics.cacheHits++;
    return entry.data;
  }

  protected cacheSet(key: string, data: any, ttl: number = 60_000): void {
    this.cache.set(key, { data, timestamp: Date.now(), ttl });
  }

  protected cacheClear(): void {
    this.cache.clear();
  }

  protected registerMessageHandler(topic: string, handler: (msg: AgentMessage) => Promise<void>): void {
    this.messageHandlers.set(topic, handler);
  }

  async init(): Promise<void> {
    this.setStatus("idle");
  }

  async execute(task: AgentInput, context?: TaskContext): Promise<AgentOutput> {
    const startTime = Date.now();
    this.setStatus("processing");

    try {
      const result = await this.processTask(task, context);
      const responseTime = Date.now() - startTime;
      this.updateMetrics(true, responseTime, false);
      this.setStatus("idle");
      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.updateMetrics(false, responseTime, true);
      this.setStatus("error", error instanceof Error ? error.message : "Unknown error");
      return {
        type: "error",
        data: { error: error instanceof Error ? error.message : "Unknown error" },
        confidence: 0,
        warnings: [error instanceof Error ? error.message : "Unknown error"],
      };
    }
  }

  async handleMessage(message: AgentMessage): Promise<void> {
    const handler = this.messageHandlers.get(message.topic);
    if (handler) {
      await handler(message);
    }
  }

  async shutdown(): Promise<void> {
    this.cacheClear();
    this.setStatus("idle");
  }

  setUseLLM(enabled: boolean): void {
    this.useLLM = enabled;
  }

  isUsingLLM(): boolean {
    return this.useLLM;
  }

  setLLMSystemPrompt(prompt: string): void {
    this.llmSystemPrompt = prompt;
  }

  protected async callLLM<T = any>(
    userPrompt: string,
    outputSchema?: Record<string, any>,
  ): Promise<T | null> {
    if (!this.useLLM) {
      return null;
    }

    try {
      const schemaHint = outputSchema
        ? `\n\n请严格按照以下 JSON 格式返回（只返回 JSON，不要任何其他文字、解释或代码块标记）：\n${JSON.stringify(outputSchema, null, 2)}`
        : "";

      const fullPrompt = `${userPrompt}${schemaHint}`;
      const result = await llmClient.chatAndParseJSON<T>(fullPrompt, this.llmSystemPrompt);
      return result;
    } catch (error) {
      console.warn(`[LLM] ${this.id} 调用失败，回退到本地算法:`, error);
      return null;
    }
  }

  protected abstract processTask(task: AgentInput, context?: TaskContext): Promise<AgentOutput>;
}
