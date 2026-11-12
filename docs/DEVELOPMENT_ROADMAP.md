# Development Roadmap

Disusun dari [`PROJECT_AUDIT.md`](./PROJECT_AUDIT.md). Urutan mengikuti dependensi teknis: integritas data dan keamanan sebelum tampilan.

Status: `[x]` selesai dan terverifikasi oleh test atau pengujian yang benar-benar dijalankan · `[~]` sebagian · `[ ]` belum.
Rincian bukti per requirement ada di [`FINAL_QUALITY_AUDIT.md`](./FINAL_QUALITY_AUDIT.md).

## P0 — Audit & investigasi
- [x] Inspeksi seluruh source code dan konfigurasi.
- [x] `PROJECT_AUDIT.md` + baseline performa terukur.

## P1 — Keamanan & integritas data
- [x] Hapus endpoint `/api/tmp-fix-category-data` (C1).
- [x] `AUTH_SECRET` wajib; ID sesi diganti saat login; rate limit; `helmet` + CSP; pemeriksaan `Origin` (H3, H5).
- [x] Error handler terpusat, format respons konsisten (H4).
- [x] `server/index.js` dipecah menjadi routes / services / middleware; validasi terpusat.
- [x] `prisma migrate`: baseline + migrasi v1 (index, `BigInt`, `kind`/`direction`, saldo awal, constraint) — diuji pada data berbentuk lama.
- [x] Ledger atomic + rekonsiliasi (C3).
- [x] Hapus dompet aman; saldo awal & penyesuaian saldo (C5, C6).
- [x] Rendering aman-XSS di seluruh frontend (H1).
- [x] Unggahan: tipe dari magic bytes, penyimpanan privat per pengguna (H2).
- [ ] **Menerapkan migrasi ke database produksi** — menunggu pemilik proyek (backup dulu; langkah di README).
- [ ] Memindahkan lampiran lama ber-URL publik ke bucket privat.

## P2 — Performa
- [x] Agregasi di database; N+1 budget dan loop 12 query dihapus.
- [x] `/api/bootstrap` dan `/api/dashboard` agregat.
- [x] Pagination cursor.
- [x] Cache stale-while-revalidate + invalidasi saat mutasi.
- [x] Asset ber-hash dengan cache `immutable`; `vercel.json` melayani `public/` sebagai statis.
- [x] Skeleton per halaman; state loading / kosong / error terpisah.
- [x] Pengukuran sebelum–sesudah (`npm run perf`).
- [ ] Verifikasi `vercel.json` pada deployment nyata; Lighthouse pada URL produksi.

## P3 — Design system & redesign
- [x] Token (gelap lava + terang), tipografi Geist, komponen, `DESIGN_SYSTEM.md`.
- [x] Shell responsif: sidebar / rel ikon / tab bar + bottom sheet.
- [x] Semua halaman didesain ulang; tanpa inline color hardcoded.
- [x] Tema gelap / terang / sistem, tersimpan di akun.
- [x] Motion + `prefers-reduced-motion`.
- [ ] Audit aksesibilitas dengan pembaca layar dan alat otomatis.

## P4 — Auth & pengguna
- [x] Daftar, masuk, keluar, lupa/reset password, ganti password, keluar dari perangkat lain, hapus akun, profil & preferensi.
- [ ] Verifikasi email (butuh penyedia email).
- [ ] Preferensi notifikasi dan bahasa (UI saat ini hanya Bahasa Indonesia).

## P5 — Dompet, kategori, transaksi
- [x] Dompet: tipe, warna, logo, saldo awal, arsip, riwayat per dompet.
- [x] Kategori: buat, ubah, arsip, hapus dengan pemeriksaan pemakaian, warna & ikon, grup.
- [x] Riwayat: pencarian, filter rentang tanggal / dompet / kategori / jenis, urutan, total, pagination.
- [x] Pemilih kategori di dalam form.

## P6 — Transfer & hutang/piutang
- [x] Transfer internal satu langkah, atomic, idempotent; migrasi pasangan transfer lama.
- [x] Transfer eksternal: pengeluaran atau non-pengeluaran.
- [x] `Debt` + `DebtPayment`, jatuh tempo, status, riwayat, bunga terpisah; migrasi data hutang lama.

## P7 — Budget, tabungan, analitik
- [x] Budget per dompet; status 80% / lewat batas di halaman Budget dan Dashboard.
- [x] Tujuan tabungan + animasi celengan.
- [x] Laporan: granularitas harian–tahunan, rentang kustom, perbandingan periode, insight, tujuh visualisasi.
- [ ] Notifikasi budget di luar aplikasi (email/push).

## P8 — AI receipt scanner
- [x] Ekstraksi terstruktur di backend, persetujuan pengguna, alur konfirmasi, fallback manual, penghapusan gambar — diuji dengan klien tiruan.
- [ ] **Uji dengan API sungguhan** (butuh `ANTHROPIC_API_KEY`); sesuaikan prompt dari struk nyata.

## P9 — Testing & kesiapan produksi
- [x] 67 test otomatis; `TESTING_STRATEGY.md`, `SECURITY_GUIDELINES.md`, `FINAL_QUALITY_AUDIT.md`, README.
- [ ] Test end-to-end otomatis di browser.
- [ ] Uji lintas browser (Firefox, Safari) dan perangkat fisik.
- [ ] CI yang menjalankan `npm test` pada setiap push.
- [ ] Monitoring / error tracking; backup terjadwal.

## Catatan untuk sesi berikutnya

Urutan yang disarankan:

1. Pemilik proyek: backup → `npm run db:baseline` → `npm run db:deploy` → deploy ke preview Vercel → cek `/api/reconcile` pada akun nyata.
2. Isi `ANTHROPIC_API_KEY` di lingkungan uji, pindai 10–20 struk nyata, sesuaikan `SYSTEM` di `server/services/receipts.js`.
3. Tambah CI (`npm test`) dan satu rangkaian test end-to-end untuk alur: daftar → dompet → transaksi → transfer → hutang.
4. Verifikasi email dan pemindahan lampiran lama ke bucket privat.
5. Rate limiter berbasis penyimpanan bersama bila berjalan di banyak instance.

Hal yang sengaja tidak dibuat (alasan di `ARCHITECTURE.md`): kursor kustom, parallax, konversi multi-mata uang, saldo negatif (kartu kredit).

## Konfigurasi yang dibutuhkan dari pemilik proyek

| Kebutuhan | Dipakai untuk | Status |
|---|---|---|
| Node.js LTS | Menjalankan aplikasi dan test | Terpasang (v26) |
| Backup database produksi | Sebelum migrasi pertama | Belum |
| `AUTH_SECRET` ≥ 32 karakter di production | Server menolak menyala tanpanya | Perlu dicek di Vercel |
| Kredensial penyedia email (`RESEND_API_KEY`, `MAIL_FROM`) | Email reset password | Belum |
| `SUPABASE_SERVICE_ROLE_KEY` + bucket privat | Lampiran dan struk | Belum |
| `ANTHROPIC_API_KEY` | Pindai struk | Belum |
