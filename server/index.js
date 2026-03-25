/**
 * Monify — server API (Express) + sesi cookie.
 */
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");
const session = require("express-session");
const { PrismaSessionStore } = require("@quixo3/prisma-session-store");
const bcrypt = require("bcryptjs");
const multer = require("multer");

const { prisma } = require("./lib/prisma");
const { isAdminEmail } = require("./lib/admin");
const { getFinancialSummary } = require("./lib/summary");
const { getMonthlyIncomeSeries } = require("./lib/monthly-income");
const { getBudgetRowsForMonth, getBudgetMonthSummary } = require("./lib/budget-queries");
const { getReportData } = require("./lib/report-stats");
const { createDefaultWalletsAndCategories } = require("./lib/default-user-data");
const { walletToJson, categoryToJson, transactionToJson, categoryParentToJson } = require("./lib/serializers");
const { getWalletDelta } = require("./lib/wallet-delta");

const app = express();
const publicDir = path.join(__dirname, "..", "public");
const storageUploadDir = path.join(__dirname, "..", "storage", "uploads");
const PORT = Number(process.env.PORT) || 3000;

try {
  if (!fs.existsSync(storageUploadDir)) {
    fs.mkdirSync(storageUploadDir, { recursive: true });
  }
} catch (e) {
  console.warn("Gagal membuat folder storage (mungkin read-only):", e.message);
}

const upload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, storageUploadDir);
    },
    filename: function (req, file, cb) {
      const ext = path.extname(file.originalname || "") || ".jpg";
      cb(null, Date.now() + "-" + Math.random().toString(36).slice(2) + ext);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
});

app.use(express.json({ limit: "2mb" }));
app.get("/api/health", (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.use(
  session({
    name: "monify.sid",
    secret: process.env.AUTH_SECRET || "ubah-auth-secret-di-env",
    resave: false,
    saveUninitialized: false,
    store: new PrismaSessionStore(prisma, {
      checkPeriod: 2 * 60 * 1000,
      dbRecordIdIsSessionId: true,
      dbRecordIdFunction: undefined,
    }),
    cookie: {
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  })
);

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

function periodDateFilter(period) {
  const now = new Date();
  const y = now.getFullYear();
  const mo = now.getMonth();
  if (!period || period === "thisMonth") {
    return {
      gte: new Date(y, mo, 1, 0, 0, 0, 0),
      lte: new Date(y, mo + 1, 0, 23, 59, 59, 999),
    };
  }
  if (period === "lastMonth") {
    const py = mo === 0 ? y - 1 : y;
    const pm = mo === 0 ? 11 : mo - 1;
    return {
      gte: new Date(py, pm, 1, 0, 0, 0, 0),
      lte: new Date(py, pm + 1, 0, 23, 59, 59, 999),
    };
  }
  if (period === "future") {
    return { gte: new Date(y, mo + 1, 1, 0, 0, 0, 0) };
  }
  if (/^\d{4}-\d{2}$/.test(period)) {
    const yy = Number(period.slice(0, 4));
    const mm = Number(period.slice(5, 7));
    return {
      gte: new Date(yy, mm - 1, 1, 0, 0, 0, 0),
      lte: new Date(yy, mm, 0, 23, 59, 59, 999),
    };
  }
  return null;
}

// ——— Auth ———
app.post("/api/auth/login", async (req, res) => {
  try {
    const email = typeof req.body.email === "string" ? req.body.email.toLowerCase().trim() : "";
    const password = req.body.password;
    if (!email || !password) {
      return res.status(400).json({ error: "Email dan password wajib diisi." });
    }
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash) {
      return res.status(401).json({ error: "Email atau password salah." });
    }
    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: "Email atau password salah." });
    }
    req.session.userId = user.id;
    req.session.email = user.email;
    req.session.name = user.name;
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: "Gagal membuat sesi." });
      res.json({ ok: true, user: { id: user.id, email: user.email, name: user.name } });
    });
  } catch (e) {
    res.status(500).json({ error: e.message || "Gagal login." });
  }
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/auth/me", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      displayCurrency: user.displayCurrency === "USD" ? "USD" : "IDR",
    },
  });
});

app.patch("/api/user/preferences", requireAuth, async (req, res) => {
  try {
    const ccy = req.body.displayCurrency === "USD" ? "USD" : "IDR";
    await prisma.user.update({
      where: { id: req.session.userId },
      data: { displayCurrency: ccy },
    });
    res.json({ ok: true, displayCurrency: ccy });
  } catch (e) {
    res.status(500).json({ error: e.message || "Gagal menyimpan." });
  }
});

