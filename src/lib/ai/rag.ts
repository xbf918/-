/**
 * RAG (检索增强生成)
 *
 * 基于向量检索的知识库增强：将交易知识/历史经验向量化存储，
 * 推理时检索最相关片段作为上下文。
 */
export interface RAGDocument {
  id: string;
  content: string;
  type: "strategy" | "pattern" | "analysis" | "experience" | "market_event";
  metadata: Record<string, any>;
  embedding?: number[];
  timestamp: number;
}

export interface RAGConfig {
  embedDim?: number;
  topK?: number;
  similarityThreshold?: number;
  useBM25?: boolean;
}

export interface RAGSearchResult {
  document: RAGDocument;
  score: number;
  matchedTerms: string[];
}

/**
 * RAG 检索器
 * - 混合检索：向量相似度 + 关键词 BM25
 * - 文档分块 / 向量化
 */
export class RAGRetriever {
  private documents: RAGDocument[] = [];
  private embedDim: number;
  private topK: number;
  private similarityThreshold: number;
  private useBM25: boolean;
  private idf: Record<string, number> = {};
  private termFreqMap: Map<string, Array<{ docId: string; tf: number }>> = new Map();

  constructor(config: RAGConfig = {}) {
    this.embedDim = config.embedDim ?? 64;
    this.topK = config.topK ?? 5;
    this.similarityThreshold = config.similarityThreshold ?? 0.3;
    this.useBM25 = config.useBM25 ?? true;
  }

  /** 简化版词袋向量（实际应用应使用真实 embedding 模型） */
  private textToEmbedding(text: string): number[] {
    const tokens = this.tokenize(text);
    const vec = new Array(this.embedDim).fill(0);
    for (let i = 0; i < tokens.length; i++) {
      let hash = 0;
      for (let j = 0; j < tokens[i].length; j++) {
        hash = ((hash << 5) - hash) + tokens[i].charCodeAt(j);
        hash = hash & hash;
      }
      const idx = Math.abs(hash) % this.embedDim;
      vec[idx] += 1;
    }
    // 归一化
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map((v) => v / norm);
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 0);
  }

  addDocument(doc: Omit<RAGDocument, "embedding" | "timestamp"> & { timestamp?: number }): void {
    const embedding = this.textToEmbedding(doc.content);
    const tokens = this.tokenize(doc.content);
    const tfMap: Record<string, number> = {};
    for (const t of tokens) tfMap[t] = (tfMap[t] || 0) + 1;
    for (const [term, tf] of Object.entries(tfMap)) {
      if (!this.termFreqMap.has(term)) this.termFreqMap.set(term, []);
      this.termFreqMap.get(term)!.push({ docId: doc.id, tf });
    }
    this.documents.push({
      ...doc,
      embedding,
      timestamp: doc.timestamp ?? Date.now(),
    });
    this.recomputeIDF();
  }

  addDocuments(docs: Array<Omit<RAGDocument, "embedding" | "timestamp"> & { timestamp?: number }>): void {
    for (const d of docs) this.addDocument(d);
  }

  private recomputeIDF(): void {
    const n = this.documents.length;
    this.idf = {};
    for (const [term, list] of this.termFreqMap) {
      this.idf[term] = Math.log((n - list.length + 0.5) / (list.length + 0.5) + 1);
    }
  }

  /** 混合检索：向量 + BM25 */
  search(query: string, topK?: number): RAGSearchResult[] {
    const k = topK ?? this.topK;
    const queryVec = this.textToEmbedding(query);
    const queryTokens = this.tokenize(query);
    const results: RAGSearchResult[] = [];
    for (const doc of this.documents) {
      if (!doc.embedding) continue;
      const cosScore = this.cosineSimilarity(queryVec, doc.embedding);
      let bm25Score = 0;
      if (this.useBM25) {
        bm25Score = this.bm25(queryTokens, doc);
      }
      const score = cosScore * 0.6 + bm25Score * 0.4;
      if (score >= this.similarityThreshold) {
        const matchedTerms = queryTokens.filter((t) => doc.content.toLowerCase().includes(t));
        results.push({ document: doc, score, matchedTerms });
      }
    }
    return results.sort((a, b) => b.score - a.score).slice(0, k);
  }

  /** 构造 RAG 上下文提示 */
  buildContext(query: string, topK?: number): { context: string; sources: RAGDocument[] } {
    const results = this.search(query, topK);
    const context = results.map((r, i) => `[${i + 1}] ${r.document.content}`).join("\n\n");
    const sources = results.map((r) => r.document);
    return { context, sources };
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom === 0 ? 0 : dot / denom;
  }

  private bm25(queryTokens: string[], doc: RAGDocument, k1 = 1.5, b = 0.75): number {
    const docTokens = this.tokenize(doc.content);
    const docLen = docTokens.length;
    const avgLen = this.getAvgDocLen();
    const tf: Record<string, number> = {};
    for (const t of docTokens) tf[t] = (tf[t] || 0) + 1;
    let score = 0;
    for (const t of queryTokens) {
      if (!tf[t]) continue;
      const idf = this.idf[t] || 0;
      const tfVal = tf[t];
      const numerator = tfVal * (k1 + 1);
      const denominator = tfVal + k1 * (1 - b + b * (docLen / (avgLen || 1)));
      score += idf * (numerator / denominator);
    }
    // 归一化到 0-1 区间（简化）
    return Math.min(1, score / 10);
  }

  private getAvgDocLen(): number {
    if (this.documents.length === 0) return 100;
    const total = this.documents.reduce((s, d) => s + this.tokenize(d.content).length, 0);
    return total / this.documents.length;
  }

  getDocCount(): number {
    return this.documents.length;
  }

  getAllDocuments(): RAGDocument[] {
    return [...this.documents];
  }
}
