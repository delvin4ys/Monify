const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const H = require("./helpers");
const receipts = require("../server/services/receipts");
const storage = require("../server/services/storage");

const users = [];
before(H.start);
after(async () => {
  receipts.setClientForTests(null);
  for (const id of users) fs.rmSync(path.join(storage.LOCAL_DIR, id), { recursive: true, force: true });
  await H.stop();
});

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const PDF = Buffer.from("%PDF-1.7\n" + "x".repeat(64));
const upload = (c, url, buf, name = "struk.png", type = "image/png") => {
  const form = new FormData();
  form.append("file", new Blob([buf], { type }), name);
  return c.raw("POST", url, { form });
};

/** Klien tiruan yang merekam request dan mengembalikan JSON yang ditentukan. */
function stub(output, { stop_reason = "end_turn", fail = false } = {}) {
  const calls = [];
  receipts.setClientForTests({
    beta: {
      messages: {
        create: async (req) => {
          calls.push(req);
          if (fail) throw Object.assign(new Error("boom"), { status: 529 });
          return { stop_reason, content: [{ type: "thinking", thinking: "" }, { type: "text", text: typeof output === "string" ? output : JSON.stringify(output) }] };
        },
      },
    },
  });
  return calls;
}

const GOOD = {
  isReceipt: true, merchant: "Kopi Kenangan", date: "2026-10-14", time: "09:41", total: 58500, subtotal: 53182, tax: 5318, serviceCharge: null,
  paymentMethod: "QRIS BCA", items: [{ name: "Kopi Susu", quantity: 2, price: 44000 }, { name: "Roti", quantity: 1, price: 14500 }],
  suggestedCategory: "kopi & camilan", suggestedWallet: "BCA", confidence: { merchant: "high", date: "high", total: "high", category: "medium" }, notes: null,
};

async function setup(label, consent = true) {
  const c = await H.newUser(label);
  users.push(c.user.id);
  const w = await H.wallet(c, "BCA", 1_000_000);
  if (consent) await c.patch("/api/user", { aiConsent: true });
  return { c, w };
}

test("tanpa persetujuan pengguna, struk tidak diproses AI", async () => {
  const { c } = await setup("noconsent", false);
  const calls = stub(GOOD);
  const r = await upload(c, "/api/receipts/scan", PNG);
  assert.equal(r.status, 403);
  assert.equal(r.json.error.code, "AI_CONSENT_REQUIRED");
  assert.equal(calls.length, 0, "gambar tidak boleh dikirim ke AI");
});

test("AI belum dikonfigurasi → 503 agar klien beralih ke input manual", async () => {
  const { c } = await setup("noai");
  receipts.setClientForTests(null);
  const r = await upload(c, "/api/receipts/scan", PNG);
  assert.equal(r.status, 503);
  assert.equal(r.json.error.code, "AI_UNAVAILABLE");
  assert.equal((await c.get("/api/bootstrap")).features.receiptScan, false);
});

test("hasil scan hanya draf: tidak ada transaksi atau perubahan saldo sebelum konfirmasi", async () => {
  const { c, w } = await setup("draft");
  const other = await H.newUser("draft-other");
  const calls = stub(GOOD);

  const r = await upload(c, "/api/receipts/scan?today=2026-10-15", PNG);
  assert.equal(r.status, 200, r.text);
  const { draft, attachmentKey } = r.json.data;
  assert.equal(draft.merchant, "Kopi Kenangan");
  assert.equal(draft.total, 58500);
  assert.equal(draft.date, "2026-10-14");
  assert.equal(draft.tax, 5318);
  assert.equal(draft.items.length, 2);
  const cat = await H.category(c, "expense", "Kopi & Camilan");
  assert.equal(draft.suggestedCategoryId, cat.id, "nama kategori dicocokkan ke ID milik pengguna");
  assert.equal(draft.suggestedWalletId, w.id);
  assert.deepEqual(draft.needsReview, ["category"], "kolom dengan keyakinan di bawah high ditandai untuk diperiksa");

  // BELUM ada transaksi, saldo utuh
  assert.equal((await c.get("/api/transactions")).items.length, 0);
  assert.equal((await H.balances(c)).BCA, 1_000_000);

  // Yang dikirim ke model: gambar + nama kategori/dompet; tanpa saldo, email, atau ID pengguna
  assert.equal(calls.length, 1);
  const req = calls[0];
  const sent = JSON.stringify({ ...req, messages: req.messages.map((m) => ({ ...m, content: m.content.filter((b) => b.type !== "image") })) });
  assert.ok(req.messages[0].content.some((b) => b.type === "image" && b.source.media_type === "image/png"));
  assert.ok(sent.includes("Kopi & Camilan") && sent.includes("BCA"));
  for (const secret of [c.email, c.user.id, "1000000", "1.000.000"]) assert.ok(!sent.includes(secret), "tidak boleh terkirim ke AI: " + secret);
  assert.equal(req.output_config.format.type, "json_schema");

  // Gambar tersimpan privat: pemilik bisa melihat, orang lain tidak
  const mine = await c.raw("GET", "/api/attachments?key=" + encodeURIComponent(attachmentKey));
  assert.equal(mine.status, 200);
  assert.equal(mine.headers.get("content-type"), "image/png");
  assert.equal((await other.raw("GET", "/api/attachments?key=" + encodeURIComponent(attachmentKey))).status, 403);

  // Konfirmasi (pengguna boleh mengubah nilai) → barulah transaksi tersimpan
  const t = (await c.post("/api/transactions", { kind: "expense", amount: 60_000, walletId: w.id, categoryId: cat.id, title: draft.merchant, date: draft.date, attachmentKey, source: "receipt_ai" })).transaction;
  assert.equal(t.source, "receipt_ai");
  assert.equal(t.hasAttachment, true);
  assert.equal((await H.balances(c)).BCA, 940_000);
  const file = await c.raw("GET", `/api/transactions/${t.id}/attachment`);
  assert.equal(file.status, 200);
  assert.equal(file.headers.get("x-content-type-options"), "nosniff");
  assert.equal((await other.raw("GET", `/api/transactions/${t.id}/attachment`)).status, 404);
  // lampiran yang terikat transaksi tidak bisa dihapus lepas; ikut terhapus bersama transaksinya
  assert.equal((await c.raw("DELETE", "/api/attachments?key=" + encodeURIComponent(attachmentKey))).status, 400);
  await c.del("/api/transactions/" + t.id);
  assert.equal((await c.raw("GET", "/api/attachments?key=" + encodeURIComponent(attachmentKey))).status, 404);
});

