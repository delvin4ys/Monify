const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { prisma } = require("../lib/prisma");
const { config } = require("../config");
const { AppError, badRequest, conflict, unauthorized } = require("../lib/errors");
const S = require("../lib/serializers");
const categories = require("./categories");
const audit = require("./audit");
const mailer = require("./mailer");

const BCRYPT_COST = config.isTest ? 4 : 12;
const RESET_TTL_MS = 60 * 60 * 1000;
// Hash tiruan supaya waktu respons login sama untuk email terdaftar dan tidak terdaftar.
const DUMMY_HASH = bcrypt.hashSync("monify-timing-equaliser", BCRYPT_COST);

const isAdmin = (email) => Boolean(email) && config.adminEmails.includes(String(email).toLowerCase());
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

async function register({ email, password, name }) {
  const exists = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (exists) throw conflict("Email sudah terdaftar.", "EMAIL_TAKEN");
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  await categories.ensureSystemParents();
  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email, name: name || email.split("@")[0], passwordHash } });
      await categories.createDefaults(tx, user.id);
      await audit.record(tx, user.id, "auth.register", "User", user.id);
      return user;
    });
  } catch (e) {
    if (e && e.code === "P2002") throw conflict("Email sudah terdaftar.", "EMAIL_TAKEN");
    throw e;
  }
}

async function verifyLogin({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await bcrypt.compare(String(password), user && user.passwordHash ? user.passwordHash : DUMMY_HASH);
  if (!user || !user.passwordHash || !ok) throw new AppError(401, "INVALID_CREDENTIALS", "Email atau password salah.");
  return user;
}

async function getProfile(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw unauthorized();
  return S.user(user, { isAdmin: isAdmin(user.email) });
}

async function updateProfile(userId, input) {
  const data = {};
  for (const k of ["name", "displayCurrency", "dateFormat", "numberFormat", "theme"]) {
    if (input[k] != null) data[k] = input[k];
  }
  if (input.defaultWalletId !== undefined) {
    if (input.defaultWalletId) {
      const w = await prisma.wallet.findFirst({ where: { id: input.defaultWalletId, userId } });
      if (!w) throw badRequest("Dompet tidak ditemukan.", { defaultWalletId: "Pilih dompet." });
    }
    data.defaultWalletId = input.defaultWalletId || null;
  }
  if (input.aiConsent !== undefined) data.aiConsentAt = input.aiConsent ? new Date() : null;
  const user = await prisma.user.update({ where: { id: userId }, data });
  return S.user(user, { isAdmin: isAdmin(user.email) });
}

async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const ok = user && user.passwordHash && (await bcrypt.compare(String(currentPassword || ""), user.passwordHash));
  if (!ok) throw badRequest("Password saat ini salah.", { currentPassword: "Password salah." }, "INVALID_CREDENTIALS");
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(newPassword, BCRYPT_COST) } }),
    prisma.passwordResetToken.deleteMany({ where: { userId } }),
    prisma.auditLog.create({ data: { userId, action: "auth.password_change", entity: "User", entityId: userId } }),
  ]);
}

/**
 * Selalu berhasil dari sudut pandang pemanggil, agar tidak membocorkan
 * email mana yang terdaftar.
 * @returns {Promise<{ delivered: boolean, devLink?: string }>}
 */
async function requestPasswordReset(email, baseUrl) {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, name: true } });
  if (!user) return { delivered: false };
  const token = crypto.randomBytes(32).toString("base64url");
  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
    prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) } }),
  ]);
  const link = `${config.appUrl || baseUrl}/reset-password?token=${token}`;
  const sent = await mailer.send({
    to: user.email,
    subject: "Atur ulang password Monify",
    text: `Halo ${user.name || ""},\n\nBuka tautan berikut untuk mengatur ulang password (berlaku 60 menit):\n${link}\n\nAbaikan email ini bila kamu tidak memintanya.`,
  });
  // Di lingkungan non-produksi tanpa penyedia email, tautan ditampilkan di log server.
  if (!sent && !config.isProd) {
    if (!config.isTest) console.log("[dev] Tautan reset password:", link);
    return { delivered: false, devLink: link };
  }
  return { delivered: sent };
}

async function resetPassword({ token, password }) {
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(String(token || "")) } });
  if (!row || row.usedAt || row.expiresAt < new Date()) {
    throw badRequest("Tautan reset tidak valid atau sudah kedaluwarsa.", undefined, "INVALID_TOKEN");
  }
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  // Tandai terpakai dengan syarat usedAt masih null: token hanya bisa dipakai sekali.
  const used = await prisma.passwordResetToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (used.count === 0) throw badRequest("Tautan reset sudah dipakai.", undefined, "INVALID_TOKEN");
  await prisma.$transaction([
    prisma.user.update({ where: { id: row.userId }, data: { passwordHash } }),
    prisma.auditLog.create({ data: { userId: row.userId, action: "auth.password_reset", entity: "User", entityId: row.userId } }),
  ]);
  await destroySessions(row.userId, null);
  return row.userId;
}

/** Hapus sesi pengguna (kecuali `keepSid`). Data sesi disimpan sebagai JSON berisi userId. */
async function destroySessions(userId, keepSid) {
  const r = await prisma.session.deleteMany({
    where: { data: { contains: `"userId":"${userId}"` }, ...(keepSid ? { sid: { not: keepSid } } : {}) },
  });
  return r.count;
}

async function countSessions(userId) {
  return prisma.session.count({ where: { data: { contains: `"userId":"${userId}"` }, expiresAt: { gt: new Date() } } });
}

/**
 * Hapus akun dan seluruh datanya secara permanen. Mengembalikan kunci lampiran
 * agar file di penyimpanan ikut dihapus.
 */
async function deleteAccount(userId, password) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const ok = user && user.passwordHash && (await bcrypt.compare(String(password || ""), user.passwordHash));
  if (!ok) throw badRequest("Password salah.", { password: "Password salah." }, "INVALID_CREDENTIALS");
  const attachments = await prisma.transaction.findMany({ where: { userId, attachmentKey: { not: null } }, select: { attachmentKey: true } });
  await prisma.$transaction(async (tx) => {
    // Urutan mengikuti foreign key RESTRICT: mutasi dulu, baru dompet & kategori (cascade dari User).
    await tx.savingsEntry.deleteMany({ where: { userId } });
    await tx.debtPayment.deleteMany({ where: { userId } });
    await tx.transaction.deleteMany({ where: { userId } });
    await tx.transfer.deleteMany({ where: { userId } });
    await tx.user.delete({ where: { id: userId } });
  });
  await destroySessions(userId, null);
  return attachments.map((a) => a.attachmentKey);
}

async function listForAdmin({ take = 100, skip = 0 } = {}) {
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, email: true, name: true, createdAt: true, _count: { select: { wallets: true, transactions: true, categories: true } } },
      orderBy: { createdAt: "desc" },
      take: Math.min(take, 200),
      skip,
    }),
    prisma.user.count(),
  ]);
  return { users, total };
}

module.exports = { isAdmin, register, verifyLogin, getProfile, updateProfile, changePassword, requestPasswordReset, resetPassword, destroySessions, countSessions, deleteAccount, listForAdmin };
