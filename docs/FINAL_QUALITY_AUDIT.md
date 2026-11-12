# Final Quality Audit (Audit 2, Post-Implementation)

| | |
|---|---|
| Tanggal audit | 12 November 2026 (audit ulang; menggantikan versi sebelumnya di tanggal yang sama) |
| Yang diaudit | Branch `revamp/v1-foundation` di commit `bdb9924` + perbaikan runner test di sesi ini |
| Pembanding | Master prompt proyek, [`PROJECT_AUDIT.md`](./PROJECT_AUDIT.md), ISO/IEC 25010:2023 |

## Cara membaca

Status diberikan secara konservatif:

- **PASS** — diimplementasikan dan diverifikasi oleh test atau pengujian yang dijalankan pada sesi audit ini.
- **PARTIAL** — ada sebagian, atau ada tetapi baru sebagian tervalidasi.
- **FAIL** — belum memenuhi requirement.
- **NOT TESTED** — implementasi ada, tetapi tidak bisa diverifikasi dari lingkungan audit.

Versi sebelumnya memberi PASS pada sejumlah baris berdasarkan pengujian manual di browser yang tidak bisa diulang. Di versi ini baris seperti itu hanya PASS bila diuji ulang; selebihnya diturunkan menjadi PARTIAL.

Sumber bukti (semua dijalankan pada sesi ini kecuali disebut lain):

| Kode | Bukti |
|---|---|
| **T** | `npm test` — 70 test, 70 lolos, 0 gagal (Postgres tertanam, seluruh migrasi diterapkan). Nama file test disebut di tiap baris. |
| **V** | `vercel build` lokal (target preview) lalu bundel fungsi hasil build dijalankan dengan `VERCEL=1` di belakang emulasi routing `config.json`. |
| **E** | Playwright (Chromium headless) terhadap bundel V dengan data demo: login, 8 halaman × 3 viewport (1280, 768, 375 px), alur tambah pengeluaran dan transfer lewat UI, ganti tema. |
| **G** | Status commit dan komentar bot Vercel di GitHub pada PR `delvin4ys/Monify#1`. |
| **K** | Inspeksi kode saja (tidak cukup untuk PASS pada fitur keuangan/keamanan). |

## Ringkasan

| Status | Jumlah baris |
|---|---|
| PASS | 58 |
| PARTIAL | 34 |
| FAIL | 7 |
| NOT TESTED | 5 |

Kesimpulan: **logika finansial dan isolasi data di backend kuat dan teruji; proyek belum siap produksi** karena deployment nyata, migrasi data produksi, dan integrasi eksternal belum pernah diverifikasi, dan ada dependency dengan celah keamanan yang belum diperbarui.

## 0. Build & deployment Vercel

