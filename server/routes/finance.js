const express = require("express");
const multer = require("multer");
const { h, ok, badRequest } = require("../lib/errors");
const v = require("../lib/validate");
const dates = require("../lib/dates");
const { config } = require("../config");
const { requireAuth, rateLimit } = require("../middleware/security");
const { prisma } = require("../lib/prisma");
const users = require("../services/users");
const wallets = require("../services/wallets");
const categories = require("../services/categories");
const transactions = require("../services/transactions");
const transfers = require("../services/transfers");
const debts = require("../services/debts");
const budgets = require("../services/budgets");
const savings = require("../services/savings");
const reports = require("../services/reports");
const storage = require("../services/storage");
const receipts = require("../services/receipts");
const ledger = require("../services/ledger");

const router = express.Router();
router.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.upload.maxBytes, files: 1 } });
const uploadLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 60, key: (req) => req.userId });
const scanLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 30, key: (req) => req.userId, message: "Batas pemindaian struk per jam tercapai." });

/** Tanggal "hari ini" dari klien (zona waktu pengguna) bila valid; selain itu zona waktu aplikasi. */
const clientToday = (req) => (dates.isDay(req.query.today) ? req.query.today : dates.today());
const text = (b, f, max = 200, label = f) => v.str(b, f, { required: false, min: 0, max, label });
const optional = (b, f, fn) => (v.has(b, f) ? (b[f] === null || b[f] === "" ? null : fn()) : undefined);

// ——— Bootstrap: semua data referensi dalam satu request ———
router.get(
  "/bootstrap",
  h(async (req, res) => {
    const [user, w, c] = await Promise.all([users.getProfile(req.userId), wallets.list(req.userId), categories.list(req.userId)]);
    ok(res, { user, wallets: w, categories: c.categories, categoryParents: c.parents, features: { receiptScan: receipts.isAvailable(), storage: storage.driver() } });
  })
);

router.get(
  "/dashboard",
  h(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { displayCurrency: true } });
    ok(res, await reports.dashboard(req.userId, { todayStr: clientToday(req), currency: user.displayCurrency }));
  })
);

router.get(
  "/reports",
  h(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { displayCurrency: true } });
    ok(
      res,
      await reports.report(req.userId, {
        from: v.day(req.query, "from", { label: "Tanggal awal" }),
        to: v.day(req.query, "to", { label: "Tanggal akhir" }),
        granularity: v.oneOf(req.query, "granularity", reports.GRANULARITIES, { required: false }),
        walletId: v.id(req.query, "walletId", { required: false }),
        currency: user.displayCurrency,
      })
    );
  })
);

/** Diagnostik integritas: saldo tersimpan vs saldo awal + Σ mutasi. */
router.get(
  "/reconcile",
  h(async (req, res) => {
    const rows = await ledger.reconcile(prisma, req.userId);
    ok(res, { consistent: rows.every((r) => r.difference === 0), wallets: rows });
  })
);

// ——— Dompet ———
router.get("/wallets", h(async (req, res) => ok(res, { wallets: await wallets.list(req.userId) })));

router.post(
  "/wallets",
  h(async (req, res) => {
    const b = req.body || {};
    const wallet = await wallets.create(req.userId, {
      name: v.str(b, "name", { max: 60, label: "Nama dompet" }),
      type: v.oneOf(b, "type", wallets.WALLET_TYPES, { required: false, fallback: "bank", label: "Tipe dompet" }),
      color: v.color(b),
      logo: text(b, "logo", 300, "Ikon"),
      initialBalance: v.amount(b, "initialBalance", { required: false, allowZero: true, label: "Saldo awal" }) || 0,
    });
    ok(res, { wallet }, 201);
  })
);

router.patch(
  "/wallets/:id",
  h(async (req, res) => {
    const b = req.body || {};
    const wallet = await wallets.update(req.userId, req.params.id, {
      name: v.has(b, "name") ? v.str(b, "name", { max: 60, label: "Nama dompet" }) : undefined,
      type: v.oneOf(b, "type", wallets.WALLET_TYPES, { required: false, label: "Tipe dompet" }) || undefined,
      color: optional(b, "color", () => v.color(b)),
      logo: optional(b, "logo", () => text(b, "logo", 300, "Ikon")),
      active: v.bool(b, "active"),
      initialBalance: v.has(b, "initialBalance") ? v.amount(b, "initialBalance", { allowZero: true, label: "Saldo awal" }) : undefined,
    });
    ok(res, { wallet });
  })
);

