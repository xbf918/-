// 用户认证状态管理 - 基于 localStorage 的前端账号系统
import { create } from "zustand";
import { sendVerificationCode as apiSendCode, verifyEmailCode as apiVerifyCode } from "@/services/email";

export interface User {
  username: string;
  email: string;
  emailVerified: boolean;
  createdAt: number;
  lastLogin: number;
}

interface StoredUser extends User {
  passwordHash: string;
}

interface VerificationCode {
  email: string;
  code: string;
  expiresAt: number;
  createdAt: number;
  type: "register" | "reset";
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  error: string | null;
  verificationCode: string | null;
  verificationEmail: string | null;
  verificationExpiresAt: number | null;
  verificationType: "register" | "reset" | null;

  login: (username: string, password: string) => boolean;
  register: (username: string, email: string, password: string, code: string) => Promise<boolean>;
  sendVerificationCode: (email: string, type: "register" | "reset") => Promise<{ success: boolean; demo?: boolean; code?: string | null }>;
  verifyCode: (email: string, code: string, type: "register" | "reset") => Promise<boolean>;
  resetPassword: (email: string, code: string, newPassword: string) => Promise<boolean>;
  logout: () => void;
  clearError: () => void;
  setError: (error: string) => void;
  clearVerification: () => void;
}

const USERS_KEY = "cryptopulse_users";
const CURRENT_USER_KEY = "cryptopulse_current_user";
const VERIFICATION_KEY = "cryptopulse_verification";
const CODE_EXPIRY_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

function hashPassword(password: string): string {
  let hash = 0;
  const salt = "cryptopulse_salt_2026";
  const str = password + salt;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return btoa(String(hash));
}

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function isValidEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim());
}

function loadUsers(): StoredUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) return [];
    const users: StoredUser[] = JSON.parse(raw);
    return users.map((u) => ({
      ...u,
      email: u.email || "",
      emailVerified: u.emailVerified ?? false,
    }));
  } catch {
    return [];
  }
}

