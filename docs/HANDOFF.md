# Handoff Monify: status per 12 November 2026

Dokumen ini adalah catatan serah terima untuk sesi berikutnya. Bagian B adalah sumber kebenaran untuk keadaan terbaru. Tidak ada nilai rahasia di dokumen ini.

## A. Identitas proyek

- Nama: Monify, aplikasi pengelolaan keuangan pribadi (dompet, transaksi, transfer, budget, tabungan, hutang dan piutang, laporan, pindai struk AI).
- Repository: `delvin4ys/Monify`. Branch kerja: `revamp/v1-foundation`. Pull request terbuka: `delvin4ys/Monify#1` (ke `main`).
- Tujuan besar: revamp menyeluruh sesuai MASTER PROMPT pemilik (kualitas ISO/IEC 25010, performa, UI premium dark lava red, logika finansial benar, keamanan, test, dokumentasi, audit dua tahap).
- Stack (tidak boleh diganti tanpa alasan kuat): Node.js, Express 4, PostgreSQL (Supabase), Prisma 6, sesi `express-session` di Postgres, frontend HTML + CSS + ES modules tanpa build step, deploy di Vercel.

## B. Keadaan terbaru (sumber kebenaran)

1. CONFIRMED: Commit terakhir di `revamp/v1-foundation` adalah `c2b2e61`. Build preview Vercel untuk commit itu sukses.
2. CONFIRMED: Preview hidup di `https://monify-git-revamp-v1-foundation-delvin4ys-projects.vercel.app`. `/api/health` menjawab 200 dan halaman login tampil. Preview dilindungi Vercel Authentication, jadi hanya bisa dibuka sambil login Vercel.
3. CONFIRMED: Pemilik berhasil login di preview dengan akun Monify lama.
4. UNVERIFIED: Fitur lain di preview (tambah transaksi, transfer, pembayaran hutang, budget, tabungan, laporan) belum diuji di deployment nyata. Semuanya sudah lolos uji lokal.
5. CONFIRMED: Versi baru BELUM dirilis ke produksi. `main` masih berisi kode lama. Tidak ada merge ke `main` dan tidak ada deployment Production yang dilakukan.
6. CONFIRMED: Database Supabase (satu-satunya, dipakai Preview dan Production) SUDAH dimigrasi ke skema v1. Akibatnya situs produksi lama tidak aman dipakai lagi (lihat G1).
7. CONFIRMED: `npm test` 70 dari 70 lolos pada commit `c2b2e61`.
8. Audit lengkap ada di `docs/FINAL_QUALITY_AUDIT.md`: 58 PASS, 34 PARTIAL, 7 FAIL, 5 NOT TESTED.

## C. Pekerjaan yang selesai

1. COMPLETED: Akar masalah build Vercel ditemukan: `vercel.json` di commit `e28f50b` bukan JSON valid. Sudah benar sejak `bdb9924`.
2. COMPLETED: `scripts/dev-db.mjs` diperbaiki agar `npm test` bisa berjalan sebagai root (container).
3. COMPLETED: `docs/FINAL_QUALITY_AUDIT.md` ditulis ulang dengan status konservatif, lalu diperbarui setelah migrasi.
4. COMPLETED: `docs/SETUP_CHECKLIST.md` dibuat (panduan setup untuk pemilik).
5. COMPLETED: `server/app.js` diperbaiki: kegagalan koneksi awal database tidak lagi mematikan proses (sebelumnya tercatat satu crash di log preview).
6. COMPLETED: Project Supabase diaktifkan kembali (sebelumnya INACTIVE).
7. COMPLETED: Migrasi v1 dijalankan pada database asli dalam satu transaksi. Hasil verifikasi: 15 pengguna, 23 dompet, 134 transaksi, 175 kategori, 11 budget, semuanya sama dengan cadangan. Tidak ada saldo, nominal, tanggal, atau kategori yang berubah. Rekonsiliasi saldo 0 selisih. Dari 37 baris transfer lama, 20 terpasang menjadi 10 transfer, 17 tidak berpasangan dan tetap berjenis transfer. 2 piutang lama menjadi baris `Debt`.
8. COMPLETED: Cadangan data lama dibuat di skema `backup_v0_20261112` pada database yang sama.
9. COMPLETED: Tabel `_prisma_migrations` dibuat dengan dua entri (`0_init`, `20261112000000_v1_foundation`) dan checksum yang cocok dengan file migrasi.
10. COMPLETED: Row-Level Security diaktifkan di semua tabel skema `public` tanpa policy. Sebelumnya semua tabel bisa dibaca lewat API publik Supabase dengan anon key.
11. COMPLETED: `AUTH_SECRET` dipasang di Vercel untuk environment Preview saja (tipe sensitive).
12. COMPLETED: Environment cloud Claude bernama `monify` dibuat, mengizinkan host preview.
13. COMPLETED: Connector Vercel dan Supabase tersambung dan diberi akses tim `delvin4ys-projects`.

## D. Keputusan dan alasannya