router.post(
  "/wallets/:id/adjust",
  h(async (req, res) => {
    const b = req.body || {};
    const wallet = await wallets.adjustBalance(req.userId, req.params.id, {
      targetBalance: v.amount(b, "targetBalance", { allowZero: true, label: "Saldo sebenarnya" }),
      date: v.day(b, "date"),
      note: text(b, "note", 120, "Catatan"),
    });
    ok(res, { wallet });
  })
);

router.delete("/wallets/:id", h(async (req, res) => ok(res, await wallets.remove(req.userId, req.params.id).then(() => ({})))));

// ——— Kategori ———
router.get("/categories", h(async (req, res) => ok(res, await categories.list(req.userId))));

router.post(
  "/categories",
  h(async (req, res) => {
    const b = req.body || {};
    const category = await categories.create(req.userId, {
      name: v.str(b, "name", { max: 60, label: "Nama kategori" }),
      type: v.oneOf(b, "type", ["expense", "income"], { label: "Jenis" }),
      icon: text(b, "icon", 16, "Ikon"),
      color: v.color(b),
      parentId: v.id(b, "parentId", { required: false }),
    });
    ok(res, { category }, 201);
  })
);

router.patch(
  "/categories/:id",
  h(async (req, res) => {
    const b = req.body || {};
    const category = await categories.update(req.userId, req.params.id, {
      name: v.has(b, "name") ? v.str(b, "name", { max: 60, label: "Nama kategori" }) : undefined,
      icon: v.has(b, "icon") ? v.str(b, "icon", { max: 16, label: "Ikon" }) : undefined,
      color: optional(b, "color", () => v.color(b)),
      parentId: optional(b, "parentId", () => v.id(b, "parentId")),
      archived: v.bool(b, "archived"),
    });
    ok(res, { category });
  })
);

router.delete("/categories/:id", h(async (req, res) => ok(res, await categories.remove(req.userId, req.params.id).then(() => ({})))));

router.post(
  "/category-parents",
  h(async (req, res) => {
    const parent = await categories.createParent(req.userId, {
      name: v.str(req.body, "name", { max: 60, label: "Nama grup" }),
      kind: v.oneOf(req.body, "kind", ["expense", "income"], { label: "Jenis" }),
    });
    ok(res, { parent }, 201);
  })
);

router.delete("/category-parents/:id", h(async (req, res) => ok(res, await categories.removeParent(req.userId, req.params.id).then(() => ({})))));

// ——— Transaksi ———
function attachmentKey(req, b) {
  if (!v.has(b, "attachmentKey")) return undefined;
  if (b.attachmentKey === null || b.attachmentKey === "") return null;
  return storage.assertOwnKey(req.userId, b.attachmentKey);
}

router.get(
  "/transactions",
  h(async (req, res) => {
    const q = req.query;
    const from = v.day(q, "from", { required: false });
    const to = v.day(q, "to", { required: false });
    if (Boolean(from) !== Boolean(to)) throw badRequest("Isi tanggal awal dan akhir.", { from: "Lengkapi rentang tanggal." });
    ok(
      res,
      await transactions.list(req.userId, {
        from,
        to,
        walletId: v.id(q, "walletId", { required: false }),
        categoryId: v.id(q, "categoryId", { required: false }),
        debtId: v.id(q, "debtId", { required: false }),
        kind: v.oneOf(q, "kind", ["expense", "income", "transfer", "debt", "adjustment"], { required: false }),
        status: v.oneOf(q, "status", ["success", "pending"], { required: false }),
        sort: v.oneOf(q, "sort", ["date_desc", "date_asc", "amount_desc", "amount_asc"], { required: false, fallback: "date_desc" }),
        q: v.str(q, "q", { required: false, min: 0, max: 80 }),
        cursor: v.id(q, "cursor", { required: false }),
        limit: v.int(q, "limit", { required: false, min: 1, max: 100 }),
      })
    );
  })
);

router.post(
  "/transactions",
  h(async (req, res) => {
    const b = req.body || {};
    const kind = v.oneOf(b, "kind", ["expense", "income", "transfer"], { label: "Jenis transaksi" });
    const r = await transactions.create(req.userId, {
      kind,
      amount: v.amount(b, "amount"),
      walletId: v.id(b, "walletId", { label: "Dompet" }),
      categoryId: kind === "transfer" ? null : v.id(b, "categoryId", { label: "Kategori" }),
      direction: kind === "transfer" ? v.oneOf(b, "direction", ["in", "out"], { required: false, fallback: "out" }) : undefined,
      title: v.str(b, "title", { max: 140, label: "Deskripsi" }),
      date: v.day(b, "date"),
      status: v.oneOf(b, "status", ["success", "pending"], { required: false, fallback: "success" }),
      counterparty: text(b, "counterparty", 80, "Nama pihak"),
      relatedParty: text(b, "relatedParty", 80, "Pihak terkait"),
      attachmentKey: attachmentKey(req, b) || null,
      source: v.oneOf(b, "source", ["manual", "receipt_ai"], { required: false, fallback: "manual" }),
      idempotencyKey: v.idempotencyKey(req),
    });
    ok(res, r, r.replayed ? 200 : 201);
  })
);