app.get("/api/transaction-months", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const txs = await prisma.transaction.findMany({
      where: { userId },
      select: { date: true },
      take: 8000,
    });
    const set = new Set();
    for (const t of txs) {
      const d = new Date(t.date);
      const ym = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
      set.add(ym);
    }
    res.json({ months: [...set].sort() });
  } catch (e) {
    res.status(500).json({ error: e.message || "Gagal." });
  }
});

app.post("/api/register", async (req, res) => {
  try {
    const email = typeof req.body.email === "string" ? req.body.email.toLowerCase().trim() : "";
    const password = req.body.password;
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Email tidak valid." });
    }
    if (!password || String(password).length < 8) {
      return res.status(400).json({ error: "Password minimal 8 karakter." });
    }
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      return res.status(409).json({ error: "Email sudah terdaftar." });
    }
    const passwordHash = await bcrypt.hash(String(password), 10);
    const user = await prisma.user.create({
      data: {
        email,
        name: name || email.split("@")[0],
        passwordHash,
      },
    });
    await createDefaultWalletsAndCategories(user.id);
    res.json({ ok: true, email: user.email });
  } catch (e) {
    res.status(500).json({ error: e.message || "Gagal mendaftar." });
  }
});

app.post("/api/upload", requireAuth, upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "File tidak ada." });
  }
  res.json({ url: "/uploads/" + req.file.filename });
});

// ——— Data ———
app.get("/api/transactions", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const period = req.query.period || "thisMonth";
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const walletId = typeof req.query.walletId === "string" ? req.query.walletId : "";

    const dateWhere = period === "all" ? null : periodDateFilter(period);

    const where = {
      userId,
      ...(dateWhere ? { date: dateWhere } : {}),
      ...(walletId ? { walletId } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q } },
              { counterparty: { contains: q } },
              { relatedParty: { contains: q } },
              { category: { name: { contains: q } } },
            ],
          }
        : {}),
    };

    const rows = await prisma.transaction.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: { category: true, wallet: true },
    });

    const list = rows.map(function (t) {
      const base = transactionToJson(t);
      const d = getWalletDelta(t.category, t.amount);
      return Object.assign(base, {
        categoryName: t.category.name,
        categoryIcon: t.category.icon,
        debtSubtype: t.category.debtSubtype || null,
        walletName: t.wallet.name,
        walletFlag: t.wallet.flag,
        walletLogo: t.wallet.logo || null,
        direction: d >= 0 ? "in" : "out",
      });
    });

    res.json({ transactions: list });
  } catch (e) {
    res.status(500).json({ error: e.message || "Gagal memuat transaksi." });
  }
});

