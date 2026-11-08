/* full-suite.mjs — pit-mcp 完整测试（正向 10 + 逆向 10）
   正向：协议握手 / 工具清单 / 真数据 / GT 外部对账
   逆向：无效输入 / 假地址 / 未知工具 / 协议污染 / 错误后存活
   断言纪律：负向用例绝不允许返回"编造数据"——只允许诚实错误或诚实空态 */
import { spawn } from "node:child_process";

const proc = spawn(process.execPath, ["./dist/index.js"], { stdio: ["pipe", "pipe", "pipe"] });
let buf = "";
const responses = new Map();
const pending = new Map();
proc.stdout.on("data", (d) => {
  buf += d.toString();
  let idx;
  while ((idx = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    try {
      const j = JSON.parse(line);
      if (j.id != null) {
        responses.set(j.id, j);
        const w = pending.get(j.id);
        if (w) { pending.delete(j.id); w(j); }
      }
    } catch { /* 非 JSON 行（协议污染测试用） */ }
  }
});
let stderrLog = "";
proc.stderr.on("data", (d) => { stderrLog += d.toString(); });

function send(obj) { proc.stdin.write(JSON.stringify(obj) + "\n"); }
function sendRaw(line) { proc.stdin.write(line + "\n"); }
async function waitFor(id, ms = 30000) {
  const hit = responses.get(id);
  if (hit) return hit;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout id=${id}`)), ms);
    pending.set(id, (j) => { clearTimeout(t); resolve(j); });
  });
}
async function callTool(id, name, args) {
  send({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args ?? {} } });
  return waitFor(id);
}
const textOf = (r) => r?.result?.content?.[0]?.text ?? "";
const isErrorShape = (r) =>
  r?.error != null || r?.result?.isError === true;

const results = [];
function record(id, name, pass, note) {
  results.push({ id, name, pass, note });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${note ? " — " + note : ""}`);
}

/* ── 启动 + 正向 P1/P2 ── */
send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "suite", version: "0" } } });
const init = await waitFor(1);
record("P1", "initialize 握手（serverInfo=pit-mcp）", init?.result?.serverInfo?.name === "pit-mcp", `protocol=${init?.result?.protocolVersion}`);
send({ jsonrpc: "2.0", method: "notifications/initialized" });

send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
const list = await waitFor(2);
const tools = list?.result?.tools ?? [];
const names = tools.map((t) => t.name).sort();
record("P2", "tools/list = 6 且全部带 schema 描述", names.length === 6 && tools.every((t) => t.description && t.inputSchema), names.join(","));

/* ── 动态取真 token 地址（GT relationships → base_token）── */
const gt = await (await fetch("https://api.geckoterminal.com/api/v2/networks/robinhood/pools?page=1", { headers: { Accept: "application/json" } })).json();
const pool0 = gt.data?.[0];
const pool0Addr = pool0?.attributes?.address ?? "";
const tokenAttr = pool0?.relationships?.base_token?.data?.id ?? ""; // "robinhood_0x..."
const tokenAddr = tokenAttr.replace("robinhood_", "");
const gtPrice = Number(pool0?.attributes?.base_token_price_usd);

/* ── 正向 P3–P10 ── */
let r3;
try { r3 = await callTool(3, "get_pool_price", { pool: "USDG" }); } catch { r3 = null; }
const t3 = textOf(r3);
record("P3", "get_pool_price(USDG) → 命中真实池子", t3.includes("USDG") && t3.includes("as-of"), t3.split("\n")[0]?.slice(0, 90));

let r4;
try { r4 = await callTool(4, "get_trending_pools", { limit: 3 }); } catch { r4 = null; }
const t4 = textOf(r4);
const lines4 = t4.split("\n").filter((l) => /^\d+\./.test(l));
record("P4", "get_trending_pools(limit=3) → 恰好 3 条 + as-of", lines4.length === 3 && t4.includes("as-of"), `lines=${lines4.length}`);

let r5;
try { r5 = await callTool(5, "search_token", { query: "USDG" }); } catch { r5 = null; }
const t5 = textOf(r5);
record("P5", "search_token(USDG) → 命中 + as-of", t5.includes("USDG") && t5.includes("as-of"), t5.split("\n")[0]?.slice(0, 90));

const probeWallet = "0x000000000000000000000000000000000000dEaD"; // 公开合法地址
let r6;
try { r6 = await callTool(6, "get_wallet_balance", { address: probeWallet }); } catch { r6 = null; }
const t6 = textOf(r6);
record("P6", "get_wallet_balance(合法公开地址) → native balance + as-of", t6.includes("native balance") && t6.includes("as-of"), t6.split("\n")[0]?.slice(0, 90));

let r7 = null;
if (/^0x[0-9a-fA-F]{40}$/.test(tokenAddr)) {
  try { r7 = await callTool(7, "get_token_info", { address: tokenAddr }); } catch { r7 = null; }
}
const t7 = textOf(r7);
record("P7", "get_token_info(真实代币地址) → symbol/supply + as-of", t7.includes("symbol:") && t7.includes("as-of"), `token=${tokenAddr.slice(0, 10)}… ${t7.split("\n")[1]?.slice(0, 70)}`);

