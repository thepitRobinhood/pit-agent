/* Robinhood Chain 公开 RPC 只读客户端（chainId 4663）
   红线纪律：只读 eth_call / eth_getBalance——本包永远没有签名、私钥或交易构造 */

export const RPC_URL = "https://rpc.mainnet.chain.robinhood.com";
export const CHAIN_ID = 4663;

const EVM_ADDR = /^0x[0-9a-fA-F]{40}$/;

export function isEvmAddress(a: string): boolean {
  return EVM_ADDR.test(a);
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const j = (await res.json()) as { result?: T; error?: { message: string } };
  if (j.error) throw new Error(`RPC ${j.error.message}`);
  return j.result as T;
}

export async function chainId(): Promise<number> {
  const hex = await rpc<string>("eth_chainId", []);
  return parseInt(hex, 16);
}

export async function nativeBalance(addr: string): Promise<bigint | null> {
  if (!isEvmAddress(addr)) return null;
  const hex = await rpc<string>("eth_getBalance", [addr, "latest"]);
  try {
    return BigInt(hex);
  } catch {
    return null;
  }
}

/* 只读 eth_call 到代币合约：symbol() 0x95d89b41 · decimals() 0x313ce567 · totalSupply() 0x18160ddd */
async function callToken(addr: string, selector: string): Promise<string | null> {
  if (!isEvmAddress(addr)) return null;
  try {
    return await rpc<string>("eth_call", [
      { to: addr, data: selector },
      "latest",
    ]);
  } catch {
    return null;
  }
}

function decodeString(hex: string | null): string | null {
  if (!hex || hex === "0x") return null;
  try {
    // ABI string 编码：offset(32B) + len(32B) + data
    const body = hex.slice(2);
    const len = parseInt(body.slice(64, 128), 16);
    if (!Number.isFinite(len) || len <= 0 || len > 512) return null;
    const data = body.slice(128, 128 + len * 2);
    return Buffer.from(data, "hex").toString("utf8").replace(/\0+$/, "");
  } catch {
    return null;
  }
}

function decodeUint(hex: string | null): bigint | null {
  if (!hex || hex === "0x") return null;
  try {
    return BigInt(hex);
  } catch {
    return null;
  }
}

export async function tokenInfo(addr: string): Promise<{
  symbol: string | null;
  decimals: number | null;
  totalSupply: bigint | null;
} | null> {
  if (!isEvmAddress(addr)) return null;
  const [symbol, dec, supply] = await Promise.all([
    decodeString(await callToken(addr, "0x95d89b41")),
    decodeUint(await callToken(addr, "0x313ce567")),
    decodeUint(await callToken(addr, "0x18160ddd")),
  ]);
  if (symbol == null && dec == null && supply == null) return null;
  return {
    symbol,
    decimals: dec != null ? Number(dec) : null,
    totalSupply: supply,
  };
}

export async function erc20Balance(
  token: string,
  wallet: string,
): Promise<bigint | null> {
  if (!isEvmAddress(token) || !isEvmAddress(wallet)) return null;
  // balanceOf(address) = 0x70a08231 + padded address
  const data = "0x70a08231" + wallet.slice(2).toLowerCase().padStart(64, "0");
  try {
    const hex = await rpc<string>("eth_call", [
      { to: token, data },
      "latest",
    ]);
    return decodeUint(hex);
  } catch {
    return null;
  }
}