app.post("/api/transactions", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
    const amount = Number(req.body.amount);
    const categoryId = req.body.categoryId;
    const walletId = req.body.walletId;
    const u = await prisma.user.findUnique({where:{id:userId}});
    const currency = u.displayCurrency || "IDR";
    const counterparty =
      typeof req.body.counterparty === "string" ? req.body.counterparty.trim() : null;
    const relatedParty = typeof req.body.relatedParty === "string" ? req.body.relatedParty.trim() : null;
    const imageUrl = typeof req.body.imageUrl === "string" ? req.body.imageUrl.trim() : null;

    if (!title || !Number.isFinite(amount) || amount <= 0 || !categoryId || !walletId) {
      return res.status(400).json({ error: "Data tidak valid." });
    }

    const [category, wallet] = await Promise.all([
      prisma.category.findFirst({ where: { id: categoryId, userId } }),
      prisma.wallet.findFirst({ where: { id: walletId, userId } }),
    ]);

    if (!category) {
      return res.status(400).json({ error: "Kategori tidak ditemukan." });
    }
    if (!wallet) {
      return res.status(400).json({ error: "Dompet tidak ditemukan." });
    }
    if (wallet.currency !== currency) {
      return res.status(400).json({ error: "Mata uang tidak cocok dengan dompet." });
    }

    if (category.type === "debt") {
      if (!counterparty) {
        return res.status(400).json({ error: "Isi pihak (peminjam / pemberi pinjaman)." });
      }
      if (!category.debtSubtype) {
        return res.status(400).json({ error: "Subtipe hutang kategori belum diatur." });
      }
    }

    const dateStr = req.body.date || new Date().toISOString().slice(0, 10);
    const date = new Date(dateStr + "T12:00:00.000Z");

    const status = req.body.status === "pending" ? "pending" : "success";

    let created;
    if (status === "success") {
      const delta = getWalletDelta(category, amount);
      const nextBalance = wallet.balance + delta;

      if (nextBalance < 0) {
        return res.status(400).json({ error: "Saldo dompet tidak mencukupi." });
      }

      created = await prisma.$transaction(async (tx) => {
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: nextBalance },
        });
        return tx.transaction.create({
          data: {
            userId,
            walletId: wallet.id,
            categoryId: category.id,
            amount,
            type: category.type,
            title,
            date,
            status: "success",
            currency,
            counterparty,
            relatedParty,
            imageUrl: imageUrl || null,
            remainingAmount: (category.type === "debt" && (category.debtSubtype === "DEBT" || category.debtSubtype === "LOAN")) ? amount : null,
          },
        });
      });
    } else {
      created = await prisma.transaction.create({
        data: {
          userId,
          walletId: wallet.id,
          categoryId: category.id,
          amount,
          type: category.type,
          title,
          date,
          status: "pending",
          currency,
          counterparty,
          relatedParty,
          imageUrl: imageUrl || null,
          remainingAmount: (category.type === "debt" && (category.debtSubtype === "DEBT" || category.debtSubtype === "LOAN")) ? amount : null,
        },
      });
    }

    const full = await prisma.transaction.findFirst({
      where: { id: created.id },
      include: { category: true, wallet: true },
    });
    const base = transactionToJson(full);
    const d = getWalletDelta(full.category, full.amount);
    res.status(201).json({
      transaction: Object.assign(base, {
        categoryName: full.category.name,
        walletName: full.wallet.name,
        direction: d >= 0 ? "in" : "out",
      }),
    });
  } catch (e) {
    res.status(500).json({ error: e.message || "Gagal menyimpan." });
  }
});

app.get("/api/reports", requireAuth, async (req, res) => {
  try {
    const from = typeof req.query.from === "string" ? req.query.from.trim() : "";
    const to = typeof req.query.to === "string" ? req.query.to.trim() : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return res.status(400).json({ error: "Parameter from dan to wajib (YYYY-MM-DD)." });
    }
    const data = await getReportData(req.session.userId, from, to);
    if (!data) {
      return res.status(400).json({ error: "Rentang tanggal tidak valid." });
    }
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message || "Gagal laporan." });
  }
});

app.get("/api/liabilities", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    // Get all unpaid debt transactions
    const txs = await prisma.transaction.findMany({
      where: {
        userId,
        type: "debt",
        paidOff: false,
        status: "success",
      },
      include: { category: true, wallet: true },
      orderBy: { date: "desc" },
    });

    // Grouping by debtSubtype for easier frontend consumption
    const debts = txs.filter(t => t.category.debtSubtype === "DEBT");
    const loans = txs.filter(t => t.category.debtSubtype === "LOAN");

    res.json({ debts, loans });
  } catch (e) {
    res.status(500).json({ error: e.message || "Gagal memuat data liabilitas." });
  }
});

app.get("/api/transactions/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const t = await prisma.transaction.findFirst({
      where: { id: req.params.id, userId },
      include: { category: true, wallet: true },
    });
    if (!t) {
      return res.status(404).json({ error: "Tidak ditemukan." });
    }
    const base = transactionToJson(t);
    const d = getWalletDelta(t.category, t.amount);
    res.json({
      transaction: Object.assign(base, {
        categoryName: t.category.name,
        categoryType: t.category.type,
        debtSubtype: t.category.debtSubtype,
        walletName: t.wallet.name,
        direction: d >= 0 ? "in" : "out",
      }),
    });
  } catch (e) {
    res.status(500).json({ error: e.message || "Gagal memuat." });
  }
});

