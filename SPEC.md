# pit-mcp — Specification v0.1

> The open specification for watching Robinhood Chain through an agent.
> **Status markers are contractual:** `implemented` = this release ships it; `specified-only` = the shape is defined here and the implementation does NOT ship it yet. Spec never claims what the code does not do.

## 0. Scope & boundaries (non-negotiable)

- Read-only. The toolkit never constructs, signs, or broadcasts a transaction; never imports or requests a private key; never proxies a model/LLM call.
- Data sources: GeckoTerminal public API + Robinhood Chain public RPC (chainId 4663). Every number returned is traceable to those sources with an `as-of` stamp — or the tool honestly reports that it has nothing.
- Runs locally on the user's machine (stdio MCP). The Pit operates no server for this toolkit.

## 1. Tool catalogue (all `implemented` in v0.1)

| Tool | Input | Returns | Source |
|---|---|---|---|
| `get_pool_price` | `pool` (name substring or contract address) | price / 24h / FDV / seat age + as-of, or an honest "not on the board" | GT |
| `get_trending_pools` | `limit` (1–10, default 5) | ranked list by absolute 24h move + as-of | GT |
| `search_token` | `query` (name/symbol substring) | matching pools on Robinhood Chain + as-of | GT search |
| `get_wallet_balance` | `address` (0x+40) | native ETH balance + as-of | RPC |
| `get_erc20_balance` | `token`, `wallet` (both 0x+40) | ERC-20 balance for one contract + as-of | RPC |
| `get_token_info` | `address` (0x+40) | symbol / decimals / total supply + as-of | RPC |

Error contract: never invent. Feed down → "The board is quiet right now — …". Unknown pool → "not on the board right now". Invalid address → format error, no guess.

## 2. Preview–approval model for future write windows (`specified-only` · v0.2 target)

v0.1 has no write tools. When write windows open (swap / lend via user's own venue), every action MUST surface a preview object before any signature:

```json
{
  "action": "swap",
  "from": "USDG",
  "to": "WETH",
  "amountIn": "100.000000",
  "minOut": "0.0431",
  "venue": "<user-configured venue URL>",
  "approvals": "exact-amount only, never unlimited",
  "signedBy": "user wallet, on user machine"
}
```

Rules: exact-amount approvals only; the toolkit displays the preview and exits — signing happens in the user's wallet at the user's venue. This spec defines the shape; no v0.1 code implements it.

## 3. Terms

| Term | Meaning |
|---|---|
| The Board | the live quotation board of Robinhood Chain (thepit.com) |
| On the board | a pool that has taken a seat, listed by real creation time |
| as-of | timestamp stamped on every read |
| Zero state | honest placeholder before a contract exists |

## 4. Versioning & compatibility

Semver. MCP protocol target: `2025-03-26` (pinned via `@modelcontextprotocol/sdk`). Node ≥18. Breaking changes to tool names/inputs = major version.

## 5. Open questions

1. Should a canonical RH token list exist (curation vs on-chain discovery only)?
2. Feed endpoint on thepit.com (Route A) — CLOSED (2026-11-12): the data is public, agents read GT/RPC directly; this toolkit is the access layer. No proxy — no shared rate limits, no SLA on our side.
3. Access gating for pro tools if $PIT ships — separate evaluation; this spec does not assume it.