1. Pemilik memilih opsi B: memakai database Supabase yang ada untuk preview dan memigrasinya langsung, bukan membuat database preview terpisah. Alasan pemilik: itu database versi Monify lama.
2. Migrasi dijalankan lewat connector Supabase (SQL), bukan `prisma migrate`, karena sesi cloud tidak punya akses jaringan langsung ke database. Riwayat migrasi Prisma ditulis manual agar `prisma migrate deploy` berikutnya tetap konsisten.
3. RLS diaktifkan tanpa policy: aplikasi terhubung sebagai role pemilik tabel lewat Prisma sehingga tidak terpengaruh, sedangkan akses anon lewat API Supabase tertutup.
4. `AUTH_SECRET` hanya untuk Preview: mengisi Production ditunda sampai rilis.
5. Region Vercel belum diubah: riwayat repo menunjukkan pemilik pernah memasang `"regions": ["sin1"]` (commit `7c64a49`) lalu mencabutnya (commit `45064a0`, "Remove region fix"). Alasannya belum diketahui, jadi menunggu jawaban pemilik.
6. `npm audit fix` dan CI belum dikerjakan: menunggu persetujuan pemilik.
7. Aturan kerja dari pemilik yang masih berlaku: jangan reset atau menimpa commit yang ada, jangan merge ke `main`, jangan deploy Production, jangan membuat credential palsu, perbaiki hanya akar masalah yang terbukti, jangan mengklaim berhasil tanpa bukti.

## E. Detail teknis

- Vercel: project `monify`, projectId `prj_ikJvfMhCJAkzO74wKPOr7hntbFLn`, teamId `team_ACUK0v7A4uqIiKthh1YqBC5G` (slug `delvin4ys-projects`). Fungsi berjalan di region `iad1`, runtime `nodejs26.x` (karena `engines.node` adalah `>=20`).
- Environment variable di Vercel (nama saja): `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` (semua environment), `AUTH_SECRET` (Preview saja). Belum ada: `APP_URL`, `ADMIN_EMAILS`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET`, `RESEND_API_KEY`, `MAIL_FROM`, `ANTHROPIC_API_KEY`.
- Supabase: project ref `vjimzfqfwdkbfzhvhcru`, region `ap-southeast-1`, Postgres 17. `DATABASE_URL` mengarah ke session pooler `aws-1-ap-southeast-1.pooler.supabase.com:5432`.
- Perintah: `npm ci`, `npm test`, `npm run dev:seed`, `npm run db:deploy`, `npm run db:status`.
- Cara verifikasi yang dipakai: `npm test`; `vercel build` lokal lalu menjalankan bundel dengan `VERCEL=1`; Playwright terhadap bundel itu; connector Vercel (`web_fetch_vercel_url`, `get_runtime_logs`); SQL verifikasi lewat connector Supabase.
- Keterbatasan alat: connector Vercel hanya bisa mengambil halaman dengan GET, jadi alur yang butuh POST (login, simpan transaksi) di preview hanya bisa diuji pemilik.
- Cara mengembalikan data lama bila perlu: tabel asli tersimpan di skema `backup_v0_20261112` (`User`, `CategoryParent`, `Wallet`, `Category`, `Budget`, `Transaction`, `Session`).

## F. Riwayat perubahan penting

1. SUPERSEDED: Audit versi pertama (dari sesi sebelum ini) memberi banyak PASS berdasarkan uji manual yang tidak bisa diulang. Diganti audit konservatif.
2. SUPERSEDED: Status "aplikasi di preview NOT TESTED" dan "migrasi produksi NOT TESTED". Sekarang preview hidup dan migrasi sudah diterapkan.
3. SUPERSEDED: Rencana di `docs/SETUP_CHECKLIST.md` Tahap 3 (membuat database preview terpisah). Pemilik memilih opsi B, jadi tahap itu tidak dipakai. Tahap 1, 2, dan 4 sudah selesai. Tahap 5 (opsional per fitur) masih berlaku.
4. Commit sesi ini di `revamp/v1-foundation`: `3912e04` (audit dan runner test), `458d0a2` (checklist setup), `c2b2e61` (perbaikan koneksi awal dan pembaruan audit).

## G. Masalah terbuka dan keterbatasan

1. Situs produksi lama berjalan di atas database yang sudah dimigrasi. Uji lokal: login, dompet, kategori, budget tetap jalan, tetapi daftar transaksi error bila ada baris tanpa kategori (transfer atau penyesuaian dari versi baru), dan transaksi yang ditulis kode lama tidak terklasifikasi benar. Produksi sebaiknya tidak dipakai sampai versi baru dirilis.
2. Region dan pooler: fungsi di AS, database di Singapura, memakai session pooler port 5432. Risiko lambat dan kehabisan koneksi. Idealnya region `sin1` dan transaction pooler port 6543 dengan `?pgbouncer=true&connection_limit=1`.
3. `AUTH_SECRET` belum ada untuk Production. Tanpa itu versi baru menjawab 500 di setiap request.
4. `npm audit`: 10 temuan (1 critical `proxy-addr`, 8 high), belum diperbaiki.
5. Tidak ada CI. `engines.node` belum dikunci.
6. Lampiran: tanpa Supabase Storage dengan service-role key, file di Vercel ditulis ke `/tmp` dan hilang. Lampiran versi lama masih ber-URL publik.
7. Email reset password dan verifikasi email belum aktif (butuh Resend). Hak admin terikat email yang tidak diverifikasi: daftarkan akun admin sebelum mengisi `ADMIN_EMAILS`.
8. Pindai struk AI belum pernah diuji dengan API key sungguhan.
9. Rate limit hanya di memori per instance.
10. Idempotency belum ada untuk setoran tabungan dan pembuatan hutang.
11. Ada dompet berkurs USD di data lama. Budget tidak memfilter mata uang.
12. 17 baris transfer lama tidak berpasangan (tetap di luar laporan, tetapi tidak tampil sebagai satu transfer).
13. UI: Enter di form transaksi tidak menyimpan; di mobile filter Transaksi memakan satu layar dan tombol tambah menutupi kartu.
14. Belum ada test E2E di repo, belum ada Lighthouse, baru Chromium yang diuji.
15. Nilai `AUTH_SECRET` Preview sempat tampil di transkrip sesi pembuatnya. Pemilik boleh menggantinya di dashboard Vercel.
16. Skema cadangan `backup_v0_20261112` perlu dihapus setelah rilis stabil.

## H. Langkah berikutnya (berurutan)

1. Pemilik menguji fitur di preview: tambah transaksi, transfer antar dompet, pembayaran hutang, lalu cek saldo dan dashboard. Bila ada error, baca log runtime lewat connector Vercel.
2. Tanyakan kepada pemilik alasan region Singapura dulu dicabut. Bila tidak ada alasan khusus, pasang `"regions": ["sin1"]` di `vercel.json` dan ukur di preview.
3. Minta pemilik mengganti `DATABASE_URL` di Vercel ke transaction pooler (port 6543). Jangan membuka nilai rahasia yang ada.
4. Dengan persetujuan pemilik: `npm audit fix`, jalankan `npm test`, lalu tambah workflow CI yang menjalankan `npm test`, dan kunci `engines.node` ke `22.x`.
5. Kerjakan P1 lain di `docs/FINAL_QUALITY_AUDIT.md` bagian "Yang belum selesai".
6. Rilis produksi hanya atas perintah eksplisit pemilik: isi `AUTH_SECRET` untuk Production, merge PR `delvin4ys/Monify#1`, verifikasi produksi.