// ——— Payment for DEBT/LOAN ———
app.post("/api/transactions/:id/payment", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const parentTx = await prisma.transaction.findFirst({
      where: { id: req.params.id, userId },
      include: { category: true, wallet: true },
    });
    if (!parentTx) {
      return res.status(404).json({ error: "Transaksi tidak ditemukan." });
    }

    const ds = parentTx.category.debtSubtype;
    if (ds !== "DEBT" && ds !== "LOAN") {
      return res.status(400).json({ error: "Hanya transaksi DEBT atau LOAN yang bisa dibayar." });
    }
    if (parentTx.paidOff) {
      return res.status(400).json({ error: "Transaksi sudah lunas." });
    }

    const payAmount = Number(req.body.amount);
    const dateStr = typeof req.body.date === "string" ? req.body.date.trim() : new Date().toISOString().slice(0, 10);
    const walletId = typeof req.body.walletId === "string" ? req.body.walletId : parentTx.walletId;

    if (!Number.isFinite(payAmount) || payAmount <= 0) {
      return res.status(400).json({ error: "Jumlah pembayaran tidak valid." });
    }

    const remaining = parentTx.remainingAmount != null ? parentTx.remainingAmount : parentTx.amount;
    if (payAmount > remaining) {
      return res.status(400).json({ error: "Jumlah melebihi sisa hutang/pinjaman (sisa: " + remaining + ")." });
    }

    const wallet = await prisma.wallet.findFirst({ where: { id: walletId, userId } });
    if (!wallet) {
      return res.status(400).json({ error: "Dompet tidak ditemukan." });
    }

    // Determine child category: DEBT→REPAYMENT, LOAN→DEBT_COLLECTION
    const childSubtype = ds === "DEBT" ? "REPAYMENT" : "DEBT_COLLECTION";
    const childCategory = await prisma.category.findFirst({
      where: { userId, type: "debt", debtSubtype: childSubtype },
    });
    if (!childCategory) {
      return res.status(400).json({ error: "Kategori " + childSubtype + " tidak ditemukan." });
    }

    const date = new Date(dateStr + "T12:00:00.000Z");
    const newRemaining = remaining - payAmount;
    const isPaidOff = newRemaining === 0;

    // Build child title with suffix
    const childSuffix = childSubtype === "REPAYMENT" ? " ke " : " dari ";
    const childTitle = childCategory.name + childSuffix + (parentTx.counterparty || "");

    const childDelta = getWalletDelta(childCategory, payAmount);
    const newBal = wallet.balance + childDelta;
    if (newBal < 0) {
      return res.status(400).json({ error: "Saldo dompet tidak mencukupi." });
    }

    await prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: newBal },
      });
      await tx.transaction.create({
        data: {
          userId,
          walletId: wallet.id,
          categoryId: childCategory.id,
          amount: payAmount,
          type: "debt",
          title: childTitle,
          date,
          status: "success",
          currency: parentTx.currency,
          counterparty: parentTx.counterparty,
          parentTransactionId: parentTx.id,
        },
      });
      await tx.transaction.update({
        where: { id: parentTx.id },
        data: {
          remainingAmount: newRemaining,
          paidOff: isPaidOff,
        },
      });
    });

    res.json({ ok: true, remainingAmount: newRemaining, paidOff: isPaidOff });
  } catch (e) {
    const msg = e.message || "Gagal membayar.";
    res.status(msg.includes("Saldo") ? 400 : 500).json({ error: msg });
  }
});