| Requirement | Expected result | Actual result | Evidence/Test | Status | Next action |
|---|---|---|---|---|---|
| `vercel.json` valid | JSON valid, rute benar | Valid sejak `bdb9924`. Di `e28f50b` file ini bukan JSON valid (`\.` dengan satu backslash) — itulah penyebab build preview gagal | T `config`; `JSON.parse` pada kedua commit | PASS | — |
| Build Vercel | Build selesai tanpa error | `vercel build` lokal sukses; status Vercel di commit `bdb9924`: "Deployment has completed" / Ready | V, G | PASS | — |
| Bundel fungsi lengkap | Server, Prisma engine, dan `public/` ikut terbawa | Semua ada; `/api/health`, `/login`, halaman 404, dan redirect berjalan dari bundel | V | PASS | — |
| Routing asset statis | CSS/JS/font dilayani statis dengan cache yang benar, bukan lewat fungsi | 198 request asset → semuanya dari output statis; `/assets/<hash>/…` `immutable`, selebihnya 1 jam. CDN Vercel sungguhan belum diamati | V, E | PARTIAL | Cek header `x-vercel-cache` di preview |
| Aplikasi berjalan di preview Vercel | Halaman dan API merespons benar | `/api/health` 200 dan halaman login tampil dari deployment `dpl_J6s2…`; pemilik berhasil login dengan akun lama. Alur lain di preview belum diuji satu per satu | Connector Vercel (fetch + log runtime); konfirmasi pemilik | PARTIAL | Uji transaksi, transfer, dan hutang di preview |
| `AUTH_SECRET` di Vercel | Terisi ≥ 32 karakter di environment Preview dan Production | Sebelumnya tidak ada sama sekali; kini terisi untuk **Preview**. Production belum | Daftar env Vercel; fungsi termuat di preview | PARTIAL | Isi untuk Production saat rilis |
| Skema database cocok dengan kode | Migrasi v1 sudah diterapkan pada database yang dipakai deployment | Diterapkan pada database Supabase (dipakai Preview dan Production) dalam satu transaksi; riwayat migrasi Prisma tercatat | SQL verifikasi setelah migrasi | PASS | — |
| Versi Node deployment | Sama dengan yang diuji | `engines.node` = `>=20`; Vercel memilih major terbaru yang tersedia, sedangkan test dijalankan di Node 22 | V (`.vc-config.json`), K | PARTIAL | Kunci ke satu major (mis. `22.x`) |
| CI/CD | Test otomatis berjalan pada setiap push | Tidak ada workflow CI; hanya build otomatis Vercel | tidak ada folder `.github` | FAIL | Tambah workflow yang menjalankan `npm test` |

## 1. Performa

| Requirement | Expected result | Actual result | Evidence/Test | Status | Next action |
|---|---|---|---|---|---|
| Transisi halaman ≤ 1 detik | Navigasi terasa instan | 55–417 ms per perpindahan (klik sampai konten tampil), server dan database lokal tanpa latency jaringan | E | PARTIAL | Ukur di deployment nyata |
| Skeleton loading | Skeleton sesuai layout; tidak tertinggal; beda dari kosong dan error | Kode skeleton ada di 8 halaman; setelah data dimuat tidak ada skeleton tersisa di 24 kombinasi halaman × viewport. Tampilan skeleton saat memuat tidak diamati | E, K | PARTIAL | Uji dengan jaringan diperlambat |
| Request & query efisien | Sedikit request, agregasi di database | Satu endpoint per halaman, agregasi `groupBy`/`date_trunc`, index pada kolom filter. Pengukuran `npm run perf` tidak diulang | K, migrasi v1 | PARTIAL | Jalankan ulang `npm run perf` |
| Pagination data besar | Tidak memuat semua transaksi | Cursor, maksimal 100 per halaman, total dihitung database | T `ledger` | PASS | — |
| Cache tanpa data finansial usang | Angka selalu terbaru setelah perubahan | API `no-store`; dashboard menampilkan transaksi baru tanpa muat ulang | T `auth`, E | PASS | — |
| Code splitting & prefetch | Kode halaman dimuat saat perlu | `import()` per rute + `modulepreload` | K, E (tanpa error muat modul) | PARTIAL | — |
| LCP ≤ 2,5 dtk, INP ≤ 200 ms, CLS ≤ 0,1 | Memenuhi target | Belum pernah diukur | — | NOT TESTED | Lighthouse pada preview |

## 2. Autentikasi & pengguna

