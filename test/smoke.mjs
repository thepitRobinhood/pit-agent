/* stdio smoke：initialize → tools/list → 真实调用
   断言：协议应答合法 + 工具返回真实数据文本（含 as-of），失败即退出非零 */
import { spawn } from "node:child_process";

const proc = spawn(process.execPath, ["./dist/index.js"], { stdio: ["pipe", "pipe", "pipe"] });
let buf = "";
const responses = new Map();
const pending = new Map(); // id → resolve
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
    } catch { /* 忽略非 JSON 行 */ }
  }
});
proc.stderr.on("data", (d) => process.stderr.write("[server:err] " + d));

function send(obj) {
  proc.stdin.write(JSON.stringify(obj) + "\n");
}
async function waitFor(id, ms = 15000) {
  const hit = responses.get(id);
  if (hit) return hit;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for response id=${id}`)), ms);
    pending.set(id, (j) => { clearTimeout(t); resolve(j); });
  });
}
function assert(cond, msg) {
  if (!cond) {
    console.error("SMOKE FAIL:", msg);
    proc.kill();
    process.exit(1);
  } else console.log("ok:", msg);
}

send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "smoke", version: "0.0.1" } } });
const init = await waitFor(1);
assert(init?.result?.serverInfo?.name === "pit-mcp", "initialize → serverInfo.name=pit-mcp");

send({ jsonrpc: "2.0", method: "notifications/initialized" });
send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
const list = await waitFor(2);
const names = (list?.result?.tools ?? []).map((t) => t.name);
assert(names.length === 6, `tools/list → 6 tools (got ${names.length}: ${names.join(",")})`);

send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_trending_pools", arguments: { limit: 3 } } });
const call = await waitFor(3, 30000);
const out = call?.result?.content?.[0]?.text ?? "";
assert(out.includes("as-of"), "get_trending_pools → 含 as-of 收据");
assert(/USDG|—|quiet/.test(out), "get_trending_pools → 真实数据或诚实空态");

send({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "get_token_info", arguments: { address: "0x0000000000000000000000000000000000000000" } } });
const call4 = await waitFor(4, 30000);
const out4 = call4?.result?.content?.[0]?.text ?? "";
assert(out4.length > 0 && /not a readable|symbol/i.test(out4), "get_token_info(ZERO) → 诚实文本（非编造）");

proc.kill();
console.log("SMOKE PASS");
process.exit(0);