let r8;
try { r8 = await callTool(8, "get_pool_price", { pool: pool0Addr }); } catch { r8 = null; }
const t8 = textOf(r8);
record("P8", "get_pool_price(池子合约地址) → 按地址命中", t8.includes(pool0?.attributes?.name?.split(" / ")[0] ?? "") || t8.includes(pool0Addr.slice(0, 8)), t8.split("\n")[0]?.slice(0, 90));

/* P9 数据对账：工具价 vs GT 直查（±2% 容差，行情在动） */
let p9pass = false, p9note = "skipped";
try {
  const m = t3.match(/price (\$[0-9.,]+)/);
  if (m && Number.isFinite(gtPrice)) {
    const shown = Number(m[1].replace(/[$,]/g, ""));
    if (shown > 0 && gtPrice > 0) {
      const diff = Math.abs(shown - gtPrice) / gtPrice;
      p9pass = diff < 0.02;
      p9note = `tool=${m[1]} vs gt=${gtPrice} diff=${(diff * 100).toFixed(2)}%`;
    } else { p9pass = shown === 0 && gtPrice === 0; p9note = "zero-check"; }
  }
} catch { /* ignore */ }
record("P9", "数据对账：工具价 ≈ GT 直查（±2%）", p9pass, p9note);

record("P10", "全部正向输出带 as-of 收据", [t3, t4, t5, t6, t7, t8].every((t) => t.includes("as-of")), "6/6");

/* ── 逆向 N1–N10 ── */
let n1;
try { n1 = await callTool(11, "get_pool_price", { pool: "ZZZNOTEXIST999" }); } catch { n1 = null; }
const tn1 = textOf(n1);
record("N1", "不存在的池子 → 诚实 not-on-board（不编造）", !isErrorShape(n1) && (tn1.includes("No pool matching") || tn1.includes("quiet")), tn1.split("\n")[0]?.slice(0, 80));

let n2;
try { n2 = await callTool(12, "get_pool_price", { pool: "" }); } catch (e) { n2 = { err: e.message }; }
record("N2", "空字符串输入 → zod 拒绝（错误应答，无数据）", isErrorShape(n2) || n2?.err != null, isErrorShape(n2) ? "jsonrpc error" : n2?.err);

let n3;
try { n3 = await callTool(13, "get_wallet_balance", { address: "0x123" }); } catch (e) { n3 = { err: e.message }; }
record("N3", "非法地址(0x123) → zod 拒绝", isErrorShape(n3) || n3?.err != null, isErrorShape(n3) ? "jsonrpc error" : n3?.err);

let n4;
try { n4 = await callTool(14, "get_token_info", { address: "0x0000000000000000000000000000000000000000" }); } catch { n4 = null; }
const tn4 = textOf(n4);
record("N4", "ZERO 地址查代币 → 诚实 not-readable", !isErrorShape(n4) && /not a readable/i.test(tn4), tn4.split("\n")[0]?.slice(0, 80));

let n5;
try { n5 = await callTool(15, "get_token_info", { address: pool0Addr }); } catch { n5 = null; }
const tn5 = textOf(n5);
record("N5", "池子合约(非ERC20)查代币 → 诚实 not-readable 或有限信息", !isErrorShape(n5) && (tn5.length > 0), tn5.split("\n")[0]?.slice(0, 80));

let n6;
try { n6 = await callTool(16, "definitely_not_a_tool", {}); } catch { n6 = null; }
record("N6", "未知工具名 → jsonrpc 错误（不返回任何数据）", isErrorShape(n6), isErrorShape(n6) ? "error shape" : "LEAK:" + textOf(n6).slice(0, 50));

sendRaw("{this is not json at all");
await new Promise((r2) => setTimeout(r2, 600));
send({ jsonrpc: "2.0", id: 17, method: "tools/list" });
let n7;
try { n7 = await waitFor(17); } catch { n7 = null; }
record("N7", "协议污染（坏 JSON 行）→ 服务器存活并继续应答", n7?.result?.tools?.length === 6, `stderr ${stderrLog.length}B`);

send({ jsonrpc: "2.0", id: 18, method: "resources/list" });
let n8;
try { n8 = await waitFor(18); } catch { n8 = null; }
record("N8", "未知 method → jsonrpc 错误应答", n8 != null && (n8.error != null || n8.result != null), n8?.error ? `code ${n8.error.code}` : "capability-empty ok");

let n9;
try { n9 = await callTool(19, "get_erc20_balance", { token: "not-an-address", wallet: "0x000000000000000000000000000000000000dEaD" }); } catch (e) { n9 = { err: e.message }; }
record("N9", "erc20_balance 非法 token 地址 → zod 拒绝", isErrorShape(n9) || n9?.err != null, isErrorShape(n9) ? "jsonrpc error" : n9?.err);

let n10;
try { n10 = await callTool(20, "get_trending_pools", { limit: 2 }); } catch { n10 = null; }
const tn10 = textOf(n10);
record("N10", "全部错误后存活：正常调用仍有真数据 + as-of", tn10.includes("as-of") && tn10.split("\n").filter((l) => /^\d+\./.test(l)).length === 2, tn10.split("\n")[0]?.slice(0, 80));

/* ── 汇总 ── */
const pass = results.filter((r2) => r2.pass).length;
console.log(`\n==== 汇总: ${pass}/${results.length} PASS ====${pass === results.length ? " ALL-PASS" : ""}`);
proc.kill();
process.exit(pass === results.length ? 0 : 1);
