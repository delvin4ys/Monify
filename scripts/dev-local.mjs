/**
 * Lingkungan pengembangan satu perintah:
 *   npm run dev          -> Postgres lokal + migrasi + server (reload otomatis)
 *   npm run dev:seed     -> sama, ditambah akun & data demo
 *
 * Hanya memakai database lokal di .pgdata/. Variabel DATABASE_URL dari .env
 * sengaja DIABAIKAN di sini supaya perintah ini tidak pernah menyentuh
 * database lain.
 */
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { startDb } from "./dev-db.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const node = process.execPath;
const prisma = path.join(root, "node_modules", "prisma", "build", "index.js");
const port = Number(process.env.PORT) || 3000;

const db = await startDb({ dir: path.join(root, ".pgdata") });
const env = {
  ...process.env,
  DATABASE_URL: db.url,
  NODE_ENV: "development",
  PORT: String(port),
  AUTH_SECRET: process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 32 ? process.env.AUTH_SECRET : "local-development-secret-not-for-production-use",
  APP_URL: process.env.APP_URL || `http://localhost:${port}`,
};

function run(args, label) {
  const r = spawnSync(node, args, { cwd: root, env, stdio: "inherit" });
  if (r.status !== 0) throw new Error(label + " gagal");
}

let child = null;
let closing = false;
async function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  if (child && !child.killed) child.kill();
  await db.stop();
  process.exit(code);
}
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => shutdown(0));

try {
  run([prisma, "generate"], "prisma generate");
  run([prisma, "migrate", "deploy"], "prisma migrate deploy");
  if (process.argv.includes("--seed")) run([path.join(root, "scripts", "seed-demo.mjs")], "seed demo");
  console.log(`\nDatabase lokal: ${db.url}\n`);
  // --watch-path: hanya pantau kode server (bukan node_modules, yang memicu restart palsu di Windows)
  child = spawn(node, ["--watch-path=" + path.join(root, "server"), path.join(root, "server", "index.js")], { cwd: root, env, stdio: "inherit" });
  child.on("exit", (code) => shutdown(code ?? 0));
} catch (e) {
  console.error(e.message);
  await shutdown(1);
}
