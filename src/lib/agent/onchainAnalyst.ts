import { BaseAgent } from "./baseAgent";
import type { AgentInput, AgentOutput, TaskContext, AgentCapability } from "./types";

const CAPABILITIES: AgentCapability[] = [
  {
    name: "whale-tracking",
    description: "巨鲸钱包追踪和大额转账监控",
    supportedTopics: ["whale-movement", "large-transactions", "wallet-analysis"],
    provides: ["whale-activity", "transfer-volume", "wallet-classification"],
  },
  {
    name: "network-analysis",
    description: "链上网络指标分析",
    supportedTopics: ["network-metrics", "gas-analysis", "tx-volume"],
    provides: ["gas-price", "tx-count", "network-activity"],
  },
  {
    name: "smart-contract-analysis",
    description: "智能合约交互分析",
    supportedTopics: ["contract-interaction", "dex-activity", "nft-sales"],
    provides: ["contract-calls", "dex-volume", "nft-data"],
  },
];

export class OnchainAnalystAgent extends BaseAgent {
  constructor() {
    super(
      "onchain-analyst",
      "链上数据代理",
      "analyst",
      "分析链上数据、追踪巨鲸动向、监控智能合约交互",
      "🐳",
      CAPABILITIES,
    );
    this.llmSystemPrompt = `你是一位资深的区块链链上分析师，擅长分析链上数据、巨鲸动向和网络活跃度。
你的分析应该：
1. 关注巨鲸钱包的资金流向（流入/流出）
2. 分析网络活跃度和Gas使用情况
3. 判断链上数据对市场的影响
4. 给出明确的多空倾向和置信度`;
  }

  protected async processTask(task: AgentInput, context?: TaskContext): Promise<AgentOutput> {
    switch (task.type) {
      case "whale-tracking":
        return this.trackWhales(task.data, context);
      case "network-analysis":
        return this.analyzeNetwork(task.data, context);
      case "contract-analysis":
        return this.analyzeContracts(task.data, context);
      default:
        return {
          type: "error",
          data: { error: `Unknown task type: ${task.type}` },
          confidence: 0,
        };
    }
  }

  private async trackWhales(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const symbol = data.symbol || "BTC";
    const lookbackHours = data.lookbackHours || 24;

    const cached = this.cacheGet(`whale_${symbol}_${lookbackHours}`);
    if (cached) return cached;

    let result: any = {
      type: "whale-tracking-result",
      data: {
        symbol,
        lookbackHours,
        largeTransfers: this.generateMockTransfers(symbol, lookbackHours),
        whaleWallets: [
          { address: "0x1a2b3c...", classification: "exchange", activity: "accumulating" },
          { address: "0x4d5e6f...", classification: "whale", activity: "distributing" },
        ],
        netFlow: this.calculateNetFlow(symbol),
      },
      confidence: 0.6,
      sources: ["blockchain-data"],
    };

    // LLM 模式
    if (this.useLLM) {
      const llmResult = await this.callLLM<any>(
        `请分析以下链上巨鲸数据并给出市场判断：

交易对: ${symbol}
时间范围: 过去${lookbackHours}小时
大额转账数量: ${result.data.largeTransfers.length}笔
净资金流向: ${result.data.netFlow > 0 ? "流入" + result.data.netFlow.toFixed(0) : "流出" + Math.abs(result.data.netFlow).toFixed(0)}
巨鲸钱包动向: ${result.data.whaleWallets.map((w: any) => w.classification + ":" + w.activity).join(", ")}

请判断链上数据对市场的影响，给出多空倾向。`,
        {
          direction: "bullish/bearish/neutral",
          confidence: 0.6,
          netFlow: "inflow/outflow/neutral",
          whaleActivity: "accumulating/distributing/neutral",
          rationale: ["理由1", "理由2"],
          keyInsights: ["洞察1", "洞察2"],
        },
      );

      if (llmResult) {
        result.data.llmAnalysis = llmResult;
        result.data.netFlow = llmResult.netFlow === "inflow" ? Math.abs(result.data.netFlow) : -Math.abs(result.data.netFlow);
        result.confidence = llmResult.confidence || 0.7;
        result.sources = ["llm-deepseek", "blockchain-data"];
      }
    }

    this.cacheSet(`whale_${symbol}_${lookbackHours}`, result, 300_000);
    return result;
  }

