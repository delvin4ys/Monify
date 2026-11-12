# Handoff Monify: status per 12 November 2026

Dokumen ini adalah catatan serah terima untuk sesi berikutnya. Bagian B adalah sumber kebenaran untuk keadaan terbaru. Tidak ada nilai rahasia di dokumen ini.

## A. Identitas proyek

- Nama: Monify, aplikasi pengelolaan keuangan pribadi (dompet, transaksi, transfer, budget, tabungan, hutang dan piutang, laporan, pindai struk AI).
- Repository: `delvin4ys/Monify`. Branch kerja: `revamp/v1-foundation`. Pull request terbuka: `delvin4ys/Monify#1` (ke `main`).
- Tujuan besar: revamp menyeluruh sesuai MASTER PROMPT pemilik (kualitas ISO/IEC 25010, performa, UI premium dark lava red, logika finansial benar, keamanan, test, dokumentasi, audit dua tahap).
- Stack (tidak boleh diganti tanpa alasan kuat): Node.js, Express 4, PostgreSQL (Supabase), Prisma 6, sesi `express-session` di Postgres, frontend HTML + CSS + ES modules tanpa build step, deploy di Vercel.

## B. Keadaan terbaru (sumber kebenaran)

Prioritas pemilik sekarang: menyiapkan rilis Production yang aman untuk publik. Fitur baru dan perapian UI ditunda. Checklist rilis ada di `docs/RELEASE_CHECKLIST.md`.

1. CONFIRMED: Keputusan terakhir: NOT READY FOR PRODUCTION. Kode siap, yang tersisa konfigurasi Production dan persetujuan pemilik.
2. CONFIRMED: Commit kode terakhir `96e743e` di `revamp/v1-foundation` (sesudahnya hanya commit dokumen; cek `git log`). `npm test` 73 dari 73 lolos, lokal dan di GitHub Actions. Build Preview sukses.
3. CONFIRMED: Preview hidup di `https://monify-git-revamp-v1-foundation-delvin4ys-projects.vercel.app` (dilindungi Vercel Authentication), berjalan di region `sin1`, Node 22.
4. CONFIRMED: Uji E2E terhadap Preview nyata: 36 dari 36 pemeriksaan lolos (registrasi, dompet, transfer, transaksi, hutang, tabungan, budget, dashboard, laporan, rekonsiliasi, duplikat, CSRF, hapus akun). Akun uji sementara dihapus; database kembali ke 15 pengguna tanpa sisa data.
5. CONFIRMED: Pemilik berhasil login di Preview dengan akun lama dan membuat satu transaksi.
6. CONFIRMED: Versi baru BELUM dirilis. `main` masih kode lama. Tidak ada merge dan tidak ada perubahan deployment Production.
7. CONFIRMED: Database Supabase (dipakai Preview dan Production) sudah di skema v1, RLS aktif, rekonsiliasi 0 selisih.
8. BLOCKED (menunggu pemilik): `AUTH_SECRET` untuk Production belum ada; `DATABASE_URL` masih session pooler port 5432; pemilik belum memberi persetujuan rilis setelah mencoba alur inti di browser.
9. Audit: `docs/FINAL_QUALITY_AUDIT.md`: 63 PASS, 32 PARTIAL, 5 FAIL, 4 NOT TESTED.

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
14. COMPLETED: `npm audit fix` (temuan critical hilang; sisa 5 di `prisma` CLI dan `qs`).
15. COMPLETED: `engines.node` dikunci ke `22.x`.
16. COMPLETED: `vercel.json` memakai `"regions": ["sin1"]`; header preview menunjukkan fungsi berjalan di `sin1`.
17. COMPLETED: CI `.github/workflows/test.yml` menjalankan `npm test`; run pertama lolos.
18. COMPLETED: Enter di kolom isian dialog menekan tombol utama (Simpan), di `public/js/app/ui.js`.
19. COMPLETED: Idempotency untuk setoran tabungan dan pencatatan hutang tanpa perubahan skema (`server/services/idempotency.js`: kunci advisory + kunci di meta `AuditLog`). Form mengirim `Idempotency-Key`.
20. COMPLETED: Lampiran di serverless tanpa service-role key ditolak dengan 503 dan kolomnya disembunyikan; anon key tidak lagi dipakai sebagai cadangan.
21. COMPLETED: Lupa password di production tanpa penyedia email menjawab 503 dengan pesan jelas.
22. COMPLETED: Express 4.22.3, Multer 2.x. Sisa `npm audit`: 4 temuan di rantai Prisma CLI, tidak ikut ke bundel runtime.
23. COMPLETED: `docs/RELEASE_CHECKLIST.md` dibuat.

## D. Keputusan dan alasannya

