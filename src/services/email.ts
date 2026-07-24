import axios from "axios";

const client = axios.create({ baseURL: "", timeout: 15_000 });

const API = {
  config: "/api/email/config",
  test: "/api/email/test",
  sendCode: "/api/email/send-code",
  verifyCode: "/api/email/verify-code",
};

export type EmailProvider = "demo" | "emailjs" | "smtp";

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
}

export interface EmailJsConfig {
  serviceId: string;
  templateId: string;
  publicKey: string;
  privateKey: string;
  fromName: string;
  fromEmail: string;
}

export interface EmailConfigResponse {
  provider: EmailProvider;
  config?: Partial<SmtpConfig> | Partial<EmailJsConfig> | null;
}

export async function getEmailConfig(): Promise<EmailConfigResponse> {
  const { data } = await client.get(API.config);
  return data;
}

export async function saveEmailConfig(
  provider: EmailProvider,
  config: Record<string, any>,
): Promise<{ success: boolean; error?: string }> {
  const { data } = await client.post(API.config, { provider, config });
  return data;
}

export async function testEmailConfig(
  to: string,
): Promise<{ success: boolean; error?: string; demo?: boolean; code?: string }> {
  const { data } = await client.post(API.test, { to });
  return data;
}

export async function sendVerificationCode(
  email: string,
  type: "register" | "reset",
): Promise<{ success: boolean; error?: string; demo?: boolean; code?: string }> {
  const { data } = await client.post(API.sendCode, { email, type });
  return data;
}

export async function verifyEmailCode(
  email: string,
  code: string,
  type: "register" | "reset",
): Promise<{ success: boolean; error?: string }> {
  const { data } = await client.post(API.verifyCode, { email, code, type });
  return data;
}