  private async analyzeNetwork(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const chain = data.chain || "ethereum";

    const cached = this.cacheGet(`network_${chain}`);
    if (cached) return cached;

    const result = {
      type: "network-analysis-result",
      data: {
        chain,
        gasPrice: {
          fast: this.generateGasPrice(chain).fast,
          medium: this.generateGasPrice(chain).medium,
          slow: this.generateGasPrice(chain).slow,
        },
        transactionCount: this.generateTxCount(),
        activeAddresses: this.generateActiveAddresses(),
        networkUtilization: Math.random() * 30 + 40,
      },
      confidence: 0.55,
      sources: ["network-metrics"],
    };

    this.cacheSet(`network_${chain}`, result, 60_000);
    return result;
  }

  private async analyzeContracts(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const protocol = data.protocol || "all";

    const cached = this.cacheGet(`contract_${protocol}`);
    if (cached) return cached;

    const result = {
      type: "contract-analysis-result",
      data: {
        protocol,
        dexActivity: {
          volume24h: this.generateDexVolume(),
          txCount: this.generateDexTxCount(),
          topPairs: ["BTC-USDT", "ETH-USDT", "SOL-USDT"],
        },
        nftActivity: {
          sales24h: Math.floor(Math.random() * 5000 + 1000),
          volume24h: this.generateNftVolume(),
          floorPrices: { BTC: 0.05, ETH: 0.1, SOL: 2 },
        },
        defiMetrics: {
          totalValueLocked: this.generateTVL(),
          activeProtocols: 500 + Math.floor(Math.random() * 100),
        },
      },
      confidence: 0.5,
      sources: ["dex-data", "nft-data", "defi-data"],
    };

    this.cacheSet(`contract_${protocol}`, result, 120_000);
    return result;
  }

  private generateMockTransfers(symbol: string, hours: number): any[] {
    const transfers: any[] = [];
    const count = Math.floor(Math.random() * 10) + 5;
    for (let i = 0; i < count; i++) {
      transfers.push({
        id: `tx_${i}`,
        from: `0x${Math.random().toString(16).slice(2, 10)}...`,
        to: `0x${Math.random().toString(16).slice(2, 10)}...`,
        amount: Math.random() * 1000 + 10,
        symbol,
        timestamp: Date.now() - Math.random() * hours * 3600 * 1000,
        type: Math.random() > 0.5 ? "transfer" : "swap",
      });
    }
    return transfers;
  }

  private calculateNetFlow(symbol: string): number {
    return (Math.random() - 0.5) * 10000;
  }

  private generateGasPrice(chain: string): { fast: number; medium: number; slow: number } {
    const base = chain === "ethereum" ? 20 : chain === "polygon" ? 50 : 10;
    return {
      fast: base + Math.random() * 10,
      medium: base,
      slow: base - Math.random() * 5,
    };
  }

  private generateTxCount(): number {
    return Math.floor(Math.random() * 1000000) + 500000;
  }

  private generateActiveAddresses(): number {
    return Math.floor(Math.random() * 500000) + 200000;
  }

  private generateDexVolume(): number {
    return (Math.random() * 5 + 1) * 1e9;
  }

  private generateDexTxCount(): number {
    return Math.floor(Math.random() * 500000) + 100000;
  }

  private generateNftVolume(): number {
    return (Math.random() * 100 + 10) * 1e6;
  }

  private generateTVL(): number {
    return (Math.random() * 50 + 50) * 1e9;
  }
}
