import fs from "node:fs";
import path from "node:path";
import type { ApiCredentials, ExchangeId } from "./types.js";

/**
 * API 凭证存储
 * 使用内存 Map + 文件持久化
 */

const STORAGE_FILE = path.resolve(process.cwd(), "credentials.json");

/** 内存中的凭证存储 */
const store = new Map<ExchangeId, ApiCredentials>();

/** 是否已从文件加载 */
let loaded = false;

/** 隐藏 apiSecret 中间部分，只显示前4位和后4位 */
function maskSecret(secret: string): string {
  if (!secret) return "";
  if (secret.length <= 8) return "****";
  return `${secret.slice(0, 4)}****${secret.slice(-4)}`;
}

/** 返回脱敏后的凭证副本（隐藏 apiSecret 中间部分） */
function maskCredentials(creds: ApiCredentials): ApiCredentials & { apiSecret: string } {
  return {
    ...creds,
    apiSecret: maskSecret(creds.apiSecret),
  };
}

/** 从文件加载凭证到内存 */
function loadFromFile(): void {
  if (loaded) return;
  loaded = true;
  try {
    if (fs.existsSync(STORAGE_FILE)) {
      const raw = fs.readFileSync(STORAGE_FILE, "utf-8");
      const data = JSON.parse(raw) as Record<string, ApiCredentials>;
      for (const [key, value] of Object.entries(data)) {
        store.set(key as ExchangeId, value);
      }
    }
  } catch (err) {
    // 加载失败不抛出，保持内存为空
    console.warn("[storage] Failed to load credentials file:", err);
  }
}

/** 将内存中的凭证持久化到文件 */
function persistToFile(): void {
  try {
    const obj: Record<string, ApiCredentials> = {};
    for (const [key, value] of store.entries()) {
      obj[key] = value;
    }
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(obj, null, 2), "utf-8");
  } catch (err) {
    console.warn("[storage] Failed to persist credentials file:", err);
  }
}

/**
 * 保存凭证
 */
export function saveCredentials(creds: ApiCredentials): ApiCredentials {
  loadFromFile();
  store.set(creds.exchange, creds);
  persistToFile();
  return creds;
}

/**
 * 获取凭证（完整凭证，包含 apiSecret）
 */
export function getCredentials(exchange: ExchangeId): ApiCredentials | null {
  loadFromFile();
  return store.get(exchange) ?? null;
}

/**
 * 删除凭证
 */
export function deleteCredentials(exchange: ExchangeId): boolean {
  loadFromFile();
  const existed = store.delete(exchange);
  if (existed) {
    persistToFile();
  }
  return existed;
}

/**
 * 获取所有凭证（返回时隐藏 apiSecret 的中间部分）
 */
export function getAllCredentials(): Array<ApiCredentials & { apiSecret: string }> {
  loadFromFile();
  const result: Array<ApiCredentials & { apiSecret: string }> = [];
  for (const creds of store.values()) {
    result.push(maskCredentials(creds));
  }
  return result;
}
