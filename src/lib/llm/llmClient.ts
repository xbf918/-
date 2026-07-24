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

export interface LLMAnalysisResult {
  direction: "bullish" | "bearish" | "neutral";
  confidence: number;
  strength: number;
  rationale: string[];
  keyFactors: string[];
  riskLevel: "low" | "medium" | "high";
  suggestedAction?: "long" | "short" | "hold";
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

export class LLMClient {
  private config: LLMConfig;

  constructor(config: Partial<LLMConfig> = {}) {
    const provider = config.provider || "deepseek";
    const defaults = DEFAULT_CONFIG[provider];
    this.config = {
      provider,
      apiKey: config.apiKey || "",
      baseUrl: config.baseUrl || defaults.baseUrl,
      model: config.model || defaults.model,
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

  async chat(messages: LLMMessage[]): Promise<LLMResponse> {
    const { provider, baseUrl, apiKey, model, temperature, maxTokens } = this.config;

    if (!apiKey && provider !== "ollama") {
      const err = `LLM API Key 未配置 (provider: ${provider})`;
      console.error("[LLM]", err);
      throw new Error(err);
    }

    if (provider === "ollama") {
      return this.chatOllama(messages);
    }

    if (provider === "claude") {
      return this.chatClaude(messages);
    }

    const url = `${baseUrl}/chat/completions`;
    console.log("[LLM] Sending request to", url, "model:", model);

    try {
      const response = await fetch(url, {
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
        console.error("[LLM] API Error", response.status, error);
        throw new Error(`LLM API Error (${response.status}): ${error.slice(0, 300)}`);
      }

      const data = await response.json();
      console.log("[LLM] Response received, tokens:", data.usage?.total_tokens);
      return {
        content: data.choices[0]?.message?.content || "",
        usage: {
          promptTokens: data.usage?.prompt_tokens || 0,
          completionTokens: data.usage?.completion_tokens || 0,
          totalTokens: data.usage?.total_tokens || 0,
        },
        model: data.model || model,
      };
    } catch (e: any) {
      if (e?.name === "TypeError" && e?.message?.includes("fetch")) {
        const netErr = `[LLM] 网络请求失败 (可能是 CORS 或网络问题): ${e.message}`;
        console.error(netErr);
        throw new Error(netErr);
      }
      throw e;
    }
  }

  private async chatOllama(messages: LLMMessage[]): Promise<LLMResponse> {
    const { baseUrl, model } = this.config;
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

  private async chatClaude(messages: LLMMessage[]): Promise<LLMResponse> {
    const { baseUrl, apiKey, model, maxTokens } = this.config;
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

  async analyze(prompt: string, systemPrompt?: string): Promise<LLMResponse> {
    const messages: LLMMessage[] = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: prompt });
    return this.chat(messages);
  }

  async analyzeAndParse(prompt: string, systemPrompt?: string): Promise<LLMAnalysisResult> {
    const response = await this.analyze(prompt, systemPrompt);
    return this.parseAnalysis(response.content);
  }

  async chatAndParseJSON<T = any>(prompt: string, systemPrompt?: string): Promise<T | null> {
    const response = await this.analyze(prompt, systemPrompt);
    return this.parseJSON<T>(response.content);
  }

  parseJSON<T = any>(content: string): T | null {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as T;
      }
    } catch (e) {
      console.warn("[LLM] JSON 解析失败:", e);
    }
    return null;
  }

  private parseAnalysis(content: string): LLMAnalysisResult {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          direction: parsed.direction || "neutral",
          confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0.5)),
          strength: Math.min(100, Math.max(0, parsed.strength ?? 0)),
          rationale: Array.isArray(parsed.rationale) ? parsed.rationale : [parsed.rationale || ""],
          keyFactors: Array.isArray(parsed.keyFactors) ? parsed.keyFactors : [],
          riskLevel: parsed.riskLevel || "medium",
          suggestedAction: parsed.suggestedAction,
        };
      }
    } catch (e) {
      // 解析失败，回退到文本分析
    }

    const lower = content.toLowerCase();
    let direction: "bullish" | "bearish" | "neutral" = "neutral";
    if (lower.includes("看涨") || lower.includes("bullish") || lower.includes("做多") || lower.includes("买入")) {
      direction = "bullish";
    } else if (lower.includes("看跌") || lower.includes("bearish") || lower.includes("做空") || lower.includes("卖出")) {
      direction = "bearish";
    }

    const confMatch = content.match(/置信度[：:]\s*(\d+(?:\.\d+)?)/) || content.match(/confidence[：:]\s*(\d+(?:\.\d+)?)/i);
    const confidence = confMatch ? Math.min(1, parseFloat(confMatch[1]) / 100) : 0.5;

    return {
      direction,
      confidence,
      strength: confidence * 100,
      rationale: [content.slice(0, 200)],
      keyFactors: [],
      riskLevel: "medium",
    };
  }
}

export const llmClient = new LLMClient();