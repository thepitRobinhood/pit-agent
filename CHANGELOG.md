# Changelog

## 0.1.0 — 2026-11-09

- Six read-only tools: `get_pool_price`, `get_trending_pools`, `search_token`,
  `get_wallet_balance`, `get_erc20_balance`, `get_token_info`.
- Sources: GeckoTerminal public API + Robinhood Chain public RPC (chainId 4663);
  every read stamped with as-of; honest failure text on feed errors.
- SPEC.md v0.1: preview–approval model for future write windows is `specified-only`.
- Boundaries: no transactions, no private keys, no model proxying — ever.