router.get("/transactions/:id", h(async (req, res) => ok(res, { transaction: await transactions.get(req.userId, req.params.id) })));

router.patch(
  "/transactions/:id",
  h(async (req, res) => {
    const b = req.body || {};
    const transaction = await transactions.update(req.userId, req.params.id, {
      kind: v.oneOf(b, "kind", ["expense", "income", "transfer"], { required: false }) || undefined,
      amount: v.has(b, "amount") ? v.amount(b, "amount") : undefined,
      walletId: v.id(b, "walletId", { required: false }) || undefined,
      categoryId: optional(b, "categoryId", () => v.id(b, "categoryId")),
      direction: v.oneOf(b, "direction", ["in", "out"], { required: false }) || undefined,
      title: v.has(b, "title") ? v.str(b, "title", { max: 140, label: "Deskripsi" }) : undefined,
      date: v.day(b, "date", { required: false }) || undefined,
      status: v.oneOf(b, "status", ["success", "pending"], { required: false }) || undefined,
      counterparty: optional(b, "counterparty", () => text(b, "counterparty", 80, "Nama pihak")),
      relatedParty: optional(b, "relatedParty", () => text(b, "relatedParty", 80, "Pihak terkait")),
      attachmentKey: attachmentKey(req, b),
    });
    ok(res, { transaction });
  })
);

router.delete(
  "/transactions/:id",
  h(async (req, res) => {
    const r = await transactions.remove(req.userId, req.params.id);
    if (r && r.attachmentKey) await storage.remove(req.userId, r.attachmentKey).catch(() => {});
    ok(res, {});
  })
);

/** Lampiran transaksi — hanya pemiliknya yang bisa mengambil. */
router.get(
  "/transactions/:id/attachment",
  h(async (req, res) => {
    const t = await prisma.transaction.findFirst({ where: { id: req.params.id, userId: req.userId }, select: { attachmentKey: true } });
    if (!t || !t.attachmentKey) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Lampiran tidak ditemukan." } });
    const file = await storage.read(req.userId, t.attachmentKey);
    res.set({ "Content-Type": file.mime, "Content-Disposition": "inline", "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" });
    res.send(file.buffer);
  })
);

// ——— Lampiran & pemindai struk ———
router.post(
  "/attachments",
  uploadLimiter,
  upload.single("file"),
  h(async (req, res) => {
    if (!req.file) throw badRequest("Pilih file untuk diunggah.", { file: "File wajib." });
    const saved = await storage.save(req.userId, req.file.buffer);
    ok(res, { attachmentKey: saved.key, mime: saved.mime, size: saved.size }, 201);
  })
);

/** Pratinjau lampiran yang belum terikat transaksi (mis. struk yang baru dipindai). */
router.get(
  "/attachments",
  h(async (req, res) => {
    const file = await storage.read(req.userId, String(req.query.key || ""));
    res.set({ "Content-Type": file.mime, "Content-Disposition": "inline", "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" });
    res.send(file.buffer);
  })
);

/** Hapus lampiran yang tidak jadi dipakai. Lampiran yang masih terikat transaksi ditolak. */
router.delete(
  "/attachments",
  h(async (req, res) => {
    const key = storage.assertOwnKey(req.userId, String(req.query.key || ""));
    const used = await prisma.transaction.count({ where: { userId: req.userId, attachmentKey: key } });
    if (used) throw badRequest("Lampiran masih dipakai transaksi.");
    await storage.remove(req.userId, key);
    ok(res, {});
  })
);

router.post(
  "/receipts/scan",
  scanLimiter,
  upload.single("file"),
  h(async (req, res) => {
    if (!req.file) throw badRequest("Pilih foto struk.", { file: "File wajib." });
    ok(res, await receipts.scan(req.userId, req.file.buffer, clientToday(req)));
  })
);

// ——— Transfer antar dompet ———
router.post(
  "/transfers",
  h(async (req, res) => {
    const b = req.body || {};
    const r = await transfers.create(req.userId, {
      fromWalletId: v.id(b, "fromWalletId", { label: "Dompet asal" }),
      toWalletId: v.id(b, "toWalletId", { label: "Dompet tujuan" }),
      amount: v.amount(b, "amount"),
      date: v.day(b, "date"),
      note: text(b, "note", 140, "Catatan"),
      idempotencyKey: v.idempotencyKey(req),
    });
    ok(res, r, r.replayed ? 200 : 201);
  })
);

