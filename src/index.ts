#!/usr/bin/env node
/* pit-mcp — read-only MCP toolkit for watching Robinhood Chain.
   The Pit never holds funds, never signs, never guesses a number.
   纪律：全部工具只读；查不到返回诚实文本（不编造）；-- 表示无已核数据 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getPools, searchPools, type Pool } from "./lib/gt.js";
import { fmtUsd, fmtPct, fmtAge, utcStamp } from "./lib/format.js";
import {
  chainId,
  nativeBalance,
  tokenInfo,
  erc20Balance,
  CHAIN_ID,
} from "./lib/rpc.js";

const VERSION = "0.1.0";

function poolLine(p: Pool): string {
  return `${p.name} — price ${fmtUsd(p.priceUsd)} · 24h ${fmtPct(p.h24)} · FDV ${fmtUsd(p.fdvUsd)} · seat age ${fmtAge(p.createdAt)}`;
}

function text(s: string) {
  return { content: [{ type: "text" as const, text: s }] };
}

async function main() {
  const server = new McpServer({ name: "pit-mcp", version: VERSION });

  server.tool(
    "get_pool_price",
    "Look up a pool on Robinhood Chain by name substring or contract address. Read-only, live from GeckoTerminal with as-of stamp.",
    { pool: z.string().min(1).describe("Pool name substring (e.g. 'USDG') or pool contract address") },
    async ({ pool }) => {
      try {
        const pools = await getPools();
        const q = pool.trim().toLowerCase();
        const hit = pools.find(
          (p) =>
            p.address.toLowerCase() === q ||
            p.name.toLowerCase().includes(q.replace(/^0x/, "").length === 40 ? q : q),
        );
        if (!hit)
          return text(
            `No pool matching "${pool}" is on the board right now (as-of ${utcStamp()}). The board would rather be quiet than wrong.`,
          );
        return text(
          `${poolLine(hit)}\nsource: GeckoTerminal public API · as-of ${utcStamp()}\nchain: Robinhood Chain (${CHAIN_ID})`,
        );
      } catch (e) {
        return text(`The board is quiet right now — data feed did not answer (${(e as Error).message}). Zeros stay zeros, no guesses.`);
      }
    },
  );

  server.tool(
    "get_trending_pools",
    "List pools on Robinhood Chain sorted by absolute 24h move. Read-only, live data with as-of stamp.",
    { limit: z.number().int().min(1).max(10).default(5).describe("How many seats to list (1-10)") },
    async ({ limit }) => {
      try {
        const pools = await getPools();
        const rows = pools
          .slice()
          .sort((a, b) => Math.abs(b.h24 ?? 0) - Math.abs(a.h24 ?? 0))
          .slice(0, limit);
        if (!rows.length)
          return text("The board is empty right now — no pools visible on Robinhood Chain via GeckoTerminal.");
        return text(
          rows.map((p, i) => `${i + 1}. ${poolLine(p)}`).join("\n") +
            `\nsource: GeckoTerminal public API · as-of ${utcStamp()} · read-only, trading happens at your venue`,
        );
      } catch (e) {
        return text(`The board is quiet right now — data feed did not answer (${(e as Error).message}).`);
      }
    },
  );

  server.tool(
    "search_token",
    "Search Robinhood Chain pools by token name or symbol substring. Read-only.",
    { query: z.string().min(1).describe("Token name or symbol substring (e.g. 'USDG')") },
    async ({ query }) => {
      try {
        const rows = await searchPools(query);
        if (!rows.length)
          return text(`Nothing matching "${query}" on Robinhood Chain right now (as-of ${utcStamp()}).`);
        return text(
          rows.map((p) => poolLine(p)).join("\n") +
            `\nsource: GeckoTerminal public API · as-of ${utcStamp()}`,
        );
      } catch (e) {
        return text(`Search failed honestly — feed did not answer (${(e as Error).message}).`);
      }
    },
  );

  server.tool(
    "get_wallet_balance",
    "Read the native ETH balance of any public address on Robinhood Chain. Read-only — this tool never asks for or handles private keys.",
    { address: z.string().regex(/^0x[0-9a-fA-F]{40}$/).describe("Public wallet address (0x + 40 hex)") },
    async ({ address }) => {
      try {
        const cid = await chainId();
        const wei = await nativeBalance(address);
        if (wei == null) return text(`Could not read a balance for ${address} — invalid address format or node did not answer.`);
        const eth = Number(wei) / 1e18;
        return text(
          `${address} on Robinhood Chain (${CHAIN_ID}): ${eth.toFixed(6)} ETH (native balance)\nsource: public RPC · as-of ${utcStamp()}\nERC-20 holdings: call get_token_info per contract address, or get_erc20_balance for a specific token.`,
        );
      } catch (e) {
        return text(`Balance read failed honestly — node did not answer (${(e as Error).message}).`);
      }
    },
  );

  server.tool(
    "get_erc20_balance",
    "Read one ERC-20 token balance of a public wallet on Robinhood Chain. Read-only.",
    {
      token: z.string().regex(/^0x[0-9a-fA-F]{40}$/).describe("Token contract address"),
      wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/).describe("Public wallet address"),
    },
    async ({ token, wallet }) => {
      try {
        const info = await tokenInfo(token);
        const raw = await erc20Balance(token, wallet);
        if (raw == null)
          return text(`Could not read ${token} balance for ${wallet} — not a readable ERC-20 contract on Robinhood Chain, or node did not answer.`);
        const d = info?.decimals ?? 18;
        const sym = info?.symbol ?? "(unknown symbol)";
        return text(
          `${wallet} holds ${Number(raw) / 10 ** d} ${sym} (${token}) on Robinhood Chain (${CHAIN_ID})\nsource: public RPC · as-of ${utcStamp()}`,
        );
      } catch (e) {
        return text(`Balance read failed honestly — (${(e as Error).message}).`);
      }
    },
  );

  server.tool(
    "get_token_info",
    "Read an ERC-20 token's symbol, decimals and total supply from its contract on Robinhood Chain. Read-only.",
    { address: z.string().regex(/^0x[0-9a-fA-F]{40}$/).describe("Token contract address (0x + 40 hex)") },
    async ({ address }) => {
      try {
        const info = await tokenInfo(address);
        if (!info)
          return text(`${address} is not a readable ERC-20 contract on Robinhood Chain (as-of ${utcStamp()}) — no symbol/decimals/supply returned.`);
        const supply = info.totalSupply != null && info.decimals != null
          ? `${Number(info.totalSupply) / 10 ** info.decimals} (raw ${info.totalSupply})`
          : "—";
        return text(
          `Token ${address} on Robinhood Chain (${CHAIN_ID}):\nsymbol: ${info.symbol ?? "—"} · decimals: ${info.decimals ?? "—"} · total supply: ${supply}\nsource: public RPC · as-of ${utcStamp()}`,
        );
      } catch (e) {
        return text(`Token read failed honestly — (${(e as Error).message}).`);
      }
    },
  );

  await server.connect(new StdioServerTransport());
  // stdio 模式下不要 console.log（污染协议管道）
}

main().catch(() => {
  process.exit(1);
});
