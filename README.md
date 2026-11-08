# pit-mcp — read-only Robinhood Chain tools for your agent

Give your MCP-compatible agent (Claude Code, Cursor, Codex, Gemini CLI…) five
read-only tools for watching Robinhood Chain: pool prices, trending seats, token
search, wallet balances, token info.

**The Pit never holds funds, never signs, never guesses a number.** This toolkit is
read-only by construction — no transactions, no private keys, no model proxying.

## Install (once published to npm)

```bash
claude mcp add pit -- pit mcp
```

## Try it

Ask your agent: *"What are the pools on Robinhood Chain with the biggest 24h moves?"*
— it will call `get_trending_pools` and answer with live prices, each stamped
`as-of` and sourced to GeckoTerminal's public API.

## Tools

See [SPEC.md](./SPEC.md) v0.1 — every tool is `implemented` there, with the error
contract ("never invent") written down.

## Status

- `0.1.0` — six read-only tools, stdio MCP, live data.
- Roadmap: write-window preview–approval model is `specified-only` (SPEC §2); no
  signing ships until that spec graduates with its own release.

## Honesty rules

- Every number carries its source and as-of; feed down = honest failure text.
- No demo data, no fabricated numbers, no "coming soon" promises.
- Spec and implementation are versioned together; drift = bug.

MIT licensed. Independent project — not affiliated with Robinhood Markets, Inc.
