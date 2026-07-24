import { query, run } from '../db';

export interface Credential {
  id?: number;
  exchange: string;
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
  testnet: number;
  validated: number;
  permissions: string;
  created_at: number;
  updated_at: number;
}

export async function getCredentials(): Promise<Credential[]> {
  const rows = await query<Credential>('SELECT * FROM credentials ORDER BY id DESC');
  return rows.map(row => ({
    ...row,
    apiSecret: '***' + row.apiSecret.slice(-4),
  }));
}

export async function getCredentialsRaw(): Promise<Credential[]> {
  return await query<Credential>('SELECT * FROM credentials ORDER BY id DESC');
}

export async function saveCredentials(cred: any): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    const now = Date.now();
    const existing = await query<Credential>('SELECT * FROM credentials WHERE exchange = ?', [cred.exchange]);
    
    if (existing.length > 0) {
      await run(
        'UPDATE credentials SET apiKey = ?, apiSecret = ?, passphrase = ?, testnet = ?, validated = ?, permissions = ?, updated_at = ? WHERE exchange = ?',
        [cred.apiKey, cred.apiSecret, cred.passphrase || '', cred.testnet ? 1 : 0, cred.validated ? 1 : 0, JSON.stringify(cred.permissions || []), now, cred.exchange]
      );
      return { success: true, id: existing[0].id };
    } else {
      const result = await run(
        'INSERT INTO credentials (exchange, apiKey, apiSecret, passphrase, testnet, validated, permissions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [cred.exchange, cred.apiKey, cred.apiSecret, cred.passphrase || '', cred.testnet ? 1 : 0, cred.validated ? 1 : 0, JSON.stringify(cred.permissions || []), now, now]
      );
      return { success: true, id: result.lastID };
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteCredentials(exchange: string): Promise<{ success: boolean; error?: string }> {
  try {
    await run('DELETE FROM credentials WHERE exchange = ?', [exchange]);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function setValidated(exchange: string, validated: boolean): Promise<void> {
  await run('UPDATE credentials SET validated = ?, updated_at = ? WHERE exchange = ?', [validated ? 1 : 0, Date.now(), exchange]);
}
