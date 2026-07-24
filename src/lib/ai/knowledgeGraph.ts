/**
 * 知识图谱 (Knowledge Graph)
 *
 * 构建交易领域的实体和关系网络，支持知识推理、实体关联分析
 */

export interface KGEntity {
  id: string;
  type: "token" | "indicator" | "pattern" | "strategy" | "market_state" | "event" | "risk";
  name: string;
  properties: Record<string, any>;
  embeddings?: number[];
}

export interface KGRelation {
  from: string;
  to: string;
  type:
    | "correlated_with"    // 相关性
    | "causes"             // 因果
    | "indicates"          // 预示
    | "belongs_to"         // 归属
    | "opposes"            // 反向
    | "triggers"           // 触发
    | "used_by"            // 被使用
    | "followed_by";       // 跟随
  weight: number;  // -1 ~ 1
  confidence: number; // 0 ~ 1
}

export interface KnowledgeGraphConfig {
  entities?: KGEntity[];
  relations?: KGRelation[];
}

export class KnowledgeGraph {
  private entities: Map<string, KGEntity> = new Map();
  private relations: KGRelation[] = [];
  private adjacency: Map<string, Map<string, KGRelation>> = new Map();

  constructor(config: KnowledgeGraphConfig = {}) {
    if (config.entities) {
      for (const e of config.entities) this.addEntity(e);
    }
    if (config.relations) {
      for (const r of config.relations) this.addRelation(r);
    }
  }

  addEntity(entity: KGEntity): void {
    this.entities.set(entity.id, entity);
    if (!this.adjacency.has(entity.id)) this.adjacency.set(entity.id, new Map());
  }

  getEntity(id: string): KGEntity | undefined {
    return this.entities.get(id);
  }

  addRelation(relation: KGRelation): void {
    this.relations.push(relation);
    if (!this.adjacency.has(relation.from)) this.adjacency.set(relation.from, new Map());
    this.adjacency.get(relation.from)!.set(relation.to, relation);
    // 反向关系（对称类型自动双向）
    const symmetric = new Set(["correlated_with", "opposes"]);
    if (symmetric.has(relation.type) && this.adjacency.has(relation.to)) {
      this.adjacency.get(relation.to)!.set(relation.from, {
        ...relation, from: relation.to, to: relation.from,
      });
    }
  }

  /** 获取实体的直接邻居 */
  getNeighbors(entityId: string, relationType?: string): Array<{ entity: KGEntity; relation: KGRelation }> {
    const neighbors = this.adjacency.get(entityId);
    if (!neighbors) return [];
    const result: Array<{ entity: KGEntity; relation: KGRelation }> = [];
    for (const [targetId, rel] of neighbors) {
      if (relationType && rel.type !== relationType) continue;
      const entity = this.entities.get(targetId);
      if (entity) result.push({ entity, relation: rel });
    }
    return result;
  }

  /** 两实体间的路径搜索（BFS，最多 depth 跳） */
  findPath(fromId: string, toId: string, maxDepth = 3): KGRelation[] | null {
    if (fromId === toId) return [];
    const visited = new Set<string>();
    const queue: Array<{ id: string; path: KGRelation[] }> = [{ id: fromId, path: [] }];
    visited.add(fromId);
    while (queue.length > 0) {
      const { id, path } = queue.shift()!;
      if (path.length >= maxDepth) continue;
      const neighbors = this.adjacency.get(id);
      if (!neighbors) continue;
      for (const [targetId, rel] of neighbors) {
        if (visited.has(targetId)) continue;
        const newPath = [...path, rel];
        if (targetId === toId) return newPath;
        visited.add(targetId);
        queue.push({ id: targetId, path: newPath });
      }
    }
    return null;
  }

  /** 中心性分析：找出最核心的实体（度数） */
  getCentralEntities(limit = 10): Array<{ entity: KGEntity; degree: number; weightedDegree: number }> {
    const scores: Array<{ entity: KGEntity; degree: number; weightedDegree: number }> = [];
    for (const [id, entity] of this.entities) {
      const neighbors = this.adjacency.get(id);
      if (!neighbors) { scores.push({ entity, degree: 0, weightedDegree: 0 }); continue; }
      let degree = 0;
      let wDegree = 0;
      for (const rel of neighbors.values()) {
        degree++;
        wDegree += Math.abs(rel.weight) * rel.confidence;
      }
      scores.push({ entity, degree, weightedDegree: wDegree });
    }
    return scores.sort((a, b) => b.weightedDegree - a.weightedDegree).slice(0, limit);
  }

  /** 关联推理：给定实体集合，找出最相关的其他实体 */
  reason(inputEntities: string[], topK = 5): Array<{ entity: KGEntity; score: number; pathReasons: string[] }> {
    const scores: Record<string, number> = {};
    const reasons: Record<string, string[]> = {};
    for (const inputId of inputEntities) {
      const neighbors = this.getNeighbors(inputId);
      for (const { entity, relation } of neighbors) {
        if (inputEntities.includes(entity.id)) continue;
        if (!scores[entity.id]) { scores[entity.id] = 0; reasons[entity.id] = []; }
        const contribution = relation.weight * relation.confidence;
        scores[entity.id] += contribution;
        reasons[entity.id].push(`${this.entities.get(inputId)?.name || inputId} --${relation.type}--> ${entity.name} (${contribution.toFixed(2)})`);
      }
    }
    const sorted = Object.entries(scores)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, topK)
      .map(([id, score]) => ({
        entity: this.entities.get(id)!,
        score,
        pathReasons: reasons[id] || [],
      }));
    return sorted;
  }

  /** 从交易数据自动构建知识图谱 */
  static buildFromTradingData(tokens: string[], patterns: string[], indicators: string[]): KnowledgeGraph {
    const kg = new KnowledgeGraph();
    tokens.forEach((t, i) => kg.addEntity({ id: `token_${t}`, type: "token", name: t, properties: { index: i } }));
    patterns.forEach((p, i) => kg.addEntity({ id: `pattern_${p}`, type: "pattern", name: p, properties: { index: i } }));
    indicators.forEach((i) => kg.addEntity({ id: `indicator_${i}`, type: "indicator", name: i, properties: {} }));
    kg.addEntity({ id: "state_trending", type: "market_state", name: "趋势市", properties: {} });
    kg.addEntity({ id: "state_ranging", type: "market_state", name: "震荡市", properties: {} });
    kg.addEntity({ id: "state_volatile", type: "market_state", name: "高波动", properties: {} });
    kg.addRelation({ from: "pattern_双底", to: "state_trending", type: "indicates", weight: 0.7, confidence: 0.8 });
    kg.addRelation({ from: "pattern_双顶", to: "state_trending", type: "indicates", weight: -0.7, confidence: 0.8 });
    kg.addRelation({ from: "pattern_三角形", to: "state_ranging", type: "indicates", weight: 0.6, confidence: 0.7 });
    kg.addRelation({ from: "indicator_RSI超买", to: "state_trending", type: "opposes", weight: -0.5, confidence: 0.6 });
    return kg;
  }

  getEntityCount(): number { return this.entities.size; }
  getRelationCount(): number { return this.relations.length; }

  getAllEntities(): KGEntity[] { return Array.from(this.entities.values()); }
  getAllRelations(): KGRelation[] { return [...this.relations]; }
}