app.patch("/api/transactions/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const id = req.params.id;
    const oldT = await prisma.transaction.findFirst({
      where: { id, userId },
      include: { category: true, wallet: true },
    });
    if (!oldT) {
      return res.status(404).json({ error: "Tidak ditemukan." });
    }

    const title =
      typeof req.body.title === "string" ? req.body.title.trim() : oldT.title;
    const amount = req.body.amount !== undefined ? Number(req.body.amount) : oldT.amount;
    const categoryId = typeof req.body.categoryId === "string" ? req.body.categoryId : oldT.categoryId;
    const walletId = typeof req.body.walletId === "string" ? req.body.walletId : oldT.walletId;
    const u = await prisma.user.findUnique({where:{id:userId}});
    const currency = u.displayCurrency || "IDR";
    const counterparty =
      req.body.counterparty !== undefined
        ? typeof req.body.counterparty === "string"
          ? req.body.counterparty.trim() || null
          : null
        : oldT.counterparty;
    const relatedParty =
      req.body.relatedParty !== undefined
        ? typeof req.body.relatedParty === "string"
          ? req.body.relatedParty.trim() || null
          : null
        : oldT.relatedParty;
    const imageUrl =
      req.body.imageUrl !== undefined
        ? typeof req.body.imageUrl === "string"
          ? req.body.imageUrl.trim() || null
          : null
        : oldT.imageUrl;
    const dateStr =
      typeof req.body.date === "string" ? req.body.date.trim() : oldT.date.toISOString().slice(0, 10);
    const status =
      req.body.status === "pending" ? "pending" : req.body.status === "success" ? "success" : oldT.status;

    if (!title || !Number.isFinite(amount) || amount <= 0 || !categoryId || !walletId) {
      return res.status(400).json({ error: "Data tidak valid." });
    }

    const [category, wallet] = await Promise.all([
      prisma.category.findFirst({ where: { id: categoryId, userId } }),
      prisma.wallet.findFirst({ where: { id: walletId, userId } }),
    ]);

    if (!category) {
      return res.status(400).json({ error: "Kategori tidak ditemukan." });
    }
    if (!wallet) {
      return res.status(400).json({ error: "Dompet tidak ditemukan." });
    }
    if (wallet.currency !== currency) {
      return res.status(400).json({ error: "Mata uang tidak cocok dengan dompet." });
    }

    if (category.type === "debt") {
      if (!counterparty) {
        return res.status(400).json({ error: "Isi pihak (peminjam / pemberi pinjaman)." });
      }
      if (!category.debtSubtype) {
        return res.status(400).json({ error: "Subtipe hutang kategori belum diatur." });
      }
    }

    const date = new Date(dateStr + "T12:00:00.000Z");
    const oldDelta = getWalletDelta(oldT.category, oldT.amount);
    const newDelta = getWalletDelta(category, amount);
    const oldApplied = oldT.status === "success";
    const newApplied = status === "success";

    await prisma.$transaction(async (tx) => {
      if (walletId === oldT.walletId) {
        const undo = oldApplied ? oldDelta : 0;
        const apply = newApplied ? newDelta : 0;
        const newBal = oldT.wallet.balance - undo + apply;
        if (newBal < 0) {
          throw new Error("Saldo dompet tidak mencukupi.");
        }
        await tx.wallet.update({
          where: { id: walletId },
          data: { balance: newBal },
        });
      } else {
        const wOld = await tx.wallet.findUnique({ where: { id: oldT.walletId } });
        const wNew = await tx.wallet.findUnique({ where: { id: walletId } });
        const balOld = wOld.balance - (oldApplied ? oldDelta : 0);
        const balNew = wNew.balance + (newApplied ? newDelta : 0);
        if (balOld < 0 || balNew < 0) {
          throw new Error("Saldo dompet tidak mencukupi.");
        }
        await tx.wallet.update({ where: { id: oldT.walletId }, data: { balance: balOld } });
        await tx.wallet.update({ where: { id: walletId }, data: { balance: balNew } });
      }

      await tx.transaction.update({
        where: { id },
        data: {
          walletId,
          categoryId: category.id,
          amount,
          type: category.type,
          title,
          date,
          status,
          currency,
          counterparty,
          relatedParty,
          imageUrl,
        },
      });
    });

    const full = await prisma.transaction.findFirst({
      where: { id },
      include: { category: true, wallet: true },
    });
    const base = transactionToJson(full);
    const d = getWalletDelta(full.category, full.amount);
    res.json({
      transaction: Object.assign(base, {
        categoryName: full.category.name,
        walletName: full.wallet.name,
        direction: d >= 0 ? "in" : "out",
      }),
    });
  } catch (e) {
    const msg = e.message || "Gagal memperbarui.";
    res.status(msg.includes("Saldo") ? 400 : 500).json({ error: msg });
  }
});

app.delete("/api/transactions/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const id = req.params.id;
    const t = await prisma.transaction.findFirst({
      where: { id, userId },
      include: { category: true, wallet: true },
    });
    if (!t) {
      return res.status(404).json({ error: "Tidak ditemukan." });
    }
    await prisma.$transaction(async (tx) => {
      if (t.status === "success") {
        const delta = getWalletDelta(t.category, t.amount);
        const newBal = t.wallet.balance - delta;
        if (newBal < 0) {
          throw new Error("Saldo tidak konsisten; hubungi dukungan.");
        }
        await tx.wallet.update({
          where: { id: t.walletId },
          data: { balance: newBal },
        });
      }
      await tx.transaction.delete({ where: { id: t.id } });
    });
    res.json({ ok: true });
  } catch (e) {
    const msg = e.message || "Gagal menghapus.";
    res.status(msg.includes("Saldo") ? 400 : 500).json({ error: msg });
  }
});

app.get("/api/wallets", requireAuth, async (req, res) => {
  try {
    const rows = await prisma.wallet.findMany({
      where: { userId: req.session.userId },
      orderBy: { name: "asc" },
    });
    res.json({ wallets: rows.map(walletToJson) });
  } catch (e) {
    res.status(500).json({ error: e.message || "Gagal memuat dompet." });
  }
});