router.get("/transfers/:id", h(async (req, res) => ok(res, { transfer: await transfers.get(req.userId, req.params.id) })));

router.patch(
  "/transfers/:id",
  h(async (req, res) => {
    const b = req.body || {};
    const transfer = await transfers.update(req.userId, req.params.id, {
      fromWalletId: v.id(b, "fromWalletId", { required: false }) || undefined,
      toWalletId: v.id(b, "toWalletId", { required: false }) || undefined,
      amount: v.has(b, "amount") ? v.amount(b, "amount") : undefined,
      date: v.day(b, "date", { required: false }) || undefined,
      note: optional(b, "note", () => text(b, "note", 140, "Catatan")),
    });
    ok(res, { transfer });
  })
);

router.delete("/transfers/:id", h(async (req, res) => ok(res, await transfers.remove(req.userId, req.params.id).then(() => ({})))));

// ——— Hutang & piutang ———
router.get(
  "/debts",
  h(async (req, res) =>
    ok(
      res,
      await debts.list(req.userId, {
        status: v.oneOf(req.query, "status", ["OPEN", "PAID"], { required: false }),
        type: v.oneOf(req.query, "type", ["PAYABLE", "RECEIVABLE"], { required: false }),
      })
    )
  )
);

router.post(
  "/debts",
  h(async (req, res) => {
    const b = req.body || {};
    const debt = await debts.create(req.userId, {
      type: v.oneOf(b, "type", ["PAYABLE", "RECEIVABLE"], { label: "Jenis" }),
      personName: v.str(b, "personName", { max: 80, label: "Nama orang" }),
      amount: v.amount(b, "amount"),
      date: v.day(b, "date"),
      dueDate: v.day(b, "dueDate", { required: false, label: "Jatuh tempo" }),
      description: text(b, "description", 200, "Deskripsi"),
      walletId: v.id(b, "walletId", { required: false }),
      idempotencyKey: v.idempotencyKey(req),
    });
    ok(res, { debt }, 201);
  })
);

router.get("/debts/:id", h(async (req, res) => ok(res, { debt: await debts.get(req.userId, req.params.id) })));

router.patch(
  "/debts/:id",
  h(async (req, res) => {
    const b = req.body || {};
    const debt = await debts.update(req.userId, req.params.id, {
      personName: v.has(b, "personName") ? v.str(b, "personName", { max: 80, label: "Nama orang" }) : undefined,
      amount: v.has(b, "amount") ? v.amount(b, "amount") : undefined,
      date: v.day(b, "date", { required: false }) || undefined,
      dueDate: optional(b, "dueDate", () => v.day(b, "dueDate", { label: "Jatuh tempo" })),
      description: optional(b, "description", () => text(b, "description", 200, "Deskripsi")),
    });
    ok(res, { debt });
  })
);

router.delete("/debts/:id", h(async (req, res) => ok(res, await debts.remove(req.userId, req.params.id).then(() => ({})))));

router.post(
  "/debts/:id/payments",
  h(async (req, res) => {
    const b = req.body || {};
    const r = await debts.addPayment(req.userId, req.params.id, {
      amount: v.amount(b, "amount"),
      date: v.day(b, "date"),
      walletId: v.id(b, "walletId", { label: "Dompet" }),
      note: text(b, "note", 140, "Catatan"),
      feeAmount: v.amount(b, "feeAmount", { required: false, label: "Bunga/biaya" }),
      feeCategoryId: v.id(b, "feeCategoryId", { required: false }),
      idempotencyKey: v.idempotencyKey(req),
    });
    ok(res, r, r.replayed ? 200 : 201);
  })
);

router.patch(
  "/debts/:id/payments/:paymentId",
  h(async (req, res) => {
    const b = req.body || {};
    const debt = await debts.updatePayment(req.userId, req.params.id, req.params.paymentId, {
      amount: v.has(b, "amount") ? v.amount(b, "amount") : undefined,
      date: v.day(b, "date", { required: false }) || undefined,
      walletId: v.id(b, "walletId", { required: false }) || undefined,
      note: optional(b, "note", () => text(b, "note", 140, "Catatan")),
    });
    ok(res, { debt });
  })
);

router.delete(
  "/debts/:id/payments/:paymentId",
  h(async (req, res) => {
    await debts.removePayment(req.userId, req.params.id, req.params.paymentId);
    ok(res, { debt: await debts.get(req.userId, req.params.id) });
  })
);

