/**
 * Postgres lokal tertanam untuk pengembangan dan test.
 * Tidak pernah menyentuh database produksi: selalu berjalan di 127.0.0.1
 * dengan data di folder yang di-ignore git.
 *
 *   npm run db:local        -> jalankan (data persisten di .pgdata/, port 54329)
 *
 * Dipakai juga sebagai modul oleh test (startDb dengan folder sementara).
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

export const DEV_DB = { port: 54329, user: "monify", password: "monify_local", database: "monify" };

export function databaseUrl({ port, user, password, database }) {
  // connection_limit kecil: query paralel mengantre di pool alih-alih membuka puluhan koneksi sekaligus
  // (pola yang sama dipakai di serverless + pgbouncer).
  return `postgresql://${user}:${password}@127.0.0.1:${port}/${database}?schema=public&connection_limit=8`;
}

/** Port TCP kosong pilihan sistem operasi. */
export function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function pgCtl() {
  try {
    const pkg = `@embedded-postgres/${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`;
    const dir = path.dirname(require.resolve(pkg + "/package.json"));
    const bin = path.join(dir, "native", "bin", process.platform === "win32" ? "pg_ctl.exe" : "pg_ctl");
    return fs.existsSync(bin) ? bin : null;
  } catch {
    return null;
  }
}

/**
 * @param {{ dir: string, port?: number, persistent?: boolean, database?: string }} opts
 */
export async function startDb(opts) {
  const cfg = {
    port: opts.port ?? DEV_DB.port,
    user: DEV_DB.user,
    password: DEV_DB.password,
    database: opts.database ?? DEV_DB.database,
  };
  const firstRun = !fs.existsSync(path.join(opts.dir, "PG_VERSION"));
  const pg = new EmbeddedPostgres({
    databaseDir: opts.dir,
    user: cfg.user,
    password: cfg.password,
    port: cfg.port,
    persistent: true, // penghapusan folder dilakukan pemanggil setelah server benar-benar berhenti
    // Postgres menolak berjalan sebagai root (container CI/Docker). Dengan opsi ini library
    // menjalankannya sebagai user `postgres` dan menyerahkan kepemilikan folder data kepadanya.
    createPostgresUser: process.getuid?.() === 0,
    // Tanpa ini initdb di Windows memakai WIN1252 dan menolak emoji/ikon kategori.
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    // io_method=sync: tanpa proses io_worker, yang di Windows bisa tertinggal
    // sebagai proses yatim setelah server berhenti.
    postgresFlags: ["-c", "io_method=sync"],
    onLog: () => {},
    onError: () => {},
  });
  if (firstRun) await pg.initialise();
  await pg.start();
  if (firstRun) await pg.createDatabase(cfg.database);

  let stopped = false;
  /** Shutdown lewat pg_ctl agar seluruh proses anak Postgres ikut berhenti (penting di Windows). */
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    const ctl = pgCtl();
    const r = ctl ? spawnSync(ctl, ["stop", "-D", opts.dir, "-m", "fast", "-w", "-t", "20"], { encoding: "utf8" }) : { status: 1 };
    if (r.status !== 0) await pg.stop().catch(() => {});
  };
  return { pg, url: databaseUrl(cfg), config: cfg, stop };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const dir = path.join(ROOT, ".pgdata");
  const db = await startDb({ dir });
  console.log("Postgres lokal berjalan.");
  console.log('DATABASE_URL="' + db.url + '"');
  console.log("Tekan Ctrl+C untuk berhenti.");
  const shutdown = async () => {
    await db.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  setInterval(() => {}, 1 << 30);
}
