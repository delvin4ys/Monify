# Checklist rilis Production

Keadaan per 12 November 2026, commit `96e743e` di `revamp/v1-foundation`.

**Status: DIRILIS ke Production pada 12 November 2026** (merge commit `3f782cf`, deployment `dpl_6fwc…`). Situs publik `https://monify-budget.vercel.app` lolos 36 dari 36 pemeriksaan E2E setelah rilis; akun uji dihapus.

Tanda: ✅ terverifikasi · ⛔ blocker rilis · ⚠️ risiko yang perlu keputusan pemilik · ⬜ dikerjakan saat rilis

## 1. Kode dan branch

| | Item | Bukti |
|---|---|---|
| ✅ | Branch `revamp/v1-foundation` bersih dan sinkron dengan remote | `git status` |
| ✅ | PR `delvin4ys/Monify#1` ke `main` terbuka, bisa di-merge tanpa konflik | `mergeable_state: clean` |
| ✅ | `npm test`: 73 dari 73 lolos | lokal dan GitHub Actions |
| ✅ | CI berjalan di setiap push dan lolos | check run `test` |
| ✅ | Build Vercel sukses, runtime Node 22, region `sin1` | `vercel build` lokal; header `x-vercel-id` preview |

## 2. Keamanan

| | Item | Bukti |
|---|---|---|
| ✅ | Dependency runtime tanpa celah yang diketahui | `npm audit`: 4 temuan tersisa, semuanya di rantai Prisma CLI (`@prisma/config`, `effect`, `deepmerge-ts`), yang tidak ikut ke bundel fungsi |
| ✅ | Tanpa sesi: API 401, halaman dialihkan | preview |
| ✅ | CSRF lintas origin ditolak (403); CSP dan HSTS terpasang | preview |
| ✅ | RLS aktif di semua tabel; advisor keamanan Supabase tanpa temuan selain info "RLS tanpa policy" (disengaja) | SQL, advisor |
| ✅ | Isolasi antar pengguna | test `isolation` |
| ⚠️ | Rate limit hanya di memori per instance; registrasi terbuka tanpa verifikasi email | kode |
| ⚠️ | Bucket lama `uploads` bersifat publik dan berisi 23 file lampiran versi lama | SQL |
| ⚠️ | Naik ke Prisma 7 untuk menutup 4 temuan CLI (perubahan major) | `npm audit` |

## 3. Integritas data finansial

| | Item | Bukti |
|---|---|---|
| ✅ | Transfer 1jt BRI→BCA: 5jt/2jt → 4jt/3jt, total tetap, di luar laporan | test; preview (3jt/4jt setelah transaksi lain, sesuai hitungan) |
| ✅ | Hutang 5jt bayar 1jt: sisa 4jt, satu riwayat, dompet berkurang 1jt | test; preview |
| ✅ | Laporan: income, expense, net, status benar; transfer dan hutang dikecualikan | test; preview |
| ✅ | Request duplikat tidak tercatat dua kali: transaksi, transfer, pembayaran hutang, **pencatatan hutang, setoran tabungan** | test (lima request bersamaan); preview |
| ✅ | Nominal nol dan pengeluaran melebihi saldo ditolak | preview |
| ✅ | Rekonsiliasi saldo konsisten setelah seluruh alur | preview (`/api/reconcile`); SQL pada data asli: 0 selisih |

## 4. Database

| | Item | Bukti |
|---|---|---|
| ✅ | Migrasi v1 sudah diterapkan; riwayat migrasi Prisma tercatat | SQL |
| ✅ | Data lama utuh: 15 pengguna, 23 dompet, 134 transaksi lama (+1 dari uji pemilik) | SQL |
| ✅ | Cadangan pra-migrasi di skema `backup_v0_20261112` | SQL |
| ✅ | `DATABASE_URL` memakai transaction pooler (port 6543, `pgbouncer=true`, `connection_limit=5`) | diganti lewat connector Vercel; Preview di-redeploy dan seluruh uji browser lolos di atasnya |
| ⚠️ | Paket gratis Supabase: project dijeda setelah ±1 minggu tanpa aktivitas dan tidak ada backup otomatis | project sempat INACTIVE |

## 5. Konfigurasi Vercel

