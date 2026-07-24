export type AgentId =
  | "market-analyst"
  | "onchain-analyst"
  | "news-analyst"
  | "sentiment-analyst"
  | "macro-analyst"
  | "strategy-researcher"
  | "backtest-agent"
  | "risk-manager"
  | "investment-advisor"
  | "execution-agent"
  | "monitoring-agent"
  | "performance-auditor"
  | "agent-coordinator"
  | "llm-analyst";

export type AgentRole =
  | "analyst"
  | "advisor"
  | "executor"
  | "monitor"
  | "auditor";

export type MessageType =
  | "request"
  | "response"
  | "event"
  | "notification"
  | "error";

export interface AgentMessage {
  id: string;
  type: MessageType;
  from: AgentId;
  to: AgentId | "broadcast";
  topic: string;
  payload: Record<string, any>;
  timestamp: number;
  correlationId?: string;
  priority?: "low" | "normal" | "high" | "critical";
}

export interface AgentStatus {
  id: AgentId;
  name: string;
  role: AgentRole;
  description: string;
  icon: string;
  status: "idle" | "processing" | "busy" | "error";
  lastActiveAt: number;
  error?: string;
  metrics: AgentMetrics;
}

export interface AgentMetrics {
  tasksCompleted: number;
  avgResponseTime: number;
  errorRate: number;
  cacheHits: number;
  cacheMisses: number;
}

export interface AgentCapability {
  name: string;
  description: string;
  supportedTopics: string[];
  requires?: string[];
  provides?: string[];
}

export interface AgentInput {
  type: string;
  data: Record<string, any>;
}

export interface AgentOutput {
  type: string;
  data: Record<string, any>;
  confidence?: number;
  sources?: string[];
  warnings?: string[];
}

export interface TaskContext {
  taskId: string;
  userId?: string;
  timestamp: number;
  priority: "low" | "normal" | "high" | "critical";
  deadline?: number;
  metadata?: Record<string, any>;
}

export interface IAgent {
  id: AgentId;
  name: string;
  role: AgentRole;
  description: string;
  icon: string;
  capabilities: AgentCapability[];
  getStatus(): AgentStatus;
  getMetrics(): AgentMetrics;
  init(): Promise<void>;
  execute(task: AgentInput, context?: TaskContext): Promise<AgentOutput>;
  handleMessage(message: AgentMessage): Promise<void>;
  shutdown(): Promise<void>;
}