// ——— Budget ———
router.get(
  "/budgets",
  h(async (req, res) => {
    const t = clientToday(req);
    const year = v.int(req.query, "year", { required: false, min: 2000, max: 2100 }) || Number(t.slice(0, 4));
    const month = v.int(req.query, "month", { required: false, min: 1, max: 12 }) || Number(t.slice(5, 7));
    ok(res, await budgets.listForMonth(req.userId, year, month, t));
  })
);

router.post(
  "/budgets",
  h(async (req, res) => {
    const b = req.body || {};
    const periodStart = v.day(b, "periodStart", { required: false });
    const periodEnd = v.day(b, "periodEnd", { required: false });
    const custom = Boolean(periodStart && periodEnd);
    ok(
      res,
      await budgets.create(req.userId, {
        targetKind: v.oneOf(b, "targetKind", ["CATEGORY", "PARENT"], { label: "Target" }),
        targetId: v.id(b, "targetId", { label: "Kategori" }),
        walletId: v.id(b, "walletId", { required: false }),
        limitAmount: v.amount(b, "limitAmount", { label: "Batas budget" }),
        year: custom ? null : v.int(b, "year", { min: 2000, max: 2100, label: "Tahun" }),
        month: custom ? null : v.int(b, "month", { min: 1, max: 12, label: "Bulan" }),
        periodStart,
        periodEnd,
      }),
      201
    );
  })
);

router.patch(
  "/budgets/:id",
  h(async (req, res) => {
    const b = req.body || {};
    ok(
      res,
      await budgets.update(req.userId, req.params.id, {
        limitAmount: v.has(b, "limitAmount") ? v.amount(b, "limitAmount", { label: "Batas budget" }) : undefined,
        walletId: optional(b, "walletId", () => v.id(b, "walletId")),
      })
    );
  })
);

router.delete("/budgets/:id", h(async (req, res) => ok(res, await budgets.remove(req.userId, req.params.id).then(() => ({})))));

// ——— Tujuan tabungan ———
router.get("/savings", h(async (req, res) => ok(res, await savings.list(req.userId))));

router.post(
  "/savings",
  h(async (req, res) => {
    const b = req.body || {};
    const goal = await savings.create(req.userId, {
      name: v.str(b, "name", { max: 60, label: "Nama tujuan" }),
      targetAmount: v.amount(b, "targetAmount", { label: "Target" }),
      targetDate: v.day(b, "targetDate", { required: false, label: "Tanggal target" }),
      icon: text(b, "icon", 16, "Ikon"),
      color: v.color(b),
      walletId: v.id(b, "walletId", { required: false }),
    });
    ok(res, { goal }, 201);
  })
);

router.get("/savings/:id", h(async (req, res) => ok(res, { goal: await savings.get(req.userId, req.params.id) })));

router.patch(
  "/savings/:id",
  h(async (req, res) => {
    const b = req.body || {};
    const goal = await savings.update(req.userId, req.params.id, {
      name: v.has(b, "name") ? v.str(b, "name", { max: 60, label: "Nama tujuan" }) : undefined,
      targetAmount: v.has(b, "targetAmount") ? v.amount(b, "targetAmount", { label: "Target" }) : undefined,
      targetDate: optional(b, "targetDate", () => v.day(b, "targetDate", { label: "Tanggal target" })),
      icon: optional(b, "icon", () => text(b, "icon", 16, "Ikon")),
      color: optional(b, "color", () => v.color(b)),
      walletId: optional(b, "walletId", () => v.id(b, "walletId")),
      archived: v.bool(b, "archived"),
    });
    ok(res, { goal });
  })
);

router.delete("/savings/:id", h(async (req, res) => ok(res, await savings.remove(req.userId, req.params.id).then(() => ({})))));

router.post(
  "/savings/:id/entries",
  h(async (req, res) => {
    const b = req.body || {};
    ok(
      res,
      await savings.addEntry(req.userId, req.params.id, {
        type: v.oneOf(b, "type", ["deposit", "withdraw"], { required: false, fallback: "deposit" }),
        amount: v.amount(b, "amount"),
        date: v.day(b, "date"),
        note: text(b, "note", 140, "Catatan"),
        walletId: v.id(b, "walletId", { required: false }),
        idempotencyKey: v.idempotencyKey(req),
      }),
      201
    );
  })
);

router.delete("/savings/:id/entries/:entryId", h(async (req, res) => ok(res, { goal: await savings.removeEntry(req.userId, req.params.id, req.params.entryId) })));

module.exports = router;
