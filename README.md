# Monify

Platform pengelolaan keuangan pribadi: dompet, pemasukan & pengeluaran, transfer antar dompet satu langkah, budget, tujuan tabungan, hutang & piutang, laporan, dan pindai struk dengan AI.

## Fitur

- **Dompet** — banyak dompet dengan tipe, warna, dan logo; saldo awal terpisah dari pemasukan; penyesuaian saldo tercatat; arsip.
- **Transaksi** — pengeluaran, pemasukan, lampiran privat, status tertunda; pencarian, filter (rentang tanggal, dompet, kategori, jenis), urutan, pagination.
- **Transfer antar dompet** — satu input, dua sisi, atomic; tidak pernah dihitung sebagai pemasukan/pengeluaran. Transfer ke/dari orang lain bisa dicatat sebagai pengeluaran atau non-pengeluaran.
- **Hutang & piutang** — jatuh tempo, pembayaran sebagian/penuh, riwayat pembayaran; satu pembayaran memperbarui sisa hutang, saldo dompet, dan riwayat sekaligus.
- **Budget** — per kategori atau grup, bulanan atau rentang tanggal, opsional per dompet; peringatan 80% dan lewat batas.
- **Tujuan tabungan** — target, tanggal, setor/tarik, perkiraan selesai; alokasi saja atau pemindahan nyata ke dompet tabungan.
- **Laporan** — harian s.d. tahunan dan rentang kustom; arus kas bersih (surplus/defisit), perbandingan periode sebelumnya, komposisi kategori, insight.
- **Pindai struk (AI)** — hasil AI hanya mengisi form; tidak ada yang tersimpan sebelum dikonfirmasi pengguna.
- **Akun** — daftar, masuk, lupa/ganti password, keluar dari perangkat lain, hapus akun; tema gelap/terang/sistem.

## Teknologi

| Lapisan | Teknologi |
|---|---|
| Server | Node.js ≥ 20, Express 4 |
| Database | PostgreSQL, Prisma 6 (`prisma migrate`) |
| Sesi | `express-session` + penyimpanan di Postgres |
| Frontend | HTML + CSS + JavaScript ES modules, tanpa framework dan tanpa build step |
| Lampiran | Disk lokal (pengembangan) atau Supabase Storage bucket privat |
| AI | Anthropic API lewat `@anthropic-ai/sdk` (opsional) |
| Test | `node:test` + Postgres lokal tertanam |

## Prasyarat

- Node.js 20 atau lebih baru.
- Untuk pengembangan lokal **tidak perlu** memasang PostgreSQL: `npm run dev` menyalakan Postgres tertanam.

## Instalasi & pengembangan

```bash
npm install
```

```bash
npm run dev:seed
```

Perintah di atas menyalakan Postgres lokal (data di `.pgdata/`), menerapkan migrasi, membuat akun demo, lalu menjalankan server di `http://localhost:3000` dengan reload otomatis. Kredensial akun demo ada di `.env.example` (`DEMO_USER_EMAIL` / `DEMO_USER_PASSWORD`). Gunakan `npm run dev` untuk menjalankan tanpa mengisi ulang data demo.

`npm run dev` selalu memakai database lokal dan mengabaikan `DATABASE_URL` di `.env`, sehingga tidak bisa menyentuh database lain secara tidak sengaja.

## Konfigurasi environment

Salin `.env.example` menjadi `.env`. Variabel penting:

| Variabel | Wajib | Keterangan |
|---|---|---|
| `DATABASE_URL` | production | URL PostgreSQL. Di serverless pakai URL pooler (`?pgbouncer=true&connection_limit=5`). |
| `AUTH_SECRET` | production | Minimal 32 karakter acak. Server menolak menyala di production tanpa ini. |
| `APP_URL` | disarankan | URL publik, dipakai di tautan reset password. |
| `ADMIN_EMAILS` | opsional | Email yang boleh membuka halaman admin. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET` | opsional | Penyimpanan lampiran di bucket **privat**. Tanpa ini memakai disk lokal. |
| `RESEND_API_KEY`, `MAIL_FROM` | opsional | Email reset password. |
| `ANTHROPIC_API_KEY`, `RECEIPT_MODEL` | opsional | Pindai struk. Tanpa ini fitur disembunyikan dan input manual tetap tersedia. |

## Database & migrasi

Skema: `prisma/schema.prisma`. Migrasi: `prisma/migrations/`.

| Perintah | Fungsi |
|---|---|
| `npm run db:migrate` | Membuat migrasi baru saat mengembangkan skema |
| `npm run db:deploy` | Menerapkan migrasi yang belum dijalankan |
| `npm run db:status` | Melihat status migrasi |
| `npm run db:local` | Menyalakan Postgres lokal saja |

### Meng-upgrade database produksi yang sudah ada (sekali saja)

Database versi lama dibuat dengan `prisma db push` sehingga belum punya riwayat migrasi. Urutannya:

1. **Backup database** (mis. `pg_dump`). Jangan lanjut tanpa backup yang sudah diuji bisa dipulihkan.
2. Tandai skema lama sebagai baseline — tidak mengubah apa pun di database:
   ```bash
   npm run db:baseline
   ```
3. Terapkan migrasi v1:
   ```bash
   npm run db:deploy
   ```

Migrasi v1 bersifat aditif (tidak ada tabel, kolom, atau baris yang dihapus) dan sudah diuji terhadap data berbentuk lama — lihat `tests/migration.test.js` dan `docs/DATABASE_SCHEMA.md`.

## Test

```bash
npm test
```

Menyalakan Postgres sementara, menerapkan semua migrasi, lalu menjalankan 73 test (unit, integrasi API, logika finansial, isolasi multi-user, keamanan, migrasi data). Satu file saja: `npm test -- tests/debts.test.js`.

```bash
npm run perf
```

Mengukur jumlah request, waktu, dan round-trip database per halaman pada dataset 105.000 transaksi.

## Deployment (Vercel)

1. Set environment variable di Vercel (lihat tabel di atas). `AUTH_SECRET` dan `DATABASE_URL` wajib.
2. Jalankan langkah upgrade database di atas dari mesin Anda — build Vercel **tidak** menjalankan migrasi secara otomatis.
3. Deploy. `vercel.json` melayani `public/` sebagai file statis lewat CDN dan sisanya lewat fungsi Express.

Konfigurasi `vercel.json` yang baru belum diuji pada deployment nyata; periksa di preview deployment bahwa `/assets/...` dilayani CDN (header `x-vercel-cache`).

## Dokumentasi

| Dokumen | Isi |
|---|---|
| [docs/PROJECT_AUDIT.md](docs/PROJECT_AUDIT.md) | Audit awal + baseline performa |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Arsitektur, keputusan, dan asumsi |
| [docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md) | Skema, aturan integritas, migrasi |
| [docs/API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md) | Seluruh endpoint |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | Token, komponen, motion |
| [docs/TESTING_STRATEGY.md](docs/TESTING_STRATEGY.md) | Apa yang diuji dan bagaimana |
| [docs/SECURITY_GUIDELINES.md](docs/SECURITY_GUIDELINES.md) | Kontrol keamanan dan batasannya |
| [docs/DEVELOPMENT_ROADMAP.md](docs/DEVELOPMENT_ROADMAP.md) | Status dan pekerjaan berikutnya |
| [docs/FINAL_QUALITY_AUDIT.md](docs/FINAL_QUALITY_AUDIT.md) | Audit akhir per requirement |