app.post("/api/wallets", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const u = await prisma.user.findUnique({where:{id:userId}});
    const currency = u.displayCurrency || "IDR";
    const flag = typeof req.body.flag === "string" ? req.body.flag : currency === "USD" ? "🇺🇸" : "🇮🇩";
    const logo = typeof req.body.logo === "string" ? req.body.logo.trim() : null;
    const balance = Number(req.body.balance);
    if (!name) {
      return res.status(400).json({ error: "Nama dompet wajib." });
    }
    const bal = Number.isFinite(balance) && balance >= 0 ? Math.round(balance) : 0;
    const w = await prisma.wallet.create({
      data: { userId, name, currency, balance: bal, active: true, flag, logo },
    });
    res.status(201).json({ wallet: walletToJson(w) });
  } catch (e) {
    res.status(500).json({ error: e.message || "Gagal membuat dompet." });
  }
});

app.patch("/api/wallets/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const id = req.params.id;
    const w0 = await prisma.wallet.findFirst({ where: { id, userId } });
    if (!w0) {
      return res.status(404).json({ error: "Dompet tidak ditemukan." });
    }
    const data = {};
    if (typeof req.body.name === "string") data.name = req.body.name.trim();
    if (typeof req.body.flag === "string") data.flag = req.body.flag;
    if (typeof req.body.logo === "string") data.logo = req.body.logo.trim() || null;
    if (typeof req.body.active === "boolean") data.active = req.body.active;
    if (req.body.balance !== undefined) {
      const b = Number(req.body.balance);
      if (Number.isFinite(b) && b >= 0) data.balance = Math.round(b);
    }
    const w = await prisma.wallet.update({ where: { id }, data });
    res.json({ wallet: walletToJson(w) });
  } catch (e) {
    res.status(500).json({ error: e.message || "Gagal memperbarui dompet." });
  }
});

app.delete("/api/wallets/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const id = req.params.id;
    const w = await prisma.wallet.findFirst({ where: { id, userId } });
    if (!w) {
      return res.status(404).json({ error: "Dompet tidak ditemukan." });
    }
    await prisma.wallet.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || "Gagal menghapus dompet." });
  }
});

app.get("/api/category-parents", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const rows = await prisma.categoryParent.findMany({
      where: {
        OR: [{ userId: null }, { userId }],
      },
      orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    });
    res.json({ parents: rows.map(categoryParentToJson) });
  } catch (e) {
    res.status(500).json({ error: e.message || "Gagal memuat induk kategori." });
  }
});

app.post("/api/category-parents", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const kind = req.body.kind === "income" || req.body.kind === "debt" ? req.body.kind : "expense";
    if (!name) {
      return res.status(400).json({ error: "Nama induk wajib." });
    }
    const maxSort = await prisma.categoryParent.aggregate({
      where: { userId, kind },
      _max: { sortOrder: true },
    });
    const sortOrder = (maxSort._max.sortOrder ?? 0) + 1;
    const p = await prisma.categoryParent.create({
      data: { userId, name, kind, sortOrder },
    });
    res.status(201).json({ parent: categoryParentToJson(p) });
  } catch (e) {
    res.status(500).json({ error: e.message || "Gagal membuat induk." });
  }
});

app.delete("/api/category-parents/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const id = req.params.id;
    const p = await prisma.categoryParent.findFirst({ where: { id, userId } });
    if (!p) {
      return res.status(404).json({ error: "Tidak ditemukan atau preset sistem." });
    }
    const n = await prisma.category.count({ where: { parentId: id } });
    if (n > 0) {
      return res.status(400).json({ error: "Hapus kategori anak terlebih dahulu." });
    }
    const nb = await prisma.budget.count({ where: { targetKind: "PARENT", targetId: id } });
    if (nb > 0) {
      return res.status(400).json({ error: "Budget masih memakai induk ini." });
    }
    await prisma.categoryParent.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || "Gagal menghapus." });
  }
});

app.get("/api/categories", requireAuth, async (req, res) => {
  try {
    const rows = await prisma.category.findMany({
      where: { userId: req.session.userId },
      orderBy: { name: "asc" },
      include: { parent: true },
    });
    res.json({ categories: rows.map(categoryToJson) });
  } catch (e) {
    res.status(500).json({ error: e.message || "Gagal memuat kategori." });
  }
});

