export type LLMProvider = "openai" | "deepseek" | "qwen" | "claude" | "ollama";

export interface LLMConfig {
  provider: LLMProvider;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
}

const DEFAULT_CONFIG: Record<LLMProvider, { baseUrl: string; model: string }> = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o",
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
  },
  qwen: {
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen2-72b-instruct",
  },
  claude: {
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-3-haiku-20240307",
  },
  ollama: {
    baseUrl: "http://localhost:11434",
    model: "llama3",
  },
};

export class LLMService {
  private config: LLMConfig;

  constructor(config: Partial<LLMConfig> = {}) {
    const provider = config.provider || "deepseek";
    const defaults = DEFAULT_CONFIG[provider];
    this.config = {
      provider,
      apiKey: config.apiKey || process.env.LLM_API_KEY || "",
      baseUrl: config.baseUrl || process.env.LLM_BASE_URL || defaults.baseUrl,
      model: config.model || process.env.LLM_MODEL || defaults.model,
      temperature: config.temperature ?? 0.3,
      maxTokens: config.maxTokens ?? 2000,
    };
  }

  updateConfig(config: Partial<LLMConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.provider) {
      const defaults = DEFAULT_CONFIG[config.provider];
      if (!config.baseUrl) this.config.baseUrl = defaults.baseUrl;
      if (!config.model) this.config.model = defaults.model;
    }
  }

  getConfig(): LLMConfig {
    return { ...this.config };
  }

  async chat(messages: LLMMessage[], customConfig?: Partial<LLMConfig>): Promise<LLMResponse> {
    const config = customConfig ? { ...this.config, ...customConfig } : this.config;
    const { provider, baseUrl, apiKey, model, temperature, maxTokens } = config;

    if (provider === "ollama") {
      return this.chatOllama(messages, config);
    }

    if (provider === "claude") {
      return this.chatClaude(messages, config);
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LLM API Error (${response.status}): ${error}`);
    }

    const data = await response.json();
    return {
      content: data.choices[0]?.message?.content || "",
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
      model: data.model || model,
    };
  }

  private async chatOllama(messages: LLMMessage[], config: LLMConfig): Promise<LLMResponse> {
    const { baseUrl, model } = config;
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama Error: ${response.status}`);
    }

    const data = await response.json();
    return {
      content: data.message?.content || "",
      model: data.model || model,
    };
  }

  private async chatClaude(messages: LLMMessage[], config: LLMConfig): Promise<LLMResponse> {
    const { baseUrl, apiKey, model, maxTokens } = config;
    const systemMsg = messages.find((m) => m.role === "system")?.content;
    const otherMsgs = messages.filter((m) => m.role !== "system");

    const response = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey || "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: systemMsg,
        messages: otherMsgs,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude Error (${response.status}): ${error}`);
    }

    const data = await response.json();
    return {
      content: data.content?.[0]?.text || "",
      usage: {
        promptTokens: data.usage?.input_tokens || 0,
        completionTokens: data.usage?.output_tokens || 0,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      },
      model: data.model || model,
    };
  }
}

export const llmService = new LLMService();
