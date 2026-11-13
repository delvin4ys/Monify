const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const H = require("./helpers");

before(H.start);
after(H.stop);

test("tanpa sesi: API menolak dengan 401 dan halaman aplikasi dialihkan ke /login", async () => {
  const anon = new H.Client();
  for (const url of ["/api/auth/me", "/api/bootstrap", "/api/wallets", "/api/transactions", "/api/dashboard", "/api/reports?from=2026-01-01&to=2026-01-31", "/api/debts", "/api/savings", "/api/budgets", "/api/reconcile", "/api/admin/users"]) {
    const e = await anon.fail(401, "GET", url);
    assert.equal(e.code, "UNAUTHORIZED");
  }
  await anon.fail(401, "POST", "/api/transactions", { kind: "expense", amount: 1 });
  for (const page of ["/dashboard", "/transactions", "/wallets", "/budgets", "/savings", "/debts", "/reports", "/settings", "/admin"]) {
    const r = await anon.raw("GET", page);
    assert.equal(r.status, 302, page);
    assert.equal(r.headers.get("location"), "/login");
  }
  // file HTML aplikasi tidak bisa diambil langsung
  assert.equal((await anon.raw("GET", "/app.html")).status, 404);
});

test("endpoint sementara yang berbahaya sudah tidak ada", async () => {
  // Dulu: GET tanpa login yang menimpa kategori SEMUA pengguna dan menghapus induk kategori.
  const victim = await H.newUser("victim");
  const before = JSON.stringify(await victim.get("/api/categories"));
  const anon = new H.Client();
  assert.equal((await anon.raw("GET", "/api/tmp-fix-category-data")).status, 401);
  assert.equal((await victim.raw("GET", "/api/tmp-fix-category-data")).status, 404);
  assert.equal(JSON.stringify(await victim.get("/api/categories")), before, "data tidak berubah");
});

test("register → sesi aktif; logout; login ulang; kredensial salah", async () => {
  const c = await H.newUser("auth");
  assert.equal(c.user.email, c.email);
  assert.equal((await c.get("/api/auth/me")).user.email, c.email);
  assert.ok(!JSON.stringify(await c.get("/api/auth/me")).includes("passwordHash"));
  const boot = await c.get("/api/bootstrap");
  assert.ok(boot.categories.length > 20, "kategori bawaan dibuat");
  assert.ok(!boot.categories.some((x) => /transfer/i.test(x.name) || x.type === "debt"), "tidak ada kategori transfer/hutang");
  assert.equal(boot.wallets.length, 0);

  // pengguna yang sudah login dialihkan dari /login, dan mendapat halaman aplikasi
  assert.equal((await c.raw("GET", "/login")).headers.get("location"), "/dashboard");

  await c.post("/api/auth/logout");
  await c.fail(401, "GET", "/api/auth/me");

  const bad = await c.fail(401, "POST", "/api/auth/login", { email: c.email, password: "salah-salah" });
  assert.equal(bad.code, "INVALID_CREDENTIALS");
  const unknown = await c.fail(401, "POST", "/api/auth/login", { email: "tidak-ada@monify.test", password: "password-123" });
  assert.equal(unknown.message, bad.message, "pesan sama untuk email tak terdaftar");
  await c.post("/api/auth/login", { email: c.email.toUpperCase(), password: c.password });
  assert.equal((await c.get("/api/auth/me")).user.email, c.email);
});

test("validasi registrasi dan email ganda", async () => {
  const c = await H.newUser("dup");
  const anon = new H.Client();
  await anon.fail(409, "POST", "/api/auth/register", { email: c.email, password: "password-123" });
  await anon.fail(400, "POST", "/api/auth/register", { email: "bukan-email", password: "password-123" });
  await anon.fail(400, "POST", "/api/auth/register", { email: "a@b", password: "password-123" });
  await anon.fail(400, "POST", "/api/auth/register", { email: "ok@monify.test", password: "pendek" });
});