app.post("/api/categories", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const type = req.body.type === "income" || req.body.type === "debt" ? req.body.type : "expense";
    const icon = typeof req.body.icon === "string" ? req.body.icon.trim() : "dot";
    const parentId = typeof req.body.parentId === "string" ? req.body.parentId : null;
    const debtSubtype =
      typeof req.body.debtSubtype === "string" ? req.body.debtSubtype.trim().toUpperCase() : null;

    if (!name) {
      return res.status(400).json({ error: "Nama kategori wajib." });
    }
    const allowedDebt = ["DEBT", "REPAYMENT", "LOAN", "DEBT_COLLECTION"];
    if (type === "debt") {
      if (!debtSubtype || !allowedDebt.includes(debtSubtype)) {
        return res.status(400).json({ error: "Subtipe hutang tidak valid." });
      }
    }
    if (type !== "debt" && debtSubtype) {
      return res.status(400).json({ error: "Subtipe hanya untuk hutang/pinjaman." });
    }

    if (parentId) {
      const parent = await prisma.categoryParent.findFirst({
        where: { id: parentId, OR: [{ userId: null }, { userId }] },
      });
      if (!parent || parent.kind !== type) {
        return res.status(400).json({ error: "Induk kategori tidak cocok dengan jenis." });
      }
    }

    const c = await prisma.category.create({
      data: {
        userId,
        name,
        type,
        icon,
        parentId,
        debtSubtype: type === "debt" ? debtSubtype : null,
      },
      include: { parent: true },
    });
    res.status(201).json({ category: categoryToJson(c) });
  } catch (e) {
    res.status(500).json({ error: e.message || "Gagal membuat kategori." });
  }
});

app.delete("/api/categories/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const id = req.params.id;
    const c = await prisma.category.findFirst({ where: { id, userId } });
    if (!c) {
      return res.status(404).json({ error: "Kategori tidak ditemukan." });
    }
    const n = await prisma.transaction.count({ where: { categoryId: id } });
    if (n > 0) {
      return res.status(400).json({ error: "Kategori masih dipakai transaksi." });
    }
    await prisma.budget.deleteMany({
      where: { userId, targetKind: "CATEGORY", targetId: id },
    });
    await prisma.category.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || "Gagal menghapus." });
  }
});

app.get("/api/summary", requireAuth, async (req, res) => {
  try {
    const s = await getFinancialSummary(req.session.userId);
    res.json(s);
  } catch (e) {
    res.status(500).json({ error: e.message || "Gagal ringkasan." });
  }
});

app.get("/api/monthly-income", requireAuth, async (req, res) => {
  try {
    const data = await getMonthlyIncomeSeries(req.session.userId);
    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: e.message || "Gagal data grafik." });
  }
});

app.get("/api/budgets", requireAuth, async (req, res) => {
  try {
    const now = new Date();
    const year = req.query.year ? Number(req.query.year) : now.getFullYear();
    const month = req.query.month ? Number(req.query.month) : now.getMonth() + 1;
    const rows = await getBudgetRowsForMonth(req.session.userId, year, month);
    const summary = await getBudgetMonthSummary(req.session.userId, year, month);
    res.json({ budgets: rows, summary });
  } catch (e) {
    res.status(500).json({ error: e.message || "Gagal budget." });
  }
});

app.post("/api/budgets", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const limitAmount = Number(req.body.limitAmount);
    const targetKind = req.body.targetKind === "PARENT" ? "PARENT" : "CATEGORY";
    const targetId = typeof req.body.targetId === "string" ? req.body.targetId : "";
    const periodStartRaw = typeof req.body.periodStart === "string" ? req.body.periodStart.trim() : "";
    const periodEndRaw = typeof req.body.periodEnd === "string" ? req.body.periodEnd.trim() : "";
    const useCustom = Boolean(periodStartRaw && periodEndRaw);

    if (!targetId || !Number.isFinite(limitAmount) || limitAmount <= 0) {
      return res.status(400).json({ error: "Data budget tidak valid." });
    }

    let year = null;
    let month = null;
    let periodStart = null;
    let periodEnd = null;

    if (useCustom) {
      periodStart = new Date(periodStartRaw + "T12:00:00.000Z");
      periodEnd = new Date(periodEndRaw + "T12:00:00.000Z");
      if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime()) || periodEnd < periodStart) {
        return res.status(400).json({ error: "Rentang tanggal tidak valid." });
      }
    } else {
      year = Number(req.body.year);
      month = Number(req.body.month);
      if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
        return res.status(400).json({ error: "Tahun dan bulan wajib untuk budget bulanan." });
      }
    }

    if (targetKind === "CATEGORY") {
      const c = await prisma.category.findFirst({ where: { id: targetId, userId } });
      if (!c) {
        return res.status(400).json({ error: "Kategori tidak ditemukan." });
      }
    } else {
      const p = await prisma.categoryParent.findFirst({
        where: { id: targetId, OR: [{ userId: null }, { userId }] },
      });
      if (!p || p.kind !== "expense") {
        return res.status(400).json({ error: "Induk harus grup pengeluaran." });
      }
    }

    if (!useCustom) {
      const dup = await prisma.budget.findFirst({
        where: {
          userId,
          targetKind,
          targetId,
          year,
          month,
          periodStart: null,
          periodEnd: null,
        },
      });
      if (dup) {
        return res.status(409).json({ error: "Budget bulanan untuk target ini sudah ada." });
      }
    }

    const b = await prisma.budget.create({
      data: {
        userId,
        year: useCustom ? null : year,
        month: useCustom ? null : month,
        periodStart: useCustom ? periodStart : null,
        periodEnd: useCustom ? periodEnd : null,
        limitAmount,
        targetKind,
        targetId,
      },
    });
    res.status(201).json({ id: b.id });
  } catch (e) {
    res.status(500).json({ error: e.message || "Gagal menyimpan budget." });
  }
});