1. Pemilik memilih opsi B: memakai database Supabase yang ada untuk preview dan memigrasinya langsung, bukan membuat database preview terpisah. Alasan pemilik: itu database versi Monify lama.
2. Migrasi dijalankan lewat connector Supabase (SQL), bukan `prisma migrate`, karena sesi cloud tidak punya akses jaringan langsung ke database. Riwayat migrasi Prisma ditulis manual agar `prisma migrate deploy` berikutnya tetap konsisten.
3. RLS diaktifkan tanpa policy: aplikasi terhubung sebagai role pemilik tabel lewat Prisma sehingga tidak terpengaruh, sedangkan akses anon lewat API Supabase tertutup.
4. `AUTH_SECRET` hanya untuk Preview: mengisi Production ditunda sampai rilis.
5. Region Vercel dipasang lagi ke `sin1` setelah pemilik meminta pekerjaan dilanjutkan. Pemilik pernah memasang lalu mencabutnya (commit `45064a0`, "Remove region fix") dengan alasan yang belum diketahui: bila muncul masalah hang atau timeout di preview, cabut baris `regions` lebih dulu.
6. `npm audit fix` dan CI dikerjakan atas permintaan pemilik untuk melanjutkan.
7. Aturan kerja dari pemilik yang masih berlaku: jangan reset atau menimpa commit yang ada, jangan merge ke `main`, jangan deploy Production, jangan membuat credential palsu, perbaiki hanya akar masalah yang terbukti, jangan mengklaim berhasil tanpa bukti.

## E. Detail teknis

- Vercel: project `monify`, projectId `prj_ikJvfMhCJAkzO74wKPOr7hntbFLn`, teamId `team_ACUK0v7A4uqIiKthh1YqBC5G` (slug `delvin4ys-projects`). Fungsi berjalan di region `sin1`. `engines.node` adalah `22.x`.
- Environment variable di Vercel (nama saja): `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` (semua environment), `AUTH_SECRET` (Preview saja). Belum ada: `APP_URL`, `ADMIN_EMAILS`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET`, `RESEND_API_KEY`, `MAIL_FROM`, `ANTHROPIC_API_KEY`.
- Supabase: project ref `vjimzfqfwdkbfzhvhcru`, region `ap-southeast-1`, Postgres 17. `DATABASE_URL` mengarah ke session pooler `aws-1-ap-southeast-1.pooler.supabase.com:5432`.
- Perintah: `npm ci`, `npm test`, `npm run dev:seed`, `npm run db:deploy`, `npm run db:status`.
- Uji E2E terhadap Preview: `get_access_to_vercel_url` memberi tautan berbagi, lalu `curl` dengan cookie jar. Skrip membuat akun `e2e-...@example.test`, menjalankan alur, lalu menghapus akunnya lewat `DELETE /api/account`.
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
2. Pooler: `DATABASE_URL` memakai session pooler port 5432. Risiko kehabisan koneksi saat ramai. Idealnya transaction pooler port 6543 dengan `?pgbouncer=true&connection_limit=1` (pemilik yang harus mengganti nilainya di Vercel).
3. `AUTH_SECRET` belum ada untuk Production. Tanpa itu versi baru menjawab 500 di setiap request.
4. `npm audit`: sisa 4 temuan, semuanya di rantai Prisma CLI (butuh naik ke Prisma 7), tidak ikut ke bundel runtime.
5. SUPERSEDED: "tidak ada CI" dan "Node belum dikunci". Keduanya sudah selesai.
6. Lampiran: tanpa Supabase Storage dengan service-role key, file di Vercel ditulis ke `/tmp` dan hilang. Lampiran versi lama masih ber-URL publik.
7. Email reset password dan verifikasi email belum aktif (butuh Resend). Hak admin terikat email yang tidak diverifikasi: daftarkan akun admin sebelum mengisi `ADMIN_EMAILS`.
8. Pindai struk AI belum pernah diuji dengan API key sungguhan.
9. Rate limit hanya di memori per instance.
10. SUPERSEDED: idempotency tabungan dan hutang sudah selesai.
11. Ada dompet berkurs USD di data lama. Budget tidak memfilter mata uang.
12. 17 baris transfer lama tidak berpasangan (tetap di luar laporan, tetapi tidak tampil sebagai satu transfer).
13. UI: di mobile filter Transaksi memakan satu layar dan tombol tambah menutupi kartu. (Enter di form sudah diperbaiki.)
14. Belum ada test E2E di repo, belum ada Lighthouse, baru Chromium yang diuji.
15. Nilai `AUTH_SECRET` Preview sempat tampil di transkrip sesi pembuatnya. Pemilik boleh menggantinya di dashboard Vercel.
16. Skema cadangan `backup_v0_20261112` perlu dihapus setelah rilis stabil.

## H. Langkah berikutnya (berurutan)

1. Pemilik mengisi `AUTH_SECRET` untuk Production dan mengganti `DATABASE_URL` ke transaction pooler (langkah rinci di `docs/RELEASE_CHECKLIST.md`). Jangan meminta nilainya di chat.
2. Verifikasi lewat connector Vercel: nama variabel dan target (jangan dekripsi), redeploy Preview, `/api/health`, log runtime.
3. Pemilik mencoba alur inti di Preview lewat browser dan memberi persetujuan rilis secara eksplisit.
4. Hanya setelah persetujuan itu: cadangan baru, merge PR `delvin4ys/Monify#1`, verifikasi Production (urutan di checklist).
5. Setelah rilis: email reset password (Resend), Supabase Storage privat, rate limit lintas instance, naik ke Prisma 7, test E2E di repo, perapian UI mobile.

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