test("ID sesi diganti saat login (anti session fixation) dan cookie httpOnly + SameSite", async () => {
  const c = await H.newUser("fix");
  const before1 = c.cookie;
  const r = await c.raw("POST", "/api/auth/login", { body: { email: c.email, password: c.password } });
  assert.equal(r.status, 200);
  assert.notEqual(c.cookie, before1, "cookie sesi harus baru setelah login");
  const set = r.headers.getSetCookie().find((x) => x.startsWith("monify.sid="));
  assert.match(set, /HttpOnly/i);
  assert.match(set, /SameSite=Lax/i);
  // sesi lama tidak lagi berlaku
  const old = new H.Client();
  old.cookie = before1;
  await old.fail(401, "GET", "/api/auth/me");
});

test("ganti password: butuh password lama, sesi lain diakhiri", async () => {
  const c = await H.newUser("pw");
  const other = new H.Client();
  await other.post("/api/auth/login", { email: c.email, password: c.password });
  assert.equal((await c.get("/api/auth/sessions")).active, 2);

  await c.fail(400, "POST", "/api/auth/password", { currentPassword: "salah", newPassword: "password-baru-1" });
  await c.fail(400, "POST", "/api/auth/password", { currentPassword: c.password, newPassword: "pendek" });
  const r = await c.post("/api/auth/password", { currentPassword: c.password, newPassword: "password-baru-1" });
  assert.equal(r.endedSessions, 1);
  await other.fail(401, "GET", "/api/auth/me");
  assert.equal((await c.get("/api/auth/me")).user.email, c.email, "sesi saat ini tetap aktif");

  const fresh = new H.Client();
  await fresh.fail(401, "POST", "/api/auth/login", { email: c.email, password: c.password });
  await fresh.post("/api/auth/login", { email: c.email, password: "password-baru-1" });
});

