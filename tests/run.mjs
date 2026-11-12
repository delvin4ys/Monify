/**
 * Test runner: menyalakan Postgres lokal sementara, menerapkan seluruh migrasi,
 * menjalankan test, lalu mematikan dan menghapus database itu.
 *
 *   npm test                       -> semua test
 *   npm test -- tests/debts.test.js -> satu file
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { startDb, databaseUrl, freePort } from "../scripts/dev-db.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "monify-test-"));
const port = Number(process.env.TEST_PG_PORT) || (await freePort());

const db = await startDb({ dir, port, database: "monify_test" });
// Hentikan Postgres juga bila runner diinterupsi (Ctrl+C, pipa tertutup).
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, async () => {
    await db.stop();
    process.exit(130);
  });
}
let code = 1;
try {
  const env = {
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: db.url,
    TEST_PG_ADMIN_URL: databaseUrl({ ...db.config, database: "postgres" }),
    AUTH_SECRET: "test-secret-test-secret-test-secret-0123",
    ADMIN_EMAILS: "admin@monify.test",
    SUPABASE_URL: "",
    SUPABASE_ANON_KEY: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    ANTHROPIC_API_KEY: "",
    RESEND_API_KEY: "",
  };
  const prisma = path.join(root, "node_modules", "prisma", "build", "index.js");
  // Client Prisma harus selalu cocok dengan schema.prisma yang sedang diuji.
  const gen = spawnSync(process.execPath, [prisma, "generate"], { cwd: root, env, encoding: "utf8" });
  if (gen.status !== 0) {
    // Di Windows, engine Prisma terkunci bila server dev sedang berjalan. Client yang ada
    // tetap dipakai (dev server sudah men-generate-nya dari skema yang sama).
    if (/EPERM/.test(gen.stdout + gen.stderr)) console.warn("prisma generate dilewati: engine sedang dipakai proses lain (mis. npm run dev).");
    else {
      console.error(gen.stdout, gen.stderr);
      throw new Error("prisma generate gagal");
    }
  }
  const mig = spawnSync(process.execPath, [prisma, "migrate", "deploy"], { cwd: root, env, encoding: "utf8" });
  if (mig.status !== 0) {
    console.error(mig.stdout, mig.stderr);
    throw new Error("prisma migrate deploy gagal");
  }
  const files = process.argv.slice(2);
  const targets = files.length ? files : fs.readdirSync(path.join(root, "tests")).filter((f) => f.endsWith(".test.js")).sort().map((f) => path.join("tests", f));
  const run = spawnSync(process.execPath, ["--test", "--test-concurrency=1", ...targets], { cwd: root, env, stdio: "inherit" });
  code = run.status ?? 1;
} finally {
  await db.stop();
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  } catch {
    /* folder sementara; dibersihkan OS */
  }
}
process.exit(code);