app.patch("/api/budgets/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const id = req.params.id;
    const b = await prisma.budget.findFirst({ where: { id, userId } });
    if (!b) {
      return res.status(404).json({ error: "Tidak ditemukan." });
    }
    const data = {};
    if (req.body.limitAmount != null) {
      const limit = Number(req.body.limitAmount);
      if (!Number.isFinite(limit) || limit <= 0) {
        return res.status(400).json({ error: "Limit harus lebih dari 0." });
      }
      data.limitAmount = limit;
    }
    const updated = await prisma.budget.update({ where: { id }, data });
    res.json({ ok: true, id: updated.id });
  } catch (e) {
    res.status(500).json({ error: e.message || "Gagal memperbarui budget." });
  }
});

app.delete("/api/budgets/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const id = req.params.id;
    const b = await prisma.budget.findFirst({ where: { id, userId } });
    if (!b) {
      return res.status(404).json({ error: "Tidak ditemukan." });
    }
    await prisma.budget.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || "Gagal menghapus." });
  }
});

app.get("/api/admin/me", async (req, res) => {
  if (!req.session.userId) {
    return res.json({ admin: false });
  }
  const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
  res.json({ admin: isAdminEmail(user?.email) });
});

app.get("/api/admin/users", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
  if (!isAdminEmail(user?.email)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        _count: { select: { wallets: true, transactions: true, categories: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ users });
  } catch (e) {
    res.status(500).json({ error: e.message || "Gagal." });
  }
});

app.use("/uploads", express.static(storageUploadDir));
app.use(express.static(publicDir, { index: false }));

function sendPage(name) {
  return (req, res) => res.sendFile(path.join(publicDir, name));
}

app.get("/", (req, res) => res.redirect("/login"));
app.get("/demo", sendPage("demo.html"));
app.get("/login", sendPage("login.html"));
app.get("/register", sendPage("register.html"));
app.get("/dashboard", sendPage("dashboard.html"));
app.get("/transactions", sendPage("transactions.html"));
app.get("/transactions/new", sendPage("transaction-new.html"));
app.get("/transactions/edit", sendPage("transaction-edit.html"));
app.get("/budgets", sendPage("budgets.html"));
app.get("/transactions/category", sendPage("transaction-category.html"));
app.get("/reports", sendPage("reports.html"));
app.get("/liabilities", sendPage("liabilities.html"));
app.get("/wallets", sendPage("wallets.html"));
app.get("/wallets/assets", sendPage("wallet-assets.html"));
app.get("/settings", sendPage("settings.html"));
app.get("/settings/currency", sendPage("settings-currency.html"));
app.get("/settings/appearance", sendPage("settings-appearance.html"));
app.get("/settings/profile", sendPage("settings-profile.html"));
app.get("/settings/categories", sendPage("settings-categories.html"));
app.get("/admin/users", sendPage("admin-users.html"));

app.use((req, res) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ error: "Not found" });
  }
  res.status(404).type("text/plain").send("Not found");
});

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ error: "Internal server error" });
});

const server = app.listen(PORT, () => {
  console.log(`Monify: http://localhost:${PORT}`);
});

module.exports = app;

function shutdown(signal) {
  console.log(signal + ": shutting down…");
  server.close(() => {
    prisma.$disconnect().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10000);
}

["SIGINT", "SIGTERM"].forEach(function (sig) {
  process.on(sig, function () {
    shutdown(sig);
  });
});
