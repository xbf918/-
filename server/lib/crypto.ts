import crypto from "node:crypto";

/**
 * 计算 HMAC-SHA256 签名（hex 编码）
 * @param secret - API Secret
 * @param message - 待签名消息
 * @returns hex 编码的签名
 */
export function hmacSha256(secret: string, message: string): string {
  return crypto.createHmac("sha256", secret).update(message).digest("hex");
}

/**
 * 计算 HMAC-SHA256 签名（base64 编码）
 * 用于 OKX 签名
 * @param secret - API Secret
 * @param message - 待签名消息
 * @returns base64 编码的签名
 */
export function hmacSha256Base64(secret: string, message: string): string {
  return crypto.createHmac("sha256", secret).update(message).digest("base64");
}

/**
 * 返回当前毫秒时间戳
 */
export function timestamp(): number {
  return Date.now();
}

/**
 * 返回 ISO8601 格式时间戳（OKX 使用）
 */
export function isoTimestamp(): string {
  return new Date().toISOString();
}
