/**
 * Monify — titik masuk server (lokal dan Vercel).
 * Seluruh logika ada di app.js, routes/, services/.
 */
const { config } = require("./config");
const { createApp } = require("./app");
const { prisma } = require("./lib/prisma");

const app = createApp();

if (!process.env.VERCEL && require.main === module) {
  const server = app.listen(config.port, () => {
    console.log(`Monify: http://localhost:${config.port}`);
  });

  const shutdown = (signal) => {
    console.log(signal + ": shutting down…");
    server.close(() => prisma.$disconnect().finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  ["SIGINT", "SIGTERM"].forEach((sig) => process.on(sig, () => shutdown(sig)));
}

module.exports = app;
