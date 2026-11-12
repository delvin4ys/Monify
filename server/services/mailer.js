/**
 * Pengiriman email transaksional lewat Resend (HTTP API, tanpa dependency).
 * Bila RESEND_API_KEY / MAIL_FROM belum diisi, fungsi mengembalikan false dan
 * pemanggil menentukan fallback-nya — tidak pernah berpura-pura email terkirim.
 */
const { config } = require("../config");

const isConfigured = () => Boolean(config.mail.resendApiKey && config.mail.from);

async function send({ to, subject, text }) {
  if (!isConfigured()) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.mail.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: config.mail.from, to: [to], subject, text }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) console.error("[mailer] gagal mengirim email, status", res.status);
    return res.ok;
  } catch (e) {
    console.error("[mailer] gagal mengirim email:", e.message);
    return false;
  }
}

module.exports = { send, isConfigured };
