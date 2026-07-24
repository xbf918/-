import axios from "axios";
import type { NewsItem } from "@/types";

// 简易情绪词典（基于关键词的轻量情绪分析）
const POSITIVE = [
  "surge", "soar", "rally", "bull", "bullish", "breakout", "adopt", "adoption",
  "approve", "approved", "partnership", " partnership", "fund", "funding",
  "invest", "investment", "gain", "pump", "accumulate", "upgrade", "milestone",
  "record", "high", "support", "buy", "long", "outperform", "win", "launch",
  "突破", "上涨", "利好", "采用", "合作", "投资", "增持", "突破", "新高", "看涨",
];

const NEGATIVE = [
  "crash", "plunge", "bear", "bearish", "dump", "hack", "hacked", "breach",
  "ban", "banned", "lawsuit", "sec", "fraud", "scam", "rug", "liquidate",
  "liquidation", "fear", "panic", "sell", "short", "decline", "drop", "fall",
  "downgrade", "warning", "risk", "collapse", "outflow", "loss", "delist",
  "暴跌", "下跌", "利空", "黑客", "攻击", "禁令", "诉讼", "欺诈", "抛售", "看跌",
  "清算", "爆仓", "风险",
];

function analyzeSentiment(title: string, body = ""): {
  sentiment: NewsItem["sentiment"];
  sentimentScore: number;
} {
  const text = `${title} ${body}`.toLowerCase();
  let score = 0;
  for (const w of POSITIVE) if (text.includes(w.toLowerCase())) score += 1;
  for (const w of NEGATIVE) if (text.includes(w.toLowerCase())) score -= 1;
  if (score > 1) return { sentiment: "positive", sentimentScore: Math.min(score * 20, 100) };
  if (score < -1) return { sentiment: "negative", sentimentScore: Math.max(score * 20, -100) };
  return { sentiment: "neutral", sentimentScore: 0 };
}

// RSS 源配置
const RSS_SOURCES = [
  {
    name: "Cointelegraph",
    url: "https://api.rss2json.com/v1/api.json?rss_url=https%3A//cointelegraph.com/rss",
    parse: (data: any): RawArticle[] => {
      const items = data?.items ?? [];
      return items.map((item: any, i: number) => ({
        id: `ct_${item.guid ?? i}`,
        title: item.title ?? "",
        source: "Cointelegraph",
        url: item.link ?? "",
        publishedOn: item.pubDate ? Math.floor(new Date(item.pubDate).getTime() / 1000) : 0,
        body: stripHtml(item.description ?? item.content ?? ""),
        categories: (item.categories ?? []).slice(0, 5),
      }));
    },
  },
  {
    name: "CoinDesk",
    url: "https://api.rss2json.com/v1/api.json?rss_url=https%3A//www.coindesk.com/arc/outboundfeeds/rss/",
    parse: (data: any): RawArticle[] => {
      const items = data?.items ?? [];
      return items.map((item: any, i: number) => ({
        id: `cd_${item.guid ?? i}`,
        title: item.title ?? "",
        source: "CoinDesk",
        url: item.link ?? "",
        publishedOn: item.pubDate ? Math.floor(new Date(item.pubDate).getTime() / 1000) : 0,
        body: stripHtml(item.description ?? item.content ?? ""),
        categories: (item.categories ?? []).slice(0, 5),
      }));
    },
  },
  {
    name: "Decrypt",
    url: "https://api.rss2json.com/v1/api.json?rss_url=https%3A//decrypt.co/feed",
    parse: (data: any): RawArticle[] => {
      const items = data?.items ?? [];
      return items.map((item: any, i: number) => ({
        id: `dc_${item.guid ?? i}`,
        title: item.title ?? "",
        source: "Decrypt",
        url: item.link ?? "",
        publishedOn: item.pubDate ? Math.floor(new Date(item.pubDate).getTime() / 1000) : 0,
        body: stripHtml(item.description ?? item.content ?? ""),
        categories: (item.categories ?? []).slice(0, 5),
      }));
    },
  },
];

