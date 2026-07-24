import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';

const EMAIL_CONFIG_FILE = path.resolve(__dirname, '..', '..', '..', '.email-config.json');

interface EmailConfig {
  provider: string;
  config: any;
}

const verificationCodes: Record<string, { code: string; type: string; expires: number }> = {};

function loadConfig(): EmailConfig | null {
  try {
    if (fs.existsSync(EMAIL_CONFIG_FILE)) {
      const data = fs.readFileSync(EMAIL_CONFIG_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Failed to load email config:', e);
  }
  return null;
}

function saveConfig(provider: string, config: any): { success: boolean; error?: string } {
  try {
    fs.writeFileSync(EMAIL_CONFIG_FILE, JSON.stringify({ provider, config }, null, 2));
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export function getEmailConfig() {
  return loadConfig() || { provider: '', config: {} };
}

export function setEmailConfig(provider: string, config: any) {
  return saveConfig(provider, config);
}

export async function testEmail(to: string): Promise<{ success: boolean; error?: string }> {
  try {
    const config = loadConfig();
    if (!config) {
      return { success: false, error: 'Email not configured' };
    }

    const transporter = nodemailer.createTransport(config.config);
    
    await transporter.sendMail({
      from: config.config.auth?.user || 'noreply@trading-bot.com',
      to,
      subject: 'Trading Bot - Test Email',
      text: 'This is a test email from Trading Bot. If you received this, email configuration is working correctly!',
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function sendVerificationCode(email: string, type: string): Promise<{ success: boolean; error?: string }> {
  try {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = Date.now() + 10 * 60 * 1000;

    const config = loadConfig();
    if (config) {
      const transporter = nodemailer.createTransport(config.config);
      await transporter.sendMail({
        from: config.config.auth?.user || 'noreply@trading-bot.com',
        to: email,
        subject: 'Verification Code - Trading Bot',
        text: `Your verification code is: ${code}\nThis code will expire in 10 minutes.`,
      });
    }

    verificationCodes[email] = { code, type, expires };
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export function verifyCode(email: string, code: string, type: string): { success: boolean; error?: string } {
  const record = verificationCodes[email];
  if (!record) {
    return { success: false, error: 'No verification code found' };
  }
  if (record.type !== type) {
    return { success: false, error: 'Invalid verification type' };
  }
  if (Date.now() > record.expires) {
    delete verificationCodes[email];
    return { success: false, error: 'Verification code expired' };
  }
  if (record.code !== code) {
    return { success: false, error: 'Invalid verification code' };
  }
  delete verificationCodes[email];
  return { success: true };
}