function saveUsers(users: StoredUser[]): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function loadCurrentUser(): User | null {
  try {
    const raw = localStorage.getItem(CURRENT_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveCurrentUser(user: User | null): void {
  if (user) {
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(CURRENT_USER_KEY);
  }
}

function loadVerification(): VerificationCode | null {
  try {
    const raw = localStorage.getItem(VERIFICATION_KEY);
    if (!raw) return null;
    const v: VerificationCode = JSON.parse(raw);
    if (Date.now() > v.expiresAt) {
      localStorage.removeItem(VERIFICATION_KEY);
      return null;
    }
    return v;
  } catch {
    return null;
  }
}

function saveVerification(v: VerificationCode | null): void {
  if (v) {
    localStorage.setItem(VERIFICATION_KEY, JSON.stringify(v));
  } else {
    localStorage.removeItem(VERIFICATION_KEY);
  }
}

const initialVerification = loadVerification();

export const useAuthStore = create<AuthState>((set, get) => ({
  user: loadCurrentUser(),
  isAuthenticated: !!loadCurrentUser(),
  error: null,
  verificationCode: initialVerification?.code ?? null,
  verificationEmail: initialVerification?.email ?? null,
  verificationExpiresAt: initialVerification?.expiresAt ?? null,
  verificationType: initialVerification?.type ?? null,

  sendVerificationCode: async (email, type) => {
    const trimmed = email.trim();
    if (!trimmed) {
      set({ error: "auth.errEmailEmpty" });
      return { success: false };
    }
    if (!isValidEmail(trimmed)) {
      set({ error: "auth.errInvalidEmail" });
      return { success: false };
    }

    const users = loadUsers();

    if (type === "register") {
      if (users.some((u) => u.email.toLowerCase() === trimmed.toLowerCase())) {
        set({ error: "auth.errEmailExists" });
        return { success: false };
      }
    } else {
      if (!users.some((u) => u.email.toLowerCase() === trimmed.toLowerCase())) {
        set({ error: "auth.errEmailNotFound" });
        return { success: false };
      }
    }

    try {
      const result = await apiSendCode(trimmed, type);
      if (result.success) {
        set({
          verificationEmail: trimmed,
          verificationType: type,
          verificationExpiresAt: Date.now() + CODE_EXPIRY_MS,
          verificationCode: result.demo ? result.code || null : null,
          error: null,
        });
        return { success: true, demo: result.demo || false, code: result.code || null };
      } else {
        set({ error: result.error || "auth.errSendFailed" });
        return { success: false };
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || err.message || "auth.errSendFailed";
      if (msg.includes("Too many requests") || msg.includes("429")) {
        set({ error: "auth.errCodeCooldown" });
      } else {
        set({ error: msg });
      }
      return { success: false };
    }
  },

  verifyCode: async (email, code, type) => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !code) {
      set({ error: "auth.errEmptyFields" });
      return false;
    }

    try {
      const result = await apiVerifyCode(trimmedEmail, code, type);
      if (result.success) {
        set({ error: null });
        return true;
      } else {
        const err = result.error || "";
        if (err.includes("expired")) {
          set({ error: "auth.errCodeExpired" });
        } else if (err.includes("Invalid")) {
          set({ error: "auth.errWrongCode" });
        } else {
          set({ error: "auth.errWrongCode" });
        }
        return false;
      }
    } catch (err: any) {
      set({ error: "auth.errWrongCode" });
      return false;
    }
  },

  login: (username, password) => {
    const trimmed = username.trim();
    if (!trimmed || !password) {
      set({ error: "auth.errEmptyFields" });
      return false;
    }

    const users = loadUsers();
    const found = users.find(
      (u) =>
        u.username.toLowerCase() === trimmed.toLowerCase() ||
        (u.email && u.email.toLowerCase() === trimmed.toLowerCase()),
    );

    if (!found) {
      set({ error: "auth.errUserNotFound" });
      return false;
    }

    if (found.passwordHash !== hashPassword(password)) {
      set({ error: "auth.errWrongPassword" });
      return false;
    }

    const user: User = {
      username: found.username,
      email: found.email,
      emailVerified: found.emailVerified,
      createdAt: found.createdAt,
      lastLogin: Date.now(),
    };

    found.lastLogin = user.lastLogin;
    saveUsers(users);
    saveCurrentUser(user);
    saveVerification(null);

    set({
      user,
      isAuthenticated: true,
      error: null,
      verificationCode: null,
      verificationEmail: null,
      verificationExpiresAt: null,
    });
    return true;
  },

  register: async (username, email, password, code) => {
    const trimmedUser = username.trim();
    const trimmedEmail = email.trim();

    if (!trimmedUser || !trimmedEmail || !password || !code) {
      set({ error: "auth.errEmptyFields" });
      return false;
    }

    if (trimmedUser.length < 3) {
      set({ error: "auth.errUsernameTooShort" });
      return false;
    }

    if (!isValidEmail(trimmedEmail)) {
      set({ error: "auth.errInvalidEmail" });
      return false;
    }

    if (password.length < 6) {
      set({ error: "auth.errPasswordTooShort" });
      return false;
    }

    const codeValid = await get().verifyCode(trimmedEmail, code, "register");
    if (!codeValid) {
      return false;
    }

    const users = loadUsers();
    if (users.some((u) => u.username.toLowerCase() === trimmedUser.toLowerCase())) {
      set({ error: "auth.errUserExists" });
      return false;
    }
    if (users.some((u) => u.email.toLowerCase() === trimmedEmail.toLowerCase())) {
      set({ error: "auth.errEmailExists" });
      return false;
    }

    const newUser: StoredUser = {
      username: trimmedUser,
      email: trimmedEmail,
      emailVerified: true,
      passwordHash: hashPassword(password),
      createdAt: Date.now(),
      lastLogin: Date.now(),
    };

    users.push(newUser);
    saveUsers(users);

    const user: User = {
      username: newUser.username,
      email: newUser.email,
      emailVerified: newUser.emailVerified,
      createdAt: newUser.createdAt,
      lastLogin: newUser.lastLogin,
    };
    saveCurrentUser(user);
    saveVerification(null);

    set({
      user,
      isAuthenticated: true,
      error: null,
      verificationCode: null,
      verificationEmail: null,
      verificationExpiresAt: null,
    });
    return true;
  },

  logout: () => {
    saveCurrentUser(null);
    set({
      user: null,
      isAuthenticated: false,
      error: null,
    });
  },

  resetPassword: async (email, code, newPassword) => {
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !code || !newPassword) {
      set({ error: "auth.errEmptyFields" });
      return false;
    }

    if (!isValidEmail(trimmedEmail)) {
      set({ error: "auth.errInvalidEmail" });
      return false;
    }

    if (newPassword.length < 6) {
      set({ error: "auth.errPasswordTooShort" });
      return false;
    }

    const codeValid = await get().verifyCode(trimmedEmail, code, "reset");
    if (!codeValid) {
      return false;
    }

    const users = loadUsers();
    const found = users.find((u) => u.email.toLowerCase() === trimmedEmail.toLowerCase());
    if (!found) {
      set({ error: "auth.errEmailNotFound" });
      return false;
    }

    found.passwordHash = hashPassword(newPassword);
    saveUsers(users);
    saveVerification(null);

    set({
      error: null,
      verificationCode: null,
      verificationEmail: null,
      verificationExpiresAt: null,
      verificationType: null,
    });
    return true;
  },

  clearError: () => set({ error: null }),

  setError: (error) => set({ error }),

  clearVerification: () => {
    saveVerification(null);
    set({
      verificationCode: null,
      verificationEmail: null,
      verificationExpiresAt: null,
      verificationType: null,
    });
  },
}));
