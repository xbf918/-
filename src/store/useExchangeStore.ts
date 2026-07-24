import { create } from "zustand";
import type {
  ApiCredentials,
  ExchangeAccount,
  ExchangeConfig,
  ExchangeId,
  TradeMode,
} from "@/types/exchange";
import * as exchangeApi from "@/services/exchange";

interface ExchangeState {
  // 状态
  mode: TradeMode;
  activeExchange: ExchangeId;
  credentials: Record<ExchangeId, ApiCredentials | null>;
  connections: Record<ExchangeId, { connected: boolean; testing: boolean; error?: string }>;
  account: ExchangeAccount | null;
  syncing: boolean;

  // Actions
  init: () => Promise<void>;
  setMode: (mode: TradeMode) => void;
  setActiveExchange: (exchange: ExchangeId) => void;
  saveCredentials: (creds: Omit<ApiCredentials, "createdAt" | "validated">) => Promise<boolean>;
  removeCredentials: (exchange: ExchangeId) => Promise<void>;
  testConnection: (exchange: ExchangeId, creds?: { apiKey: string; apiSecret: string; passphrase?: string; testnet: boolean }) => Promise<boolean>;
  refreshAccount: () => Promise<void>;
  getMode: () => TradeMode;
}

const DEFAULT_CONFIG: ExchangeConfig = {
  mode: "paper",
  activeExchange: "paper",
  credentials: { binance: null, okx: null, paper: null },
  autoSync: true,
  syncInterval: 30_000,
};

export const useExchangeStore = create<ExchangeState>((set, get) => ({
  mode: "paper",
  activeExchange: "paper",
  credentials: { binance: null, okx: null, paper: null },
  connections: {
    binance: { connected: false, testing: false },
    okx: { connected: false, testing: false },
    paper: { connected: true, testing: false },
  },
  account: null,
  syncing: false,

  init: async () => {
    try {
      const creds = await exchangeApi.getAllCredentials();
      const connections = { ...get().connections };
      for (const ex of ["binance", "okx"] as ExchangeId[]) {
        if (creds[ex]?.validated) {
          connections[ex] = { connected: true, testing: false };
        }
      }
      set({ credentials: creds, connections });
    } catch {
      // 代理服务器未启动，保持默认状态
    }
  },

  setMode: (mode) => set({ mode }),

  setActiveExchange: (exchange) =>
    set({ activeExchange: exchange, account: null }),

  saveCredentials: async (creds) => {
    try {
      const saved = await exchangeApi.saveCredentials(creds);
      set((state) => ({
        credentials: { ...state.credentials, [creds.exchange]: saved },
      }));
      return true;
    } catch {
      return false;
    }
  },

  removeCredentials: async (exchange) => {
    try {
      await exchangeApi.deleteCredentials(exchange);
      set((state) => ({
        credentials: { ...state.credentials, [exchange]: null },
        connections: {
          ...state.connections,
          [exchange]: { connected: false, testing: false },
        },
      }));
      if (get().activeExchange === exchange) {
        set({ activeExchange: "paper", mode: "paper" });
      }
    } catch {
      // ignore
    }
  },

  testConnection: async (exchange, creds?) => {
    set((state) => ({
      connections: {
        ...state.connections,
        [exchange]: { connected: false, testing: true, error: undefined },
      },
    }));
    const result = await exchangeApi.testConnection(exchange, creds);
    set((state) => ({
      connections: {
        ...state.connections,
        [exchange]: {
          connected: result.success,
          testing: false,
          error: result.error,
        },
      },
      account: result.success ? result.account : null,
    }));
    return result.success;
  },

  refreshAccount: async () => {
    const { activeExchange, mode } = get();
    if (mode !== "live" || activeExchange === "paper") return;
    set({ syncing: true });
    try {
      const account = await exchangeApi.getAccount(activeExchange);
      set({ account, syncing: false });
    } catch {
      set({ syncing: false });
    }
  },

  getMode: () => get().mode,
}));