test("lupa password: token sekali pakai, kedaluwarsa, dan tidak membocorkan email terdaftar", async () => {
  const c = await H.newUser("reset");
  const anon = new H.Client();
  const unknown = await anon.post("/api/auth/forgot", { email: "tak-terdaftar@monify.test" });
  const known = await anon.post("/api/auth/forgot", { email: c.email });
  assert.equal(known.message, unknown.message);
  assert.ok(known.devLink, "tanpa penyedia email (non-produksi) tautan dikembalikan untuk pengujian");
  const token = new URL(known.devLink).searchParams.get("token");

  // hanya hash yang disimpan
  const rows = await H.prisma.passwordResetToken.findMany({ where: { userId: c.user.id } });
  assert.equal(rows.length, 1);
  assert.notEqual(rows[0].tokenHash, token);

  await anon.fail(400, "POST", "/api/auth/reset", { token: "token-palsu", password: "password-baru-2" });
  await anon.fail(400, "POST", "/api/auth/reset", { token, password: "pendek" });
  await anon.post("/api/auth/reset", { token, password: "password-baru-2" });
  const reuse = await anon.fail(400, "POST", "/api/auth/reset", { token, password: "password-baru-3" });
  assert.equal(reuse.code, "INVALID_TOKEN");
  await c.fail(401, "GET", "/api/auth/me"); // semua sesi lama diakhiri
  await anon.post("/api/auth/login", { email: c.email, password: "password-baru-2" });

  // token kedaluwarsa
  const again = await new H.Client().post("/api/auth/forgot", { email: c.email });
  const t2 = new URL(again.devLink).searchParams.get("token");
  await H.prisma.passwordResetToken.updateMany({ where: { userId: c.user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  await new H.Client().fail(400, "POST", "/api/auth/reset", { token: t2, password: "password-baru-4" });
});

test("rate limit login", async () => {
  const anon = new H.Client();
  const headers = { "X-Test-Rate-Limit": "1" };
  const body = { email: "brute@monify.test", password: "tebakan-salah" };
  const statuses = [];
  for (let i = 0; i < 12; i++) statuses.push((await anon.raw("POST", "/api/auth/login", { body, headers })).status);
  assert.deepEqual(statuses.slice(0, 10), Array(10).fill(401));
  assert.deepEqual(statuses.slice(10), [429, 429]);
});

test("CSRF: request tulis dari origin lain ditolak", async () => {
  const c = await H.newUser("csrf");
  const e = await c.fail(403, "POST", "/api/wallets", { name: "x" }, { Origin: "https://evil.example" });
  assert.equal(e.code, "BAD_ORIGIN");
  assert.equal((await c.get("/api/wallets")).wallets.length, 0);
  await c.ok("POST", "/api/wallets", { name: "Sah" }, { Origin: H.base() });
});

test("header keamanan dan cache", async () => {
  const c = await H.newUser("headers");
  const api = await c.raw("GET", "/api/wallets");
  assert.equal(api.headers.get("cache-control"), "no-store");
  assert.equal(api.headers.get("x-content-type-options"), "nosniff");
  assert.equal(api.headers.get("x-powered-by"), null);
  const csp = api.headers.get("content-security-policy");
  assert.match(csp, /script-src 'self'/);
  assert.doesNotMatch(csp.split("script-src")[1].split(";")[0], /unsafe-inline/);
  assert.match(csp, /frame-ancestors 'none'/);
  const health = await c.get("/api/health");
  const asset = await c.raw("GET", `/assets/${health.version}/404.html`);
  assert.equal(asset.status, 404, "file .html tidak dilayani sebagai asset");
});

test("error server tidak membocorkan detail internal; JSON rusak → 400", async () => {
  const c = await H.newUser("leak");
  const r = await c.raw("POST", "/api/wallets", { form: "{bukan json", headers: { "content-type": "application/json" } });
  assert.equal(r.status, 400);
  assert.equal(r.json.error.code, "BAD_JSON");
  const nf = await c.fail(404, "GET", "/api/tidak-ada");
  assert.equal(nf.code, "NOT_FOUND");
  // input berbahaya disimpan apa adanya sebagai data (di-escape saat dirender), tidak memicu error
  const xss = '<img src=x onerror="alert(1)">';
  const w = (await c.post("/api/wallets", { name: xss })).wallet;
  assert.equal(w.name, xss);
  const sqli = (await c.get("/api/transactions?q=" + encodeURIComponent("' OR 1=1 --"))).items;
  assert.deepEqual(sqli, []);
});

test("preferensi pengguna dan hapus akun", async () => {
  const c = await H.newUser("prefs");
  const w = await H.wallet(c, "BCA", 100_000);
  const cat = await H.category(c, "expense");
  await c.post("/api/transactions", { kind: "expense", amount: 5000, walletId: w.id, categoryId: cat.id, title: "x", date: "2026-10-01" });
  const u = (await c.patch("/api/user", { name: "Nama Baru", theme: "dark", dateFormat: "YMD", numberFormat: "en-US", defaultWalletId: w.id, aiConsent: true })).user;
  assert.equal(u.name, "Nama Baru");
  assert.equal(u.theme, "dark");
  assert.equal(u.dateFormat, "YMD");
  assert.equal(u.defaultWalletId, w.id);
  assert.equal(u.aiConsent, true);
  await c.fail(400, "PATCH", "/api/user", { theme: "neon" });

  await c.fail(400, "DELETE", "/api/account", { password: "salah" });
  await c.del("/api/account", { password: c.password });
  await c.fail(401, "GET", "/api/auth/me");
  for (const model of ["wallet", "transaction", "category", "auditLog"]) {
    assert.equal(await H.prisma[model].count({ where: { userId: c.user.id } }), 0, model + " harus terhapus");
  }
  assert.equal(await H.prisma.user.count({ where: { id: c.user.id } }), 0);
  await new H.Client().fail(401, "POST", "/api/auth/login", { email: c.email, password: c.password });
});

test("halaman depan publik: pengunjung melihat landing page, pengguna masuk dialihkan ke dashboard", async () => {
  const guest = new H.Client();
  const r = await guest.raw("GET", "/");
  assert.equal(r.status, 200);
  assert.match(r.text, /data-slider/);
  assert.match(r.text, /href="\/register"/);
  assert.doesNotMatch(r.text, /\{\{V\}\}/, "placeholder versi asset harus sudah diganti");
  // Tanpa skrip inline (CSP script-src 'self').
  assert.doesNotMatch(r.text, /<script(?![^>]*\bsrc=)[^>]*>/);
  for (const m of r.text.matchAll(/(?:href|src)="(\/assets\/[^"]+)"/g)) {
    const a = await guest.raw("GET", m[1]);
    assert.equal(a.status, 200, m[1]);
  }
  const c = await H.newUser("landing");
  const authed = await c.raw("GET", "/");
  assert.equal(authed.status, 302);
  assert.equal(authed.headers.get("location"), "/dashboard");
});