| Requirement | Expected result | Actual result | Evidence/Test | Status | Next action |
|---|---|---|---|---|---|
| Registrasi, login, logout | Berfungsi; sesi aman | Sesi di-regenerate saat login, cookie HttpOnly + SameSite, bcrypt | T `auth`; E (login lewat UI) | PASS | — |
| Lupa & reset password | Token aman, sekali pakai | Token 60 menit, hanya hash disimpan, respons sama untuk email terdaftar/tidak | T `auth` | PASS | — |
| Pengiriman email reset | Email benar-benar terkirim | Lewat Resend bila dikonfigurasi; belum pernah dijalankan dengan API key. Di production tanpa konfigurasi, reset password tidak bisa dipakai | K | NOT TESTED | Isi `RESEND_API_KEY`, `MAIL_FROM`, `APP_URL` lalu uji |
| Verifikasi email | Email diverifikasi saat mendaftar | Belum dibuat | K | FAIL | Buat setelah email aktif |
| Protected routes | Tanpa login tidak bisa mengakses halaman maupun API | API 401; halaman dialihkan ke `/login` di server | T `auth`; E | PASS | — |
| Isolasi data antar pengguna | Pengguna A tidak bisa membaca/mengubah data B | Ditolak pada dompet, transaksi, transfer, hutang, tabungan, budget, laporan, lampiran | T `isolation` (test case 4) | PASS | — |
| Row-Level Security | Dievaluasi sebagai lapisan tambahan | Sebelumnya semua tabel terbaca lewat API publik Supabase dengan anon key (RLS mati). Kini RLS aktif di semua tabel tanpa policy: API publik tertutup, aplikasi tetap berjalan lewat Prisma | SQL (`relrowsecurity`); login pemilik berhasil sesudahnya | PASS | Aktifkan RLS pada setiap tabel baru |
| Hak admin | Hanya admin sah | Admin = email di `ADMIN_EMAILS`. Karena email tidak diverifikasi, siapa pun yang lebih dulu mendaftar dengan email itu menjadi admin | T `isolation` (akses), K (celah) | PARTIAL | Daftarkan akun admin lebih dulu; tambah verifikasi email |
| Profil, ganti password, hapus akun | Berfungsi dengan konfirmasi | Ganti password mengakhiri sesi lain; hapus akun butuh password | T `auth` | PASS | — |
| Manajemen sesi | Melihat dan mengakhiri sesi | Jumlah sesi aktif + keluar dari perangkat lain; tanpa daftar per perangkat | T `auth` | PARTIAL | — |

## 3. Dompet, kategori, transaksi

| Requirement | Expected result | Actual result | Evidence/Test | Status | Next action |
|---|---|---|---|---|---|
| Dompet: buat, ubah, tipe, ikon, warna | Lengkap | Lengkap + arsip | T `ledger`; E (halaman tampil) | PASS | — |
| Hapus dompet dengan validasi | Riwayat tidak hilang diam-diam | Ditolak bila punya riwayat; FK `RESTRICT` | T `ledger`, `migration` | PASS | — |
| Saldo awal ≠ pemasukan | Tidak masuk laporan | Kolom terpisah, tanpa transaksi | T `ledger` | PASS | — |
| Saldo berjalan konsisten | Saldo = saldo awal + Σ mutasi | Rekonsiliasi nol selisih, termasuk setelah transaksi lewat UI | T `ledger`; E (`/api/reconcile`) | PASS | — |
| Pilihan dompet default | Preset bank/e-wallet umum | Logo tersedia untuk sebagian (BCA, BRI, OVO, dll.); Mandiri, GoPay, DANA tanpa logo | K | PARTIAL | Lengkapi aset |
| Transaksi: tambah, ubah, hapus | Saldo ikut berubah dengan benar | Atomic lewat ledger; tambah lewat UI mengubah saldo dan total dengan tepat | T `ledger`; E | PASS | — |
| Nominal > 0 divalidasi backend | Ditolak di server | Integer positif + `CHECK` di database | T `ledger`, `unit`, `migration` | PASS | — |
| Form transaksi | Mudah dipakai | Berfungsi; menekan Enter tidak menyimpan (tombol Simpan di luar `<form>`) | E | PARTIAL | Hubungkan tombol ke form |
| Lampiran transaksi | Opsional, privat | Backend teruji; unggah lewat UI tidak diuji | T `receipts`, `unit` | PARTIAL | Uji lewat UI |
| Kategori kustom | Buat, ubah, hapus dengan pemeriksaan, ikon, warna, per jenis | Lengkap + arsip + grup | T `ledger` | PASS | — |
| Riwayat: cari, filter, sort, pagination, total | Lengkap | Lengkap di API; halaman tampil benar | T `ledger`; E | PASS | — |
| Tanggal transaksi = pilihan pengguna | Bukan tanggal dibuat | Tanggal kalender, tidak bergeser oleh zona waktu | T `ledger`, `unit` | PASS | — |

