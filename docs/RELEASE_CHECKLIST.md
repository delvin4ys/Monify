# Checklist rilis Production

Keadaan per 12 November 2026, commit `96e743e` di `revamp/v1-foundation`.

**Keputusan saat ini: NOT READY FOR PRODUCTION.** Kode siap; yang tersisa adalah konfigurasi Production dan persetujuan pemilik (bagian "Blocker").

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
| ⛔ | `DATABASE_URL` masih session pooler (port 5432) | log runtime sebelumnya menunjukkan host `…pooler.supabase.com:5432` |
| ⚠️ | Paket gratis Supabase: project dijeda setelah ±1 minggu tanpa aktivitas dan tidak ada backup otomatis | project sempat INACTIVE |

## 5. Konfigurasi Vercel

| | Variabel | Preview | Production |
|---|---|---|---|
| ⛔ | `AUTH_SECRET` | ada | **belum ada**: tanpa ini setiap halaman menjawab 500 |
| ⛔ | `DATABASE_URL` | ada (session pooler) | ada (session pooler): ganti ke transaction pooler |
| ⚠️ | `APP_URL` | belum | belum (dipakai tautan reset password) |
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

Belum diuji di Preview: tampilan tiap form lewat browser (hanya diuji lokal), pindai struk, lampiran, email.

## Blocker

1. ⛔ `AUTH_SECRET` untuk Production belum diisi.
2. ⛔ `DATABASE_URL` belum memakai transaction pooler (risiko kehabisan koneksi saat banyak pengguna).
3. ⛔ Persetujuan pemilik setelah mencoba sendiri alur inti di Preview lewat browser.

Keputusan pemilik (bukan blocker teknis, tetapi menentukan layak tidaknya "publik"):

- Rilis tanpa reset password lewat email? Pengguna yang lupa password tidak bisa memulihkan akun sendiri.
- Rilis tanpa lampiran dan pindai struk?

## Langkah pemilik (tanpa mengirim secret ke chat)

1. **`AUTH_SECRET` Production.** Vercel → project `monify` → Settings → Environment Variables → Add. Key `AUTH_SECRET`, Value hasil `openssl rand -hex 48` atau password acak 64 karakter dari password manager, centang **Production** saja, tandai Sensitive, Save.
2. **`DATABASE_URL`.** Supabase → Connect → salin **Transaction pooler** (port 6543) → isi password → tambahkan `?pgbouncer=true&connection_limit=1`. Di Vercel, edit `DATABASE_URL` yang ada dan tempel nilai baru (berlaku untuk semua environment).
3. **`APP_URL`.** Isi dengan domain produksi tanpa garis miring di akhir, untuk Production.
4. Redeploy Preview (Deployments → ⋯ → Redeploy), buka `/api/health`, lalu coba di browser: tambah transaksi, transfer, catat dan bayar hutang, menabung.
5. Beri tahu Claude: "konfigurasi Production sudah diisi". Claude memverifikasi nama variabel dan target tanpa membuka nilainya.

## Urutan rilis (setelah semua blocker selesai dan pemilik menyetujui)

1. ⬜ Verifikasi ulang: CI hijau, Preview sehat, `AUTH_SECRET` dan `DATABASE_URL` Production terpasang.
2. ⬜ Cadangan baru database sesaat sebelum rilis.
3. ⬜ Merge PR `delvin4ys/Monify#1` ke `main` (memicu deployment Production otomatis).
4. ⬜ Verifikasi Production: `/api/health`, login, satu transaksi, log runtime.
5. ⬜ Jalur mundur bila bermasalah: Vercel → Deployments → Promote deployment Production sebelumnya. Catatan: kode lama tidak sepenuhnya cocok dengan skema baru, jadi mundur hanya untuk keadaan darurat singkat.
6. ⬜ Setelah stabil beberapa hari: hapus skema `backup_v0_20261112`.