## I. Konteks yang harus dipertahankan

- Pemilik berbahasa Indonesia dan bukan pengguna teknis mendalam: beri langkah yang jelas, satu per satu.
- Jangan pernah meminta atau menempel password, secret, atau API key di chat. Jangan mendekripsi environment variable Vercel.
- Status PASS hanya untuk hal yang benar-benar diuji. Fitur keuangan, keamanan, dan isolasi data butuh bukti backend, database, atau test.
- Push hanya ke `revamp/v1-foundation`. Jangan membuat PR baru, jangan merge, jangan deploy Production tanpa diminta.
- Setiap tabel baru di skema `public` harus diaktifkan RLS-nya.
- Database yang sama dipakai Preview dan Production: setiap perubahan skema atau data berdampak ke keduanya.

## J. Prompt untuk sesi baru

```text
Lanjutkan proyek Monify di repo delvin4ys/Monify, branch revamp/v1-foundation.

Sebelum melakukan apa pun, baca docs/HANDOFF.md sampai habis, lalu docs/FINAL_QUALITY_AUDIT.md. Perlakukan bagian B di HANDOFF.md sebagai keadaan terbaru yang sah. Bila ada isi dokumen lain yang bertentangan dengan bagian B, bagian B yang berlaku.

Aturan:
1. Pertahankan semua keputusan dan aturan kerja yang masih berlaku (bagian D dan I).
2. Lanjutkan dari titik berhenti yang tercatat. Jangan mengulang pekerjaan di bagian C.
3. Verifikasi dulu keadaan nyata sebelum bertindak: git log, npm test, status deployment Vercel, dan keadaan database, sejauh alatmu memungkinkan. Bila kenyataan berbeda dari catatan, laporkan perbedaannya.
4. Push hanya ke revamp/v1-foundation. Jangan merge ke main dan jangan deploy Production tanpa perintah eksplisit dari saya.
5. Jangan meminta saya menempel password atau API key di chat, dan jangan membuka nilai rahasia yang tersimpan.
6. Database Supabase dipakai bersama oleh Preview dan Production. Minta persetujuan saya sebelum mengubah skema atau data.
7. Tanyakan hanya hal yang benar-benar tidak ada di dokumen. Bila ada konteks yang tidak bisa dipulihkan, katakan terus terang.

Mulai dari bagian H (Langkah berikutnya), nomor 1. Laporkan dulu ringkasan singkat keadaan yang kamu temukan, lalu usulkan apa yang akan kamu kerjakan di sesi ini.
```