## 4. Transfer, hutang & piutang

| Requirement | Expected result | Actual result | Evidence/Test | Status | Next action |
|---|---|---|---|---|---|
| Transfer internal satu langkah | Satu input, dua dompet berubah, atomic | BRI 5jt → BCA 2jt, pindah 1jt: 4jt / 3jt, total tetap. Lewat UI: −100.000 / +100.000, total tetap | T `transfers` (test case 1); E | PASS | — |
| Transfer bukan income/expense | Tidak masuk laporan | Dikecualikan | T `transfers`, `reports`; E | PASS | — |
| Idempotency & konkurensi transfer | Tanpa duplikat, tanpa deadlock | Kunci sama dieksekusi sekali; arah berlawanan bersamaan tetap konsisten | T `transfers` | PASS | — |
| Ubah/hapus transfer | Kedua dompet tetap konsisten | Konsisten | T `transfers` | PASS | — |
| Transfer eksternal | Pengguna memilih expense atau non-expense | Keduanya | T `transfers` | PASS | — |
| Hutang vs piutang | Dua konsep terpisah | `PAYABLE` / `RECEIVABLE` | T `debts` | PASS | — |
| Pembayaran hutang | Sebagian/penuh; sisa, riwayat, saldo ikut berubah dalam satu input | Hutang 5jt bayar 1jt → sisa 4jt, satu riwayat, dompet −1jt | T `debts` (test case 2) | PASS | — |
| Pokok hutang tidak dihitung ganda | Bukan expense kedua | Jenis `debt` di luar laporan; bunga/biaya sebagai expense terpisah | T `debts` | PASS | — |
| Kelebihan bayar, bersamaan, duplikat | Ditolak / sekali saja | Semuanya terjaga | T `debts` | PASS | — |
| Ubah/hapus pembayaran; penagihan piutang | Sisa dan saldo dihitung ulang | Benar | T `debts` | PASS | — |
| Bayar hutang dari form transaksi | Mode "Hutang" di form memperbarui catatan hutang | Mode ada di form; alur lewat UI tidak diuji | K | PARTIAL | Uji lewat UI |

## 5. Budget & tabungan

| Requirement | Expected result | Actual result | Evidence/Test | Status | Next action |
|---|---|---|---|---|---|
| Budget per kategori & per dompet | Tidak tercampur antar dompet | Terpisah; transfer tidak mengurangi budget | T `budgets-savings` | PASS | — |
| Budget grup & rentang kustom; progres dan sisa | Ada | Ada | T `budgets-savings` | PASS | — |
| Notifikasi over-budget | Peringatan sesuai tingkat | Status 80% / 100% di halaman Budget dan Dashboard; tanpa email/push | T `budgets-savings` (status), K | PARTIAL | — |
| Savings goals | Target, tanggal, setor, tarik, progres, estimasi | Ada | T `budgets-savings` | PASS | — |
| Tabungan tidak menggandakan saldo | Total saldo tetap | Alokasi tidak mengubah saldo; pemindahan nyata memakai transfer internal | T `budgets-savings` | PASS | — |
| Tabungan: request ganda / bersamaan | Tidak tercatat dua kali | Tidak ada idempotency key untuk setoran; penarikan bersamaan tidak diuji | K | PARTIAL | Tambah idempotency + uji konkurensi |
| Animasi celengan | Koin masuk, progres naik | Kode animasi ada; tidak diamati berjalan | K | PARTIAL | Uji visual |

## 6. Laporan & analitik

