/**
 * Pengukuran performa API yang bisa diulang:  npm run perf
 *
 * Menyalakan Postgres lokal sementara, mengisi dataset sintetis (41 pengguna,
 * 105.000 transaksi; pengguna yang diukur punya 5.000 transaksi dan 12 budget —
 * sama dengan dataset baseline di docs/PROJECT_AUDIT.md), lalu mengukur untuk
 * tiap halaman: jumlah request, median waktu, jumlah round-trip database, dan
 * ukuran respons. Tidak ada jaringan: angka waktu adalah batas bawah; yang
 * paling menentukan di produksi adalah jumlah request dan round-trip database.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { startDb, freePort } from "./dev-db.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "monify-perf-"));
const db = await startDb({ dir, port: await freePort(), database: "monify_perf" });
let exit = 0;
try {
  Object.assign(process.env, { DATABASE_URL: db.url, NODE_ENV: "test", AUTH_SECRET: "perf-secret-perf-secret-perf-secret-000", VERCEL: "" });
  const mig = spawnSync(process.execPath, [path.join(root, "node_modules/prisma/build/index.js"), "migrate", "deploy"], { cwd: root, env: process.env, encoding: "utf8" });
  if (mig.status !== 0) throw new Error("migrate deploy gagal: " + mig.stderr);

  const app = require("../server/index.js");
  const { prisma } = require("../server/lib/prisma.js");
  const server = await new Promise((r) => {
    const s = app.listen(0, "127.0.0.1", () => r(s));
  });
  const base = "http://127.0.0.1:" + server.address().port;
  let cookie = "";
  const call = async (method, url, body) => {
    const t0 = performance.now();
    const res = await fetch(base + url, { method, headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined });
    for (const c of res.headers.getSetCookie()) if (c.startsWith("monify.sid=")) cookie = c.split(";")[0];
    const text = await res.text();
    if (res.status >= 400) throw new Error(`${method} ${url} -> ${res.status} ${text.slice(0, 200)}`);
    return { ms: performance.now() - t0, bytes: text.length, data: JSON.parse(text).data };
  };

  const pgc = db.pg.getPgClient(db.config.database);
  await pgc.connect();
  const xacts = async () => Number((await pgc.query("select xact_commit + xact_rollback as n from pg_stat_database where datname = current_database()")).rows[0].n);
  const settle = () => new Promise((r) => setTimeout(r, 700));

  // ——— Dataset ———
  const t0 = performance.now();
  const me = (await call("POST", "/api/auth/register", { email: "perf@monify.test", password: "password-123", name: "Perf" })).data.user;
  const registerColdMs = Math.round(performance.now() - t0);
  const keep = cookie;
  cookie = ""; // daftar kedua sebagai pengunjung baru, agar sesi pengguna pertama tidak diganti
  const t1 = performance.now();
  await call("POST", "/api/auth/register", { email: "perf2@monify.test", password: "password-123", name: "Perf2" });
  const registerMs = Math.round(performance.now() - t1);
  cookie = keep;
  const cats = (await call("GET", "/api/categories")).data.categories;
  const exp = cats.filter((c) => c.type === "expense");
  const inc = cats.filter((c) => c.type === "income");
  const wallets = [];
  for (const n of ["BCA", "BRI", "Cash", "OVO"]) wallets.push((await call("POST", "/api/wallets", { name: n, initialBalance: 50_000_000 })).data.wallet);
  const now = Date.now();
  const rows = (userId, ws, ex, ic, n) =>
    Array.from({ length: n }, (_, i) => {
      const isInc = i % 9 === 0;
      const c = isInc ? ic[i % ic.length] : ex[i % ex.length];
      const kind = isInc ? "income" : "expense";
      return { userId, walletId: ws[i % ws.length].id, categoryId: c.id, amount: 10000 + ((i * 7919) % 490000), kind, direction: isInc ? "in" : "out", type: kind, title: "Tx " + i, date: new Date(now - ((i * 37) % 720) * 86400000), status: "success", currency: "IDR" };
    });
  await prisma.transaction.createMany({ data: rows(me.id, wallets, exp, inc, 5000) });
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  for (let i = 0; i < 12; i++) await call("POST", "/api/budgets", { targetKind: "CATEGORY", targetId: exp[i].id, limitAmount: 1_000_000, year: y, month: m });
  for (let u = 0; u < 40; u++) {
    const usr = await prisma.user.create({ data: { email: `bg${u}@monify.test`, passwordHash: "x" } });
    const w = await prisma.wallet.create({ data: { userId: usr.id, name: "W", currency: "IDR", balance: 1_000_000, flag: "ID" } });
    const ce = await prisma.category.create({ data: { userId: usr.id, name: "E", type: "expense", icon: "x" } });
    const ci = await prisma.category.create({ data: { userId: usr.id, name: "I", type: "income", icon: "x" } });
    await prisma.transaction.createMany({ data: rows(usr.id, [w], [ce], [ci], 2500) });
  }
  await pgc.query("ANALYZE");
  const total = await prisma.transaction.count();

  async function measure(label, seq) {
    for (const s of seq) await call("GET", s);
    const runs = [];
    let trips = 0;
    let bytes = 0;
    for (let i = 0; i < 5; i++) {
      await settle();
      const before = await xacts();
      const t = performance.now();
      bytes = 0;
      // Request yang independen dikirim paralel, seperti yang dilakukan klien.
      const res = await Promise.all(seq.map((s) => call("GET", s)));
      for (const r of res) bytes += r.bytes;
      runs.push(performance.now() - t);
      await settle();
      trips = (await xacts()) - before - 1;
    }
    runs.sort((a, b) => a - b);
    return { halaman: label, request: seq.length, "median ms": Math.round(runs[2]), "round-trip DB": trips, "KB respons": Math.round(bytes / 102.4) / 10 };
  }

  const pad = (n) => String(n).padStart(2, "0");
  const d = `${y}-${pad(m)}-${pad(today.getDate())}`;
  const from = `${y}-${pad(m)}-01`;
  const to = `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`;
  const out = [];
  out.push(await measure("Dashboard (muat pertama)", ["/api/bootstrap", `/api/dashboard?today=${d}`]));
  out.push(await measure("Dashboard (navigasi)", [`/api/dashboard?today=${d}`]));
  out.push(await measure("Transaksi (bulan ini)", [`/api/transactions?from=${from}&to=${to}&limit=50`]));
  out.push(await measure("Transaksi (semua, halaman 1)", ["/api/transactions?limit=50"]));
  out.push(await measure("Budget (12 budget)", [`/api/budgets?year=${y}&month=${m}&today=${d}`]));
  out.push(await measure("Laporan (bulan ini)", [`/api/reports?from=${from}&to=${to}`]));
  out.push(await measure("Laporan (1 tahun)", [`/api/reports?from=${y}-01-01&to=${y}-12-31`]));

  const html = await fetch(base + "/login");
  const v = (await call("GET", "/api/health")).data.version;
  const css = await fetch(`${base}/assets/${v}/css/app.css`);
  const js = await fetch(`${base}/assets/${v}/js/app/main.js`);
  console.log(`\nNode ${process.version} · ${total.toLocaleString("id-ID")} transaksi di database · pengguna terukur: 5.000 transaksi, 12 budget`);
  console.log(`Registrasi pengguna baru (termasuk ${cats.length} kategori bawaan): ${registerMs} ms (permintaan pertama setelah server menyala: ${registerColdMs} ms; bcrypt biaya uji)`);
  console.table(out);
  console.log("Cache asset ber-versi:", css.headers.get("cache-control"), "| HTML:", html.headers.get("cache-control"));
  console.log(`Ukuran: app.css ${Math.round((await css.text()).length / 1024)} KB, main.js ${Math.round((await js.text()).length / 1024)} KB (tanpa kompresi)`);

  // Bukti index dipakai untuk query utama.
  const plan = await pgc.query(`EXPLAIN (FORMAT TEXT) SELECT * FROM "Transaction" WHERE "userId" = $1 AND "date" >= now() - interval '30 days' ORDER BY "date" DESC LIMIT 50`, [me.id]);
  console.log("\nRencana query daftar transaksi:\n  " + plan.rows.map((r) => r["QUERY PLAN"]).join("\n  "));

  await pgc.end();
  await new Promise((r) => server.close(r));
  await prisma.$disconnect();
} catch (e) {
  console.error(e);
  exit = 1;
} finally {
  await db.stop();
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  } catch {
    /* folder sementara */
  }
}
process.exit(exit);
