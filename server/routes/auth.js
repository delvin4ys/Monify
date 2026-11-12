const express = require("express");
const { h, ok } = require("../lib/errors");
const v = require("../lib/validate");
const { requireAuth, rateLimit } = require("../middleware/security");
const users = require("../services/users");
const storage = require("../services/storage");

const router = express.Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, key: (req) => `${req.ip}|${String((req.body && req.body.email) || "").toLowerCase()}` });
const signupLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10 });
const resetLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5 });

/** Buat sesi baru (ID sesi diganti) untuk mencegah session fixation. */
function startSession(req, user) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = user.id;
      req.session.touchedAt = Date.now();
      req.session.save((e) => (e ? reject(e) : resolve()));
    });
  });
}

router.post(
  "/auth/register",
  signupLimiter,
  h(async (req, res) => {
    const user = await users.register({
      email: v.email(req.body),
      password: v.password(req.body),
      name: v.str(req.body, "name", { required: false, min: 0, max: 80, label: "Nama" }),
    });
    await startSession(req, user);
    ok(res, { user: await users.getProfile(user.id) }, 201);
  })
);

router.post(
  "/auth/login",
  loginLimiter,
  h(async (req, res) => {
    const user = await users.verifyLogin({ email: v.email(req.body), password: v.str(req.body, "password", { max: 200, label: "Password" }) });
    await startSession(req, user);
    ok(res, { user: await users.getProfile(user.id) });
  })
);

router.post("/auth/logout", (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie("monify.sid");
    ok(res, {});
  });
});

router.get(
  "/auth/me",
  requireAuth,
  h(async (req, res) => ok(res, { user: await users.getProfile(req.userId) }))
);

router.post(
  "/auth/forgot",
  resetLimiter,
  h(async (req, res) => {
    const r = await users.requestPasswordReset(v.email(req.body), `${req.protocol}://${req.get("host")}`);
    // Respons sama untuk email terdaftar maupun tidak.
    ok(res, { message: "Bila email terdaftar, tautan reset password sudah dikirim.", ...(r.devLink ? { devLink: r.devLink } : {}) });
  })
);

router.post(
  "/auth/reset",
  resetLimiter,
  h(async (req, res) => {
    await users.resetPassword({ token: v.str(req.body, "token", { max: 200 }), password: v.password(req.body, "password", "Password baru") });
    ok(res, { message: "Password berhasil diubah. Silakan masuk." });
  })
);

router.post(
  "/auth/password",
  requireAuth,
  h(async (req, res) => {
    await users.changePassword(req.userId, {
      currentPassword: v.str(req.body, "currentPassword", { max: 200, label: "Password saat ini" }),
      newPassword: v.password(req.body, "newPassword", "Password baru"),
    });
    const ended = await users.destroySessions(req.userId, req.sessionID);
    ok(res, { endedSessions: ended });
  })
);

router.get(
  "/auth/sessions",
  requireAuth,
  h(async (req, res) => ok(res, { active: await users.countSessions(req.userId) }))
);

/** Keluar dari semua perangkat lain. */
router.delete(
  "/auth/sessions",
  requireAuth,
  h(async (req, res) => ok(res, { ended: await users.destroySessions(req.userId, req.sessionID) }))
);

router.patch(
  "/user",
  requireAuth,
  h(async (req, res) => {
    const b = req.body || {};
    const input = {
      name: v.str(b, "name", { required: false, min: 0, max: 80, label: "Nama" }),
      displayCurrency: v.oneOf(b, "displayCurrency", ["IDR", "USD"], { required: false }),
      dateFormat: v.oneOf(b, "dateFormat", ["DMY", "MDY", "YMD"], { required: false }),
      numberFormat: v.oneOf(b, "numberFormat", ["id-ID", "en-US"], { required: false }),
      theme: v.oneOf(b, "theme", ["dark", "light", "system"], { required: false }),
    };
    if (v.has(b, "defaultWalletId")) input.defaultWalletId = b.defaultWalletId ? v.id(b, "defaultWalletId") : null;
    if (typeof b.aiConsent === "boolean") input.aiConsent = b.aiConsent;
    ok(res, { user: await users.updateProfile(req.userId, input) });
  })
);

router.delete(
  "/account",
  requireAuth,
  h(async (req, res, next) => {
    const userId = req.userId;
    const keys = await users.deleteAccount(userId, v.str(req.body, "password", { max: 200, label: "Password" }));
    await storage.removeMany(userId, keys);
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie("monify.sid");
      ok(res, {});
    });
  })
);

router.get(
  "/admin/users",
  requireAuth,
  h(async (req, res) => {
    const me = await users.getProfile(req.userId);
    if (!me.isAdmin) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Khusus admin." } });
    ok(res, await users.listForAdmin({ skip: Number(req.query.skip) || 0 }));
  })
);

module.exports = router;