| Requirement | Expected result | Actual result | Evidence/Test | Status | Next action |
|---|---|---|---|---|---|
| Dashboard | Saldo, income, expense, arus kas, hutang, piutang, tabungan, budget, transaksi terakhir | Semua ada dalam satu request dan tampil | T `reports`; E | PASS | — |
| Surplus / defisit / seimbang | Income 10jt, expense 7jt, transfer 2jt → surplus 3jt | Benar | T `reports` (test case 3) | PASS | — |
| Rentang kustom & granularitas | Harian–tahunan, batas inklusif | Benar | T `reports`, `unit` | PASS | — |
| Perbandingan periode, kategori tertinggi/terendah, insight | Ada, tanpa persentase palsu | Ada | T `reports` | PASS | — |
| Transaksi tertunda | Tidak masuk laporan maupun saldo | Benar | T `reports` | PASS | — |
| Tujuh visualisasi | Sesuai daftar di brief | Halaman Laporan tampil tanpa error di 3 viewport; tiap grafik tidak diperiksa satu per satu | E | PARTIAL | Uji per grafik |
| Multi-mata uang | Tidak dicampur tanpa konversi | Laporan per mata uang; transfer lintas mata uang ditolak. Budget tidak memfilter mata uang; mata uang dompet mengikuti preferensi tampilan saat dibuat; USD tidak diuji | K | PARTIAL | Batasi ke IDR atau uji USD |

## 7. AI receipt scanner

| Requirement | Expected result | Actual result | Evidence/Test | Status | Next action |
|---|---|---|---|---|---|
| Konfirmasi sebelum simpan | AI tidak pernah menyimpan transaksi | Hasil hanya draf; tidak ada transaksi atau perubahan saldo sebelum konfirmasi | T `receipts` (klien AI tiruan) | PASS | — |
| Keamanan | Key di backend, validasi file, privat, persetujuan, hapus gambar | Semuanya | T `receipts`, `unit` | PASS | — |
| Fallback manual | Tetap bisa input manual | Tanpa konfigurasi → 503 dan fitur disembunyikan; error AI → pesan aman | T `receipts` | PASS | — |
| Ekstraksi dari struk nyata | Membaca merchant, total, tanggal, dst. | Request ke API belum pernah dijalankan. Bentuk request sesuai dokumentasi API saat ini, tetapi belum terbukti | K | NOT TESTED | Isi `ANTHROPIC_API_KEY`, uji dengan beberapa struk |
| Confidence indicator | Ditampilkan per kolom | Data tersedia; tampilan belum dilihat | T `receipts` (data) | PARTIAL | Uji bersama baris di atas |

## 8. Pengaturan, desain, responsif

| Requirement | Expected result | Actual result | Evidence/Test | Status | Next action |
|---|---|---|---|---|---|
| Tema gelap / terang / sistem | Langsung berlaku dan persisten | Sistem gelap → gelap; pindah ke terang berlaku, bertahan setelah muat ulang, tersimpan di profil | E | PASS | — |
| Preferensi tanggal, angka, mata uang, dompet default | Tersimpan | Tersimpan di API; pengaruh ke tampilan tidak diuji | T `auth` | PARTIAL | — |
| Preferensi bahasa & notifikasi | Jika memungkinkan | Belum dibuat | K | FAIL | — |
| Identitas visual | Dark lava-red, premium, minimalis | Diterapkan di semua halaman (screenshot gelap dan terang). Default mengikuti tema sistem, bukan selalu gelap. Belum dinilai pemilik produk | E (screenshot) | PARTIAL | Review pemilik |
| Responsif | Layak di desktop, tablet, mobile | 8 halaman × 3 viewport tanpa scroll horizontal dan tanpa error; sidebar ↔ tab bar. Di 375 px filter Transaksi memakan satu layar dan tombol tambah menutupi sebagian kartu | E | PARTIAL | Rapikan dua hal itu |
| Lintas browser | Chrome, Firefox, Safari | Hanya Chromium | E | NOT TESTED | — |
| `prefers-reduced-motion` | Dihormati | Ada di CSS dan JS; tidak diuji dengan emulasi | K | PARTIAL | — |
| Aksesibilitas | Accessible | Label, aria, skip link ada; belum diaudit alat | K | PARTIAL | Audit axe |
| Custom cursor, parallax, scroll reveal | Bila menambah nilai | Sengaja tidak dibuat | K | FAIL | Opsional |
| Design system terdokumentasi | Token dan komponen | `DESIGN_SYSTEM.md` ada; tidak dicocokkan baris per baris dengan kode | K | PARTIAL | — |