| | Variabel | Preview | Production |
|---|---|---|---|
| ✅ | `AUTH_SECRET` | ada | ada (sensitive, nilai berbeda dari Preview) |
| ✅ | `DATABASE_URL` | transaction pooler | transaction pooler (berlaku pada deployment Production berikutnya) |
| ✅ | `APP_URL` | belum (tidak wajib) | `https://monify-budget.vercel.app` |
| ⚠️ | `RESEND_API_KEY`, `MAIL_FROM` | belum | belum: "Lupa password" menjawab 503 yang jelas |
| ⚠️ | `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET` | belum | belum: unggah lampiran dinonaktifkan dengan pesan jelas |
| ⚠️ | `ANTHROPIC_API_KEY` | belum | belum: pindai struk disembunyikan |
| ⬜ | `ADMIN_EMAILS` | belum | isi hanya setelah akun admin terdaftar |

## 6. Hasil Preview

Diuji pada deployment commit `96e743e` dengan akun sementara yang dihapus setelahnya (database kembali ke 15 pengguna, tanpa sisa data):

- 36 dari 36 pemeriksaan lolos: registrasi, dompet, transfer, pemasukan, pengeluaran, hutang dan pembayaran, tabungan, budget, dashboard, laporan, daftar transaksi, rekonsiliasi, duplikat, validasi, CSRF, header keamanan, hapus akun.
- Waktu respons API dari luar: 0,40 sampai 0,48 detik per permintaan.
- Tidak ada error di log runtime 30 menit terakhir.
- Login dengan akun lama dan satu transaksi sudah dicoba pemilik.

Uji browser (Chromium) terhadap Preview nyata setelah `DATABASE_URL` diganti, deployment `dpl_76u8…`: 19 dari 19 lolos. Registrasi lewat form, pengeluaran disimpan dengan Enter, transfer lewat form, catat hutang, bayar hutang lewat mode Hutang, buat tujuan tabungan dan menabung, delapan halaman tampil tanpa skeleton tersisa, 0 error konsol dan 0 respons 5xx. Akun uji dihapus; database kembali ke 15 pengguna.

Belum diuji di Preview: pindai struk, lampiran, email (ketiganya nonaktif dan ditunda atas keputusan pemilik).

## Blocker

Tidak ada blocker teknis yang tersisa.

1. ✅ `AUTH_SECRET` Production terpasang.
2. ✅ `DATABASE_URL` memakai transaction pooler.
3. ✅ Alur inti dicoba lewat browser di Preview (dikerjakan Claude atas permintaan pemilik).
4. ⬜ Persetujuan eksplisit pemilik untuk merge ke `main`.

Diputuskan pemilik (12 Nov 2026): reset password lewat email, lampiran, dan pindai struk dikerjakan setelah rilis. Ketiganya nonaktif dengan pesan yang jelas.

Catatan keamanan: password database dan nilai `AUTH_SECRET` sempat tampil di transkrip sesi Claude yang memasangnya (atas izin pemilik). Bila ingin lebih rapat, ganti password database di Supabase lalu perbarui `DATABASE_URL`, dan ganti `AUTH_SECRET` di Vercel.

## Urutan rilis (dijalankan 12 November 2026)

1. ✅ Verifikasi ulang: CI hijau, Preview sehat, konfigurasi Production terpasang.
2. ✅ Cadangan database: skema `backup_prerelease_20261112` (15 tabel, 15 pengguna, 135 transaksi).
3. ✅ Merge PR `delvin4ys/Monify#1` ke `main`; Vercel men-deploy Production otomatis.
4. ✅ Verifikasi Production: `/api/health` 200, halaman login tampil, E2E 36 dari 36, rekonsiliasi konsisten, database bersih dari data uji.
5. ⬜ Konfirmasi pemilik: login dengan akun lama di Production.
6. ⬜ Setelah stabil beberapa hari: hapus skema cadangan.

Jalur mundur darurat: Vercel → Deployments → Promote deployment Production sebelumnya (`dpl_7nLB…`). Kode lama tidak sepenuhnya cocok dengan skema baru, jadi hanya untuk keadaan darurat singkat.

Catatan log: pesan `[session] koneksi awal database gagal` pada request yang tidak menyentuh database adalah efek pembekuan fungsi serverless, bukan kegagalan query.
