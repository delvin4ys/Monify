const { test } = require("node:test");
const assert = require("node:assert/strict");
const dates = require("../server/lib/dates");
const v = require("../server/lib/validate");
const reports = require("../server/services/reports");
const storage = require("../server/services/storage");
const ledger = require("../server/services/ledger");

test("dates: tanggal kalender tidak bergeser oleh zona waktu", () => {
  assert.equal(dates.toDay(dates.toDate("2026-01-01")), "2026-01-01");
  assert.equal(dates.toDate("2026-03-05").toISOString(), "2026-03-05T12:00:00.000Z");
  assert.ok(dates.isDay("2028-02-29"));
  for (const bad of ["2026-02-29", "2026-13-01", "2026-1-1", "01/02/2026", "", null, 20260101]) assert.equal(dates.isDay(bad), false, String(bad));
  assert.throws(() => dates.toDate("2026-02-30"));
  const r = dates.dayRange("2026-01-31", "2026-02-01");
  assert.equal(r.gte.toISOString(), "2026-01-31T00:00:00.000Z");
  assert.equal(r.lte.toISOString(), "2026-02-01T23:59:59.999Z");
  assert.throws(() => dates.dayRange("2026-02-02", "2026-02-01"));
  assert.equal(dates.addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(dates.addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(dates.diffDays("2026-01-01", "2026-12-31"), 364);
  assert.deepEqual(dates.monthBounds(2028, 2), { from: "2028-02-01", to: "2028-02-29" });
  assert.deepEqual(dates.monthOf("2026-04-17"), { from: "2026-04-01", to: "2026-04-30" });
  assert.deepEqual(dates.addMonths(2026, 1, -1), { year: 2025, month: 12 });
  assert.deepEqual(dates.addMonths(2026, 11, 3), { year: 2027, month: 2 });
  // "hari ini" mengikuti zona waktu aplikasi, bukan UTC
  assert.match(dates.today("Asia/Jakarta"), /^\d{4}-\d{2}-\d{2}$/);
  const utc = dates.today("UTC");
  const tokyo = dates.today("Pacific/Kiritimati"); // UTC+14
  assert.ok(tokyo >= utc);
});

test("validate: nominal uang hanya bilangan bulat positif yang aman", () => {
  assert.equal(v.amount({ a: 1500 }, "a"), 1500);
  assert.equal(v.amount({ a: "2500" }, "a"), 2500);
  assert.equal(v.amount({ a: 0 }, "a", { allowZero: true }), 0);
  assert.equal(v.amount({}, "a", { required: false }), null);
  for (const bad of [0, -1, 1.5, "1.5", "1e3", "abc", NaN, Infinity, 2 ** 60, {}, [], true]) {
    assert.throws(() => v.amount({ a: bad }, "a"), (e) => e.status === 400 && Boolean(e.fields.a), String(bad));
  }
  assert.throws(() => v.amount({}, "a"));
});

test("validate: teks, email, id, warna, idempotency key", () => {
  assert.equal(v.str({ n: "  Halo\u0000\u0007  " }, "n"), "Halo");
  assert.equal(v.str({ n: "" }, "n", { required: false, min: 0 }), null);
  assert.throws(() => v.str({ n: "x".repeat(201) }, "n"));
  assert.throws(() => v.str({ n: 123 }, "n"));
  assert.equal(v.email({ email: "  A@B.Co " }), "a@b.co");
  for (const bad of ["a", "a@b", "a b@c.de", "@c.de"]) assert.throws(() => v.email({ email: bad }));
  assert.equal(v.id({ id: "cku_123-AB" }, "id"), "cku_123-AB");
  for (const bad of ["a b", "../x", "a;drop", "x".repeat(65), 5]) assert.throws(() => v.id({ id: bad }, "id"));
  assert.equal(v.color({ color: "#FF4D3D" }), "#ff4d3d");
  for (const bad of ["red", "#fff", "#gggggg", "url(x)"]) assert.throws(() => v.color({ color: bad }));
  const req = (h) => ({ get: () => h, body: {} });
  assert.equal(v.idempotencyKey(req("abc-12345")), "abc-12345");
  assert.equal(v.idempotencyKey(req(undefined)), null);
  assert.throws(() => v.idempotencyKey(req("short")));
  assert.throws(() => v.idempotencyKey(req("has spaces here")));
});

test("laporan: bucket waktu selaras dengan date_trunc Postgres", () => {
  assert.equal(reports.bucketStart("2026-03-04", "week"), "2026-03-02"); // Rabu → Senin
  assert.equal(reports.bucketStart("2026-03-08", "week"), "2026-03-02"); // Minggu → Senin
  assert.equal(reports.bucketStart("2026-03-02", "week"), "2026-03-02");
  assert.equal(reports.bucketStart("2026-01-01", "week"), "2025-12-29"); // lintas tahun
  assert.equal(reports.bucketStart("2026-08-19", "quarter"), "2026-07-01");
  assert.equal(reports.bucketStart("2026-12-31", "quarter"), "2026-10-01");
  assert.equal(reports.bucketStart("2026-08-19", "month"), "2026-08-01");
  assert.equal(reports.bucketStart("2026-08-19", "year"), "2026-01-01");
  assert.equal(reports.nextBucket("2026-12-01", "month"), "2027-01-01");
  assert.equal(reports.nextBucket("2026-10-01", "quarter"), "2027-01-01");
  assert.equal(reports.nextBucket("2026-12-28", "week"), "2027-01-04");
  assert.equal(reports.autoGranularity("2026-10-01", "2026-10-31"), "day");
  assert.equal(reports.autoGranularity("2026-08-01", "2026-10-31"), "week");
  assert.equal(reports.autoGranularity("2026-01-01", "2026-10-31"), "month");
  assert.equal(reports.autoGranularity("2021-01-01", "2026-10-31"), "quarter");
  assert.equal(reports.autoGranularity("2010-01-01", "2026-10-31"), "year");
});

test("ledger: arah mutasi", () => {
  assert.equal(ledger.signed("in", 500n), 500);
  assert.equal(ledger.signed("out", 500n), -500);
  assert.equal(ledger.signed("out", 0), -0);
});

test("storage: deteksi tipe dari magic bytes dan kunci hanya di folder sendiri", () => {
  const pad = (b) => Buffer.concat([b, Buffer.alloc(32)]);
  assert.equal(storage.sniff(pad(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).ext, "jpg");
  assert.equal(storage.sniff(pad(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).ext, "png");
  assert.equal(storage.sniff(pad(Buffer.from("RIFF\0\0\0\0WEBP", "latin1"))).ext, "webp");
  assert.equal(storage.sniff(pad(Buffer.from("%PDF-1.4"))).ext, "pdf");
  assert.equal(storage.sniff(pad(Buffer.from("<svg xmlns"))), null);
  assert.equal(storage.sniff(pad(Buffer.from("GIF89a"))), null);
  assert.equal(storage.sniff(Buffer.from([0xff, 0xd8])), null);
  const key = "user1/" + "0f".repeat(16) + ".png";
  assert.equal(storage.assertOwnKey("user1", key), key);
  assert.throws(() => storage.assertOwnKey("user2", key), (e) => e.status === 403);
  for (const bad of ["user1/../user2/" + "0f".repeat(16) + ".png", "user1/x.png", "user1/" + "0f".repeat(16) + ".svg", "/etc/passwd", "", null]) {
    assert.throws(() => storage.assertOwnKey("user1", bad), (e) => e.status === 404, String(bad));
  }
});

test("storage: di serverless tanpa Supabase unggahan ditolak, bukan disimpan sementara lalu hilang", async () => {
  const storage = require("../server/services/storage");
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
  assert.equal(storage.driver(), "local");
  process.env.VERCEL = "1";
  try {
    assert.equal(storage.driver(), "none");
    await assert.rejects(storage.save("user1", png), (e) => e.status === 503 && e.code === "STORAGE_UNAVAILABLE");
    assert.equal(require("../server/services/receipts").isAvailable(), false);
  } finally {
    delete process.env.VERCEL;
  }
});