## 9. Keamanan, integritas, skalabilitas

| Requirement | Expected result | Actual result | Evidence/Test | Status | Next action |
|---|---|---|---|---|---|
| Otorisasi sisi server | Setiap query dibatasi pemilik | Ya | T `isolation` | PASS | — |
| Password hashing | Aman | bcrypt cost 12 | T `auth` | PASS | — |
| CSRF | Request tulis lintas situs ditolak | SameSite + pemeriksaan Origin | T `auth` | PASS | — |
| Cookie & sesi aman | HttpOnly, SameSite, Secure di production | Ya; cookie Secure terbit pada bundel Vercel | T `auth`; V | PASS | — |
| Header keamanan | CSP dan header standar | helmet + CSP tanpa skrip inline | T `auth` | PASS | — |
| Error tidak membocorkan detail | Pesan umum | Pesan umum + nomor referensi | T `auth`; V | PASS | — |
| Unggahan aman | Tipe dari isi file, batas ukuran, privat | Ya | T `receipts`, `unit` | PASS | — |
| SQL injection | Query terparameter | Prisma + template terikat; tanpa test khusus | K | PARTIAL | — |
| XSS | Output di-escape | Template meng-escape + CSP; tanpa test payload di browser | K, T `auth` (CSP) | PARTIAL | Tambah test E2E |
| Rate limiting | Membatasi percobaan | Di memori per instance; di serverless batas efektif longgar | T `auth` | PARTIAL | Pindahkan ke penyimpanan bersama |
| Dependency tanpa celah diketahui | `npm audit` bersih | 10 temuan (1 critical, 8 high), termasuk `proxy-addr` (pemalsuan IP — berpengaruh pada rate limit), `body-parser`, `path-to-regexp`, `qs` | `npm audit` | FAIL | `npm audit fix` lalu `npm test` |
| Secrets | Tidak di-hardcode; gagal aman | Semua dari env; tanpa `AUTH_SECRET` server menolak menyala | K; V | PASS | — |
| Uang tanpa floating-point | Integer / decimal | `BigInt` satuan terkecil | T `unit`, `migration` | PASS | — |
| Perubahan saldo atomic, tanpa race | Tidak ada update hilang, saldo tidak negatif | Ledger dengan syarat pada `UPDATE` | T `ledger`, `transfers`, `debts` | PASS | — |
| Cegah transaksi duplikat | Idempotency | Transaksi, transfer, pembayaran hutang. Belum: setoran tabungan, pembuatan hutang | T; K | PARTIAL | Lengkapi |
| Audit metadata | Jejak aktivitas finansial | `AuditLog` ditulis dalam transaksi yang sama; isinya tidak diperiksa test | K | PARTIAL | Tambah assertion |
| Migrasi non-destruktif | Aditif, teruji pada data lama | Lolos pada data lama buatan dan database kosong | T `migration` | PASS | — |
| Migrasi pada data produksi | Diterapkan dengan backup | Diterapkan 12 Nov 2026. Cadangan di skema `backup_v0_20261112`. Jumlah baris sama (15 pengguna, 23 dompet, 134 transaksi); saldo, nominal, tanggal tidak berubah; rekonsiliasi 0 selisih. 17 dari 37 baris transfer lama tidak berpasangan dan tetap berjenis transfer | SQL perbandingan dengan cadangan | PASS | Hapus skema cadangan setelah rilis stabil |
| Penyimpanan lampiran di production | Privat dan persisten | Tanpa Supabase, file ditulis ke `/tmp` fungsi (hilang). Dengan Supabase belum diuji; kode masih menerima anon key sebagai cadangan | K | NOT TESTED | Isi service-role key + bucket privat, uji |
| Lampiran lama | Tidak publik | Unggahan versi lama tetap ber-URL publik | K | FAIL | Migrasikan ke bucket privat |
| Monitoring & error tracking | Ada | Hanya `console` dengan nomor referensi | K | PARTIAL | Pasang layanan error tracking |
| Backup database | Strategi berjalan | Hanya disebut di dokumentasi | K | PARTIAL | Tetapkan jadwal backup |

