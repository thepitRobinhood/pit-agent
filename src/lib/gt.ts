/* GeckoTerminal 公开 API 客户端（用户侧运行：各自 IP 天然分散限频）
   纪律：数字必须来自响应或为零；失败/查不到 → 诚实文本，不编造；缓存 + 429 退避 */

const GT_BASE = "https://api.geckoterminal.com/api/v2";

export type Pool = {
  name: string;
  address: string;
  priceUsd: number | null;
  h24: number | null;
  fdvUsd: number | null;
  createdAt: string | null;
};

type CacheEntry = { data: unknown; at: number };
const cache = new Map<string, CacheEntry>();

async function gtFetch(path: string, ttlMs: number): Promise<unknown> {
  const key = path;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data;
  const url = `${GT_BASE}${path}`;
  // 429 指数退避 ×3（2s/5s/10s）+ 尊重 Retry-After；全部失败 → 上次成功值或诚实报错
  const waits = [2000, 5000, 10000];
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= waits.length; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      });
    } catch (e) {
      lastErr = new Error(`GeckoTerminal unreachable: ${(e as Error).message}`);
      if (hit) return hit.data;
      if (attempt < waits.length) {
        await new Promise((r) => setTimeout(r, waits[attempt]));
        continue;
      }
      throw lastErr;
    }
    if (res.ok) {
      const j = await res.json();
      cache.set(key, { data: j, at: Date.now() });
      return j;
    }
    if (res.status === 429 && attempt < waits.length) {
      const ra = Number(res.headers.get("retry-after"));
      const wait = Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 15000) : waits[attempt];
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    lastErr = new Error(`GeckoTerminal HTTP ${res.status}`);
    if (hit) return hit.data;
    throw lastErr;
  }
  if (hit) return hit.data;
  throw lastErr ?? new Error("GeckoTerminal unavailable");
}

export async function getPools(): Promise<Pool[]> {
  const j = (await gtFetch("/networks/robinhood/pools?page=1", 60_000)) as {
    data?: { attributes?: Record<string, unknown> }[];
  };
  const pools: Pool[] = (j.data ?? [])
    .map((x) => {
      const a = (x.attributes ?? {}) as Record<string, unknown>;
      const pc = a.price_change_percentage as { h24?: number } | undefined;
      return {
        name: typeof a.name === "string" ? a.name : "",
        address: typeof a.address === "string" ? a.address : "",
        priceUsd: num(a.base_token_price_usd),
        h24: num(pc?.h24),
        fdvUsd: num(a.fdv_usd),
        createdAt:
          typeof a.pool_created_at === "string" ? a.pool_created_at : null,
      };
    })
    .filter((p) => p.name);
  return pools;
}

export async function searchPools(query: string): Promise<Pool[]> {
  const j = (await gtFetch(
    `/search/pools?query=${encodeURIComponent(query)}&page=1`,
    60_000,
  )) as { data?: { id?: string; attributes?: Record<string, unknown> }[] };
  return (j.data ?? [])
    .filter((x) => typeof x.id === "string" && x.id.startsWith("robinhood_"))
    .map((x) => {
      const a = (x.attributes ?? {}) as Record<string, unknown>;
      const pc = a.price_change_percentage as { h24?: number } | undefined;
      return {
        name: typeof a.name === "string" ? a.name : "",
        address: typeof a.address === "string" ? a.address : "",
        priceUsd: num(a.base_token_price_usd),
        h24: num(pc?.h24),
        fdvUsd: num(a.fdv_usd),
        createdAt:
          typeof a.pool_created_at === "string" ? a.pool_created_at : null,
      };
    })
    .filter((p) => p.name)
    .slice(0, 10);
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
