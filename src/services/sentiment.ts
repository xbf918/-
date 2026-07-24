import axios from "axios";
import type { FearGreedIndex } from "@/types";

const client = axios.create({
  baseURL: "/api/market",
  timeout: 10_000,
});

export async function fetchFearGreedIndex(
  signal?: AbortSignal,
): Promise<FearGreedIndex> {
  const res = await client.get("/fear-greed", {
    params: { limit: 31 },
    signal,
  });
  const data = res.data?.data ?? [];
  if (data.length === 0) {
    throw new Error("Fear & Greed data unavailable");
  }
  const latest = data[0];
  const yesterday = data[1]?.value ? Number(data[1].value) : Number(latest.value);
  const lastWeek = data[7]?.value ? Number(data[7].value) : Number(latest.value);
  const lastMonth = data[30]?.value ? Number(data[30].value) : Number(latest.value);
  return {
    value: Number(latest.value),
    classification: latest.value_classification as string,
    timestamp: Number(latest.timestamp),
    yesterday,
    lastWeek,
    lastMonth,
  };
}

export async function fetchCryptoNews(
  currency: string = "BTC",
): Promise<any> {
  const res = await client.get("/news", { params: { currency } });
  return res.data;
}

export async function fetchOnchainData(
  coinId: string = "bitcoin",
): Promise<any> {
  const res = await client.get("/onchain", { params: { coinId } });
  return res.data;
}

