/** Utilitas test integrasi: server sungguhan di port acak + klien HTTP ber-cookie. */
const assert = require("node:assert/strict");
const app = require("../server/index.js");
const { prisma } = require("../server/lib/prisma");

let server = null;
let base = "";
let seq = 0;

async function start() {
  if (!server) {
    server = await new Promise((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    base = "http://127.0.0.1:" + server.address().port;
  }
  return base;
}

async function stop() {
  if (server) await new Promise((r) => server.close(r));
  server = null;
  await prisma.$disconnect();
}

class Client {
  constructor() {
    this.cookie = "";
    this.user = null;
  }

  async raw(method, url, { body, headers = {}, form } = {}) {
    const res = await fetch(base + url, {
      method,
      redirect: "manual",
      headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(this.cookie ? { cookie: this.cookie } : {}), ...headers },
      body: form || (body !== undefined ? JSON.stringify(body) : undefined),
    });
    const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of set) {
      if (c.startsWith("monify.sid=")) this.cookie = c.split(";")[0];
    }
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* bukan JSON */
    }
    return { status: res.status, json, text, headers: res.headers };
  }

  /** Request yang diharapkan sukses; mengembalikan `data`. */
  async ok(method, url, body, headers) {
    const r = await this.raw(method, url, { body, headers });
    assert.ok(r.status >= 200 && r.status < 300, `${method} ${url} -> ${r.status} ${r.text.slice(0, 300)}`);
    return r.json.data;
  }

  get(url) {
    return this.ok("GET", url);
  }
  post(url, body, headers) {
    return this.ok("POST", url, body ?? {}, headers);
  }
  patch(url, body) {
    return this.ok("PATCH", url, body ?? {});
  }
  del(url, body) {
    return this.ok("DELETE", url, body);
  }

  /** Request yang diharapkan gagal dengan status tertentu; mengembalikan objek error. */
  async fail(status, method, url, body, headers) {
    const r = await this.raw(method, url, { body: body ?? (method === "GET" ? undefined : {}), headers });
    assert.equal(r.status, status, `${method} ${url} seharusnya ${status}, dapat ${r.status}: ${r.text.slice(0, 300)}`);
    return r.json ? r.json.error : null;
  }
}

/** Pengguna baru yang sudah login, dengan email unik. */
async function newUser(label = "user") {
  await start();
  const c = new Client();
  const email = `${label}-${Date.now()}-${++seq}@monify.test`;
  const data = await c.post("/api/auth/register", { email, password: "password-123", name: label });
  c.user = data.user;
  c.email = email;
  c.password = "password-123";
  return c;
}

async function wallet(c, name, initialBalance = 0, extra = {}) {
  return (await c.post("/api/wallets", { name, initialBalance, ...extra })).wallet;
}

async function category(c, type, name) {
  const { categories } = await c.get("/api/categories");
  const found = categories.find((x) => x.type === type && (!name || x.name === name));
  assert.ok(found, "kategori bawaan tidak ditemukan: " + type + " " + (name || ""));
  return found;
}

async function balances(c) {
  const { wallets } = await c.get("/api/wallets");
  return Object.fromEntries(wallets.map((w) => [w.name, w.balance]));
}

/** Semua dompet harus lolos rekonsiliasi: saldo = saldo awal + Σ mutasi. */
async function assertReconciled(c) {
  const r = await c.get("/api/reconcile");
  assert.equal(r.consistent, true, "rekonsiliasi gagal: " + JSON.stringify(r.wallets.filter((w) => w.difference !== 0)));
}

const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

module.exports = { start, stop, Client, newUser, wallet, category, balances, assertReconciled, prisma, TODAY, base: () => base };
