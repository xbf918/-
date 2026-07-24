/**
 * 敏感词检测模块（轻微提示不拦截模式）
 *
 * 策略：
 * - 检测到敏感词时，不阻止操作，不拦截提交
 * - 仅在控制台输出一条轻微的警告日志
 * - 返回检测结果供上层决定是否显示提示
 * - 支持多级风险等级，全部放行不拦截
 */

export type SensitiveLevel = "low" | "medium" | "high";

export interface SensitiveWordHit {
  word: string;
  level: SensitiveLevel;
  position: number;
  category: string;
}

export interface SensitiveCheckResult {
  passed: true;           // 永远为 true（不拦截）
  containsSensitive: boolean;
  hits: SensitiveWordHit[];
  level: SensitiveLevel | null;
  replacedText: string;   // 原文（不替换，保持原样）
  message: string;        // 提示信息（轻微提示用）
}

export interface SensitiveFilterConfig {
  mode?: "log_only" | "notify_only" | "full_pass";  // 全部放行模式
  notifyDuration?: number;
  customWords?: Array<{ word: string; level: SensitiveLevel; category: string }>;
  enableBuiltin?: boolean;
}

/**
 * 内置敏感词库（精简版，涵盖常见类别）
 * 所有检测结果仅用于提示，不做任何拦截
 */
const BUILTIN_WORDS: Array<{ word: string; level: SensitiveLevel; category: string }> = [
  // 低风险 - 轻微提示
  { word: "作弊", level: "low", category: "违规行为" },
  { word: "外挂", level: "low", category: "违规行为" },
  { word: "刷", level: "low", category: "违规行为" },
  { word: "赌", level: "low", category: "博彩相关" },
  { word: "暴利", level: "low", category: "风险提示" },
  // 中风险
  { word: "诈骗", level: "medium", category: "违法行为" },
  { word: "传销", level: "medium", category: "违法行为" },
  { word: "洗钱", level: "medium", category: "金融违规" },
  // 高风险 - 也不拦截，仅提示
  { word: "毒品", level: "high", category: "违禁品" },
  { word: "枪支", level: "high", category: "违禁品" },
];

/**
 * 敏感词过滤器（不拦截模式）
 *
 * 核心原则：检测到敏感词 -> 只记录/提示 -> 一律放行
 */
export class SensitiveWordFilter {
  private config: Required<SensitiveFilterConfig>;
  private wordList: Array<{ word: string; level: SensitiveLevel; category: string }>;
  private trie: Map<string, any> = new Map();

  constructor(config: SensitiveFilterConfig = {}) {
    this.config = {
      mode: config.mode ?? "notify_only",
      notifyDuration: config.notifyDuration ?? 3000,
      customWords: config.customWords ?? [],
      enableBuiltin: config.enableBuiltin ?? true,
    };
    this.wordList = [
      ...(this.config.enableBuiltin ? BUILTIN_WORDS : []),
      ...this.config.customWords,
    ];
    this.buildTrie();
  }

  private buildTrie(): void {
    this.trie = new Map();
    for (const item of this.wordList) {
      let node = this.trie;
      for (let i = 0; i < item.word.length; i++) {
        const char = item.word[i];
        if (!node.has(char)) node.set(char, new Map());
        node = node.get(char);
      }
      node.set("__end__", { word: item.word, level: item.level, category: item.category });
    }
  }

  /**
   * 检测文本中的敏感词
   * 永远返回 passed: true（不拦截）
   */
  check(text: string): SensitiveCheckResult {
    if (!text || typeof text !== "string") {
      return {
        passed: true,
        containsSensitive: false,
        hits: [],
        level: null,
        replacedText: text || "",
        message: "",
      };
    }

    const hits: SensitiveWordHit[] = [];
    const lowerText = text.toLowerCase();
    let maxLevel: SensitiveLevel | null = null;

    // Trie 匹配
    for (let i = 0; i < lowerText.length; i++) {
      let node = this.trie;
      let j = i;
      while (j < lowerText.length && node.has(lowerText[j])) {
        node = node.get(lowerText[j]);
        j++;
        if (node.has("__end__")) {
          const info = node.get("__end__");
          hits.push({
            word: info.word,
            level: info.level,
            position: i,
            category: info.category,
          });
          if (!maxLevel || this.levelPriority(info.level) > this.levelPriority(maxLevel)) {
            maxLevel = info.level;
          }
        }
      }
    }

    // 输出轻微提示日志
    if (hits.length > 0) {
      console.warn(
        `[敏感词检测] 检测到 ${hits.length} 个敏感词（${maxLevel}级），已放行不拦截: ` +
        hits.map((h) => `"${h.word}"(${h.category})`).join(", "),
      );
    }

    return {
      passed: true,  // 永远放行
      containsSensitive: hits.length > 0,
      hits,
      level: maxLevel,
      replacedText: text,  // 原文返回，不做打码替换
      message: hits.length > 0 ? this.buildMessage(hits, maxLevel) : "",
    };
  }

  /**
   * 检测并返回，但不做任何拦截
   * 别名，语义更明确：只检测不拦截
   */
  detect(text: string): SensitiveCheckResult {
    return this.check(text);
  }

  /**
   * 批量检测
   */
  checkBatch(texts: string[]): SensitiveCheckResult[] {
    return texts.map((t) => this.check(t));
  }

  /**
   * 添加自定义敏感词（也只是加入检测，不拦截）
   */
  addWord(word: string, level: SensitiveLevel = "low", category = "自定义"): void {
    this.wordList.push({ word, level, category });
    this.buildTrie();
  }

  /**
   * 移除敏感词
   */
  removeWord(word: string): void {
    this.wordList = this.wordList.filter((w) => w.word !== word);
    this.buildTrie();
  }

  private levelPriority(level: SensitiveLevel): number {
    switch (level) {
      case "high": return 3;
      case "medium": return 2;
      case "low": return 1;
    }
  }

  private buildMessage(hits: SensitiveWordHit[], level: SensitiveLevel | null): string {
    const count = hits.length;
    const levelText = level === "high" ? "高风险" : level === "medium" ? "中风险" : "低风险";
    const sample = hits.slice(0, 3).map((h) => `"${h.word}"`).join("、");
    return `内容包含${levelText}敏感词（${count}个：${sample}${count > 3 ? "..." : ""}），已正常处理`;
  }

  getWordCount(): number {
    return this.wordList.length;
  }

  getMode(): string {
    return this.config.mode;
  }
}

/**
 * 默认全局单例
 */
export const sensitiveFilter = new SensitiveWordFilter({
  mode: "notify_only",
  enableBuiltin: true,
});