## 10. Dokumentasi & testing

| Requirement | Expected result | Actual result | Evidence/Test | Status | Next action |
|---|---|---|---|---|---|
| Sembilan dokumen di `docs/` + README | Ada dan berisi | Semua ada dan berisi; tidak semuanya dicocokkan dengan kode | K | PARTIAL | — |
| Test otomatis backend | Unit, integrasi, finansial, keamanan, migrasi | 70 test lolos | T | PASS | — |
| Test otomatis frontend / E2E | Ada di repository | Tidak ada; pengujian E pada audit ini dijalankan dengan skrip sementara | K | FAIL | Masukkan test E2E ke repo |
| Empat test case finansial di brief | Lolos | Lolos | T `transfers`, `debts`, `reports`, `isolation` | PASS | — |

## Perubahan selama sesi audit

- `server/app.js`: kegagalan koneksi awal database tidak lagi mematikan proses. Di preview Vercel tercatat satu kali "Can't reach database server" saat cold start yang membuat fungsi keluar; kini hanya dicatat dan Prisma menyambung ulang pada query berikutnya.
- Infrastruktur (lewat connector, atas persetujuan pemilik): project Supabase diaktifkan kembali, migrasi v1 diterapkan dengan cadangan, RLS diaktifkan, `AUTH_SECRET` dipasang untuk Preview, preview di-redeploy.
- Catatan: kode lama di `main` tidak lagi aman dipakai terhadap database ini (daftar transaksi gagal bila ada baris tanpa kategori; tulisannya tidak terklasifikasi).
- Risiko terbuka: fungsi Vercel berjalan di `iad1` sedangkan database di Singapura, dan `DATABASE_URL` memakai session pooler (port 5432).

- `scripts/dev-db.mjs`: Postgres tertanam kini bisa berjalan saat proses dijalankan sebagai root (container CI/Docker). Tanpa ini `npm test` gagal start di lingkungan seperti itu.
- `README.md`, `docs/TESTING_STRATEGY.md`: jumlah test diperbarui menjadi 70.
- Tidak ada perubahan pada kode aplikasi, skema, atau `vercel.json`.

## Yang belum selesai

**P0 — sebelum preview/produksi bisa dipakai**

1. Pastikan `AUTH_SECRET` (≥ 32 karakter) dan `DATABASE_URL` terisi di Vercel untuk Preview dan Production.
2. Backup database, lalu jalankan `npm run db:baseline` dan `npm run db:deploy`.
3. Verifikasi preview secara nyata (login, satu transaksi, satu transfer).
4. Perbarui dependency yang punya celah (`npm audit fix`), jalankan ulang test.

**P1 — sebelum dibuka ke pengguna**

5. Supabase Storage dengan service-role key dan bucket privat; migrasikan lampiran lama.
6. Email (Resend) untuk reset password, lalu verifikasi email.
7. Daftarkan akun admin sebelum mengisi `ADMIN_EMAILS`.
8. Uji pemindai struk dengan API key sungguhan.
9. CI yang menjalankan `npm test`; kunci versi Node.
10. Rate limit dengan penyimpanan bersama.
11. Idempotency untuk setoran tabungan dan pembuatan hutang.

**P2 — peningkatan**

12. Test E2E di repository; Lighthouse; uji Firefox/Safari; audit aksesibilitas.
13. Perbaikan UI: Enter pada form transaksi, filter Transaksi di mobile, tombol tambah menutupi kartu.
14. Preferensi bahasa dan notifikasi; kebijakan multi-mata uang.
15. Error tracking dan jadwal backup.