test("pengguna membatalkan: gambar struk bisa dihapus", async () => {
  const { c } = await setup("cancel");
  stub(GOOD);
  const { attachmentKey } = (await upload(c, "/api/receipts/scan", PNG)).json.data;
  await c.del("/api/attachments?key=" + encodeURIComponent(attachmentKey));
  assert.equal((await c.raw("GET", "/api/attachments?key=" + encodeURIComponent(attachmentKey))).status, 404);
  assert.equal((await c.get("/api/transactions")).items.length, 0);
});

test("keluaran AI yang tidak masuk akal dinetralkan dan ditandai untuk diperiksa", async () => {
  const { c } = await setup("weird");
  stub({ ...GOOD, total: -500, date: "2099-01-01", merchant: "   ", suggestedCategory: "Kategori Karangan", suggestedWallet: "Dompet Orang", time: "jam sembilan", items: [{ name: "<script>", quantity: null, price: 1e30 }] });
  const { draft } = (await upload(c, "/api/receipts/scan?today=2026-10-15", PNG)).json.data;
  assert.equal(draft.total, null);
  assert.equal(draft.date, null, "tanggal di masa depan ditolak");
  assert.equal(draft.merchant, null);
  assert.equal(draft.time, null);
  assert.equal(draft.suggestedCategoryId, null);
  assert.equal(draft.suggestedWalletId, null);
  assert.equal(draft.items[0].price, null);
  assert.deepEqual(draft.needsReview.sort(), ["category", "date", "merchant", "total"]);
});

test("kegagalan AI → pesan aman + fallback manual, tanpa transaksi", async () => {
  const { c } = await setup("fail");
  stub(GOOD, { fail: true });
  let r = await upload(c, "/api/receipts/scan", PNG);
  assert.equal(r.status, 502);
  assert.equal(r.json.error.code, "AI_FAILED");
  assert.ok(!r.text.includes("boom"));
  stub("ini bukan json");
  assert.equal((await upload(c, "/api/receipts/scan", PNG)).json.error.code, "AI_NO_RESULT");
  stub(GOOD, { stop_reason: "refusal" });
  assert.equal((await upload(c, "/api/receipts/scan", PNG)).json.error.code, "AI_NO_RESULT");
  stub({ ...GOOD, isReceipt: false });
  r = await upload(c, "/api/receipts/scan", PNG);
  assert.equal(r.status, 422);
  assert.equal(r.json.error.code, "NOT_A_RECEIPT");
  assert.equal((await c.get("/api/transactions")).items.length, 0);
});

test("unggahan: tipe ditentukan dari isi file, bukan nama/Content-Type", async () => {
  const { c } = await setup("upload");
  const calls = stub(GOOD);
  const html = Buffer.from("<html><script>alert(1)</script></html>".padEnd(80, " "));
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'.padEnd(80, " "));
  for (const [buf, name, type] of [[html, "struk.png", "image/png"], [svg, "logo.svg", "image/svg+xml"], [Buffer.from("MZ" + "x".repeat(80)), "a.jpg", "image/jpeg"]]) {
    const r = await upload(c, "/api/attachments", buf, name, type);
    assert.equal(r.status, 400, name);
    assert.equal(r.json.error.code, "UNSUPPORTED_FILE");
    assert.equal((await upload(c, "/api/receipts/scan", buf, name, type)).status, 400);
  }
  assert.equal(calls.length, 0, "file tidak valid tidak pernah dikirim ke AI");
  // PDF boleh sebagai lampiran, tetapi tidak untuk pemindai struk
  const pdf = await upload(c, "/api/attachments", PDF, "nota.pdf", "application/pdf");
  assert.equal(pdf.status, 201);
  assert.match(pdf.json.data.attachmentKey, new RegExp(`^${c.user.id}/[a-f0-9]{32}\\.pdf$`), "nama file asli tidak dipakai");
  assert.equal((await upload(c, "/api/receipts/scan", PDF, "nota.pdf", "application/pdf")).status, 400);
  // batas ukuran
  const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
  const tooBig = await upload(c, "/api/attachments", big);
  assert.equal(tooBig.status, 413);
  assert.equal(tooBig.json.error.code, "FILE_TOO_LARGE");
  assert.equal((await c.raw("POST", "/api/attachments", { body: {} })).status, 400);
});
