import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query, run } from '../db';

const JWT_SECRET = process.env.JWT_SECRET || 'trading-bot-secret-key-change-in-production';
const JWT_EXPIRES_IN = '7d';

export interface User {
  id: number;
  email: string;
  password_hash: string;
  role: 'user' | 'admin';
  email_verified: number;
  created_at: number;
  updated_at: number;
}

export interface RegisterData {
  email: string;
  password: string;
  role?: 'user' | 'admin';
}

export interface LoginResult {
  success: boolean;
  token?: string;
  user?: Omit<User, 'password_hash'>;
  error?: string;
}

export async function register(data: RegisterData): Promise<LoginResult> {
  try {
    const { email, password } = data;
    const emailLower = email.trim().toLowerCase();

    const existing = await query<User>('SELECT * FROM users WHERE email = ?', [emailLower]);
    if (existing.length > 0) {
      return { success: false, error: 'Email already registered' };
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const role = data.role || 'user';
    const now = Date.now();

    const result = await run(
      'INSERT INTO users (email, password_hash, role, email_verified, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [emailLower, passwordHash, role, 1, now, now],
    );

    const user = {
      id: result.lastID,
      email: emailLower,
      role,
      email_verified: 1,
      created_at: now,
      updated_at: now,
    };

    const token = jwt.sign({ userId: user.id, email: user.email, role: user.role }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    return { success: true, token, user };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function login(email: string, password: string): Promise<LoginResult> {
  try {
    const emailLower = email.trim().toLowerCase();

    const users = await query<User>('SELECT * FROM users WHERE email = ?', [emailLower]);
    if (users.length === 0) {
      return { success: false, error: 'Invalid email or password' };
    }

    const user = users[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return { success: false, error: 'Invalid email or password' };
    }

    const token = jwt.sign({ userId: user.id, email: user.email, role: user.role }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    const { password_hash, ...userWithoutPassword } = user;

    return { success: true, token, user: userWithoutPassword };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export function verifyToken(token: string): any {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

export async function getUserById(id: number): Promise<Omit<User, 'password_hash'> | null> {
  const users = await query<User>('SELECT * FROM users WHERE id = ?', [id]);
  if (users.length === 0) return null;
  const { password_hash, ...user } = users[0];
  return user;
}

export async function updateUserRole(userId: number, role: 'user' | 'admin'): Promise<boolean> {
  try {
    await run('UPDATE users SET role = ?, updated_at = ? WHERE id = ?', [role, Date.now(), userId]);
    return true;
  } catch {
    return false;
  }
}

export async function changePassword(userId: number, oldPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
  try {
    const users = await query<User>('SELECT * FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      return { success: false, error: 'User not found' };
    }

    const valid = await bcrypt.compare(oldPassword, users[0].password_hash);
    if (!valid) {
      return { success: false, error: 'Current password is incorrect' };
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [newHash, Date.now(), userId]);

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export function authMiddleware(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.slice(7);
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = decoded;
  next();
}