interface RawArticle {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedOn: number;
  body: string;
  categories: string[];
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

// 关键词过滤（只保留与加密货币相关的新闻）
const CRYPTO_KEYWORDS = [
  "bitcoin", "btc", "ethereum", "eth", "crypto", "blockchain", "defi",
  "altcoin", "token", "stablecoin", "usdt", "usdc", "binance", "solana",
  "xrp", "doge", "nft", "web3", "mining", "halving", "etf", "fed",
  "比特币", "以太坊", "加密", "区块链",
];

// ============ 翻译模块 ============
const TRANSLATION_CACHE_KEY = "cryptopulse_translations";

interface TranslationCache {
  [key: string]: { zh: string; ts: number };
}

function loadTranslationCache(): TranslationCache {
  try {
    const raw = localStorage.getItem(TRANSLATION_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveTranslationCache(cache: TranslationCache): void {
  try {
    // 清理7天前的缓存
    const week = Date.now() - 7 * 24 * 3600 * 1000;
    const cleaned: TranslationCache = {};
    for (const [k, v] of Object.entries(cache)) {
      if (v.ts > week) cleaned[k] = v;
    }
    localStorage.setItem(TRANSLATION_CACHE_KEY, JSON.stringify(cleaned));
  } catch { /* ignore */ }
}

async function translateToChinese(text: string): Promise<string> {
  if (!text || !text.trim()) return text;
  // 如果已经是中文为主，直接返回
  const zhChars = text.match(/[\u4e00-\u9fff]/g);
  if (zhChars && zhChars.length / text.length > 0.3) return text;

  const cache = loadTranslationCache();
  const cacheKey = text.slice(0, 80).toLowerCase();
  if (cache[cacheKey]?.zh) return cache[cacheKey].zh;

  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 500))}&langpair=en|zh-CN`;
    const res = await axios.get(url, { timeout: 8000 });
    const translated = res?.data?.responseData?.translatedText;
    if (translated && translated !== text) {
      cache[cacheKey] = { zh: translated, ts: Date.now() };
      saveTranslationCache(cache);
      return translated;
    }
  } catch {
    // 翻译失败，返回原文
  }
  return text;
}

async function translateNewsItems(items: NewsItem[]): Promise<NewsItem[]> {
  const cache = loadTranslationCache();
  const toTranslate: { index: number; text: string }[] = [];

  // 先检查缓存
  for (let i = 0; i < items.length; i++) {
    const title = items[i].title;
    const key = title.slice(0, 80).toLowerCase();
    if (cache[key]?.zh) {
      items[i].titleZh = cache[key].zh;
    } else {
      toTranslate.push({ index: i, text: title });
    }
  }

  // 批量翻译未缓存的（并发限制3个）
  if (toTranslate.length > 0) {
    const batch = toTranslate.slice(0, 8);
    const results = await Promise.allSettled(
      batch.map(async ({ text }) => {
        try {
          const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 500))}&langpair=en|zh-CN`;
          const res = await axios.get(url, { timeout: 8000 });
          return res?.data?.responseData?.translatedText ?? text;
        } catch {
          return text;
        }
      }),
    );

    const newCache = { ...cache };
    for (let i = 0; i < batch.length; i++) {
      const { index } = batch[i];
      const result = results[i];
      if (result.status === "fulfilled") {
        const translated = result.value;
        if (translated !== items[index].title) {
          items[index].titleZh = translated;
          const key = items[index].title.slice(0, 80).toLowerCase();
          newCache[key] = { zh: translated, ts: Date.now() };
        }
      }
    }
    saveTranslationCache(newCache);
  }

  return items;
}

function isCryptoRelated(article: RawArticle): boolean {
  const text = `${article.title} ${article.body}`.toLowerCase();
  return CRYPTO_KEYWORDS.some((kw) => text.includes(kw));
}

async function fetchFromSource(
  source: typeof RSS_SOURCES[0],
  signal?: AbortSignal,
): Promise<NewsItem[]> {
  try {
    const res = await axios.get(source.url, { timeout: 12_000, signal });
    if (res.data?.status !== "ok") return [];
    const articles = source.parse(res.data);
    return articles
      .filter(isCryptoRelated)
      .map((a) => {
        const { sentiment, sentimentScore } = analyzeSentiment(a.title, a.body);
        return {
          id: a.id,
          title: a.title,
          source: a.source,
          url: a.url,
          publishedOn: a.publishedOn,
          categories: a.categories,
          body: a.body,
          sentiment,
          sentimentScore,
        } satisfies NewsItem;
      });
  } catch {
    return [];
  }
}

/** 获取加密货币新闻（多源聚合 + 故障转移 + 自动翻译） */
export async function fetchCryptoNews(
  _categories = "BTC,ETH",
  limit = 20,
  signal?: AbortSignal,
): Promise<NewsItem[]> {
  // 并行请求所有源
  const results = await Promise.allSettled(
    RSS_SOURCES.map((src) => fetchFromSource(src, signal)),
  );

  const allNews: NewsItem[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") allNews.push(...r.value);
  }

  // 按时间排序，去重，取前 N 条
  const seen = new Set<string>();
  const deduped = allNews
    .sort((a, b) => b.publishedOn - a.publishedOn)
    .filter((n) => {
      const key = n.title.toLowerCase().slice(0, 60);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);

  // 异步翻译标题（不阻塞返回，翻译后更新缓存）
  translateNewsItems(deduped).catch(() => {});

  return deduped;
}

/** 对已缓存的新闻列表补充翻译（用于切换语言时触发） */
export async function ensureTranslations(items: NewsItem[]): Promise<NewsItem[]> {
  const needsTranslation = items.some((n) => !n.titleZh);
  if (!needsTranslation) return items;
  return translateNewsItems([...items]);
}
