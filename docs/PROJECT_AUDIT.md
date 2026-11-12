# Monify — Project Audit (Audit 1, Pre-Implementation)

| | |
|---|---|
| Tanggal audit | 12 November 2026 |
| Commit yang diaudit | `81805e5` (branch `main`, 29 commit, terakhir 2 April 2026) |
| Cakupan | Seluruh 76 file yang ter-track: `server/`, `prisma/`, `public/`, `scripts/`, konfigurasi |
| Metode | Inspeksi statis source code, baris per baris untuk backend dan modul frontend utama |

## 0. Batasan audit ini (baca dulu)

Temuan di bawah berasal dari **analisis statis** source code; setiap temuan menyertakan lokasi `file:baris` pada commit `81805e5` sebagai bukti. Saat audit ditulis, Node.js belum terpasang di mesin pengembangan dan tidak ada file `.env`, sehingga aplikasi belum bisa dijalankan.

Setelah Node.js dipasang (dengan persetujuan pemilik proyek), baseline performa versi lama **diukur** sebelum ada kode yang diubah — lihat §7.1. Yang tetap belum pernah diukur: Lighthouse dan perilaku pada deployment Vercel produksi (tidak ada akses ke sana). Temuan yang bergantung pada lingkungan produksi diberi tanda **(perlu verifikasi)**.

---

## 1. Existing technology stack

| Lapisan | Teknologi | Catatan |
|---|---|---|
| Runtime | Node.js (CommonJS) | Versi tidak dikunci (`engines` tidak ada di `package.json`) |
| Backend | Express 4.22 | Satu file `server/index.js` (1.267 baris) berisi semua route |
| ORM | Prisma 6.3 | `prisma db push`, **tanpa folder migrations** |
| Database | PostgreSQL | `schema.prisma:6`. `.env.example` masih menunjuk SQLite (`file:./dev.db`) — tidak sinkron |
| Sesi | `express-session` + `@quixo3/prisma-session-store` | Sesi disimpan di tabel `Session` |
| Auth | Email + password, `bcryptjs` cost 10 | Tanpa verifikasi email / reset password |
| Upload | `multer` (memory) → Supabase Storage bucket `uploads` | Bucket publik, memakai anon key |
| Frontend | HTML statis multi-halaman + vanilla JS (IIFE, `var`) + satu `styles.css` (2.840 baris) | Tanpa framework, tanpa bundler, tanpa build step |
| Hosting | Vercel (`@vercel/node`, konfigurasi `builds` legacy) | `vercel.json` |
| Testing | Tidak ada | Nol file test, tidak ada CI |
| Dokumentasi | Tidak ada | Tidak ada README |

Stack ini **dipertahankan**. Tidak ada temuan yang membenarkan penggantian framework atau database; semua masalah di bawah bisa diselesaikan di dalam Express + Prisma + vanilla JS.

## 2. Existing project architecture

```
Browser ──(full page load tiap navigasi)──> Express (server/index.js)
   │                                           ├─ express.static(public/)
   │  20 halaman HTML, masing-masing memuat    ├─ session middleware  ──> Postgres (tabel Session)
   │  api.js, format.js, auth.js, layout.js    ├─ ±35 route handler inline
   │  + 1 script halaman                       └─ server/lib/*  ──────> Postgres via Prisma
```

Ciri arsitektur saat ini:

- **Tanpa lapisan.** Validasi, otorisasi, business logic, dan query Prisma bercampur di dalam tiap handler `app.get/post(...)`. Logika yang sama (validasi transaksi, hitung saldo) disalin antara `POST` dan `PATCH /api/transactions`.
- **Saldo dompet adalah angka yang disimpan** (`Wallet.balance`) dan diubah dengan pola baca–hitung–tulis oleh setiap handler transaksi.
- **Hutang/piutang dimodelkan sebagai transaksi biasa** dengan kategori bertipe `debt` + `debtSubtype`, ditambah kolom `parentTransactionId`, `remainingAmount`, `paidOff` di tabel `Transaction`.
- **Transfer dimodelkan sebagai dua kategori** (`Transfer Masuk` = income, `Transfer Keluar` = expense).
- **Frontend merender lewat string concatenation ke `innerHTML`**, 67 pemakaian di 21 file, tanpa helper escaping.

## 3. Existing features dan statusnya

| Fitur | Status | Catatan |
|---|---|---|
| Register / login / logout | Berfungsi, belum aman untuk produksi | Lihat H3 |
| Forgot / reset password, verifikasi email, ganti password | **Tidak ada** | |
| Dompet: buat, edit, hapus, logo | Berfungsi, berisiko | Edit menimpa saldo langsung (C6); hapus menghapus semua transaksi (C5) |
| Tipe / warna dompet, saldo awal terpisah | **Tidak ada** | |
| Transaksi: buat, edit, hapus, lampiran, status pending | Berfungsi | Race condition saldo (C3) |
| Riwayat transaksi: pencarian, filter bulan | Sebagian | Tanpa pagination, tanpa filter kategori/tipe/rentang tanggal, tanpa sorting |
| Kategori + induk kategori | Sebagian | Bisa buat & hapus, **tidak bisa edit**; tanpa warna |
| Budget bulanan & rentang kustom, per kategori / per induk | Berfungsi | Tidak bisa per dompet; N+1 query (H6) |
| Hutang & piutang + cicilan | Sebagian, **integritas rusak** | Lihat C4 |
| Transfer antar dompet | **Salah secara akuntansi** | Dua transaksi manual, terhitung income/expense (C2) |
| Laporan rentang tanggal + chart 12 bulan | Sebagian | Hanya bar chart buatan tangan; tanpa perbandingan periode |
| Dashboard | Berfungsi | KPI “delta saldo” menyesatkan (M4) |
| Mode gelap | Sebagian | Hanya toggle manual, tanpa opsi system; warna bocor (M7) |
| Mata uang tampilan IDR/USD | Berfungsi tapi rapuh | Lihat M2 |
| Halaman admin (daftar pengguna) | Berfungsi | Rentan XSS (H1) |
| Savings goals, AI receipt scanner | **Tidak ada** | |

## 4. Database architecture

Tujuh model (`prisma/schema.prisma`): `User`, `CategoryParent`, `Wallet`, `Category`, `Budget`, `Transaction`, `Session`.

Temuan struktural:

| # | Temuan | Bukti |
|---|---|---|
| D1 | **Tidak ada satu pun index sekunder.** Postgres tidak otomatis membuat index untuk foreign key. Semua query memfilter `userId` dan hampir semua memfilter `date`, sehingga semuanya sequential scan. | `schema.prisma` — tidak ada `@@index` |
| D2 | `Transaction.parentTransactionId` **bukan foreign key**, hanya string. Tidak ada jaminan induk ada. | `schema.prisma:97` |
| D3 | `Budget.targetId` polimorfik (`CATEGORY`/`PARENT`) tanpa FK; kategori yang dihapus meninggalkan budget yatim (dibersihkan manual di satu handler saja). | `schema.prisma:73-74`, `index.js:1016` |
| D4 | Semua relasi `onDelete: Cascade`. Menghapus dompet atau kategori menghapus riwayat transaksi secara diam-diam. | `schema.prisma:86,88` |
| D5 | Nominal uang bertipe `Int` 32-bit. Batas atas Rp 2.147.483.647. Aman dari error floating-point, tapi satu dompet/aset di atas ±Rp 2,1 miliar gagal disimpan. | `schema.prisma:45,71,89` |
| D6 | Tipe, status, dan subtipe disimpan sebagai `String` bebas, tanpa enum atau CHECK constraint. | `schema.prisma:55,56,90,93` |
| D7 | Tidak ada constraint `amount > 0`, tidak ada unique constraint budget (cek duplikat dilakukan di aplikasi, rawan race). | `index.js:1104-1119` |
| D8 | Tidak ada riwayat migrasi. Perubahan skema lewat `db push`, sehingga tidak bisa di-review, di-rollback, atau direproduksi. | `package.json:9`, folder `prisma/` |
| D9 | Tidak ada kolom audit (`updatedAt`) pada data finansial, tidak ada idempotency key. | `schema.prisma` |
| D10 | Skrip one-off yang menyentuh **semua pengguna** tersimpan di repo: `wipe-wallets.js` menjalankan `wallet.deleteMany({})`, yang lewat cascade menghapus seluruh transaksi semua user. | `wipe-wallets.js:5` |

## 5. Security assessment

### Critical

**C1 — Endpoint destruktif tanpa autentikasi.**
`GET /api/tmp-fix-category-data` (`server/index.js:67-94`) didaftarkan *sebelum* middleware sesi dan tanpa `requireAuth`. Siapa pun yang membuka URL itu akan: menimpa ikon dan `parentId` kategori bernama Hutang/Pinjaman/Pelunasan/Penagihan Piutang milik **semua pengguna**, lalu menghapus baris `CategoryParent` dengan nama tersebut. Karena method-nya GET, crawler atau link preview pun bisa memicunya.

### High

**H1 — Stored XSS.** Data pengguna dimasukkan ke `innerHTML` tanpa escaping di seluruh frontend. Paling berbahaya di halaman admin: `u.email` dan `u.name` dirender mentah (`public/js/admin-users.js:17-36`), sementara registrasi menerima `name` apa saja (`server/index.js:243`). Pengguna yang mendaftar dengan nama berisi `<img src=x onerror=...>` menjalankan script di sesi admin. Pola yang sama ada pada judul transaksi, nama dompet, nama kategori, counterparty, dan nama di topbar (`layout.js:84`, `transactions.js:315,329,336`, `dashboard.js:313`, `wallets.js:172`, `liabilities.js:75`). Bahkan `onclick="window.openPaymentModal('${t.id}')"` menyuntik data ke atribut handler (`liabilities.js:103`).

**H2 — Upload tidak divalidasi dan lampiran bersifat publik.** `POST /api/upload` (`index.js:269-300`) tidak memeriksa MIME maupun ekstensi, memakai ekstensi asli dari nama file, dan mengembalikan `getPublicUrl`. Akibatnya (a) file `.html`/`.svg` bisa diunggah, (b) setiap struk bisa dibuka siapa saja yang tahu URL-nya, (c) tidak ada kepemilikan file per pengguna dan tidak ada mekanisme hapus.

**H3 — Kelemahan autentikasi & sesi.**
- Secret sesi punya fallback hardcoded `"ubah-auth-secret-di-env"` (`index.js:100`). Jika env tidak diset, cookie sesi bisa dipalsukan.
- Sesi tidak di-regenerate saat login (`index.js:172`) → session fixation.
- Tidak ada rate limiting pada login maupun register → brute force dan pendaftaran massal.
- Tidak ada reset password, ganti password, verifikasi email, maupun manajemen sesi.
- Validasi email hanya `includes("@")` (`index.js:244`).

**H4 — Pesan error internal bocor ke klien.** Hampir semua handler mengirim `e.message` di respons 500 (mis. `index.js:180,265,350,467`). Error Prisma memuat nama tabel, kolom, dan potongan query.

**H5 — Tidak ada security header.** Tanpa `helmet`, tanpa CSP, tanpa `X-Content-Type-Options`. Digabung dengan H1, tidak ada lapis pertahanan kedua.

### Medium

- **M-S1 — CSRF**: hanya mengandalkan `sameSite: "lax"`. Cukup untuk endpoint JSON `POST/PATCH/DELETE`, tetapi C1 membuktikan endpoint GET yang mengubah data lolos. Perlu pemeriksaan `Origin` eksplisit.
- **M-S2 — Halaman `/demo` publik** menampilkan kredensial akun demo (`public/demo.html`, `index.js:1212`), dan `ADMIN_EMAILS` di `.env.example` default-nya akun demo itu juga.
- **M-S3 — `/api/admin/users`** mengembalikan seluruh pengguna tanpa pagination.

### Yang sudah benar

- Isolasi data antar pengguna **konsisten di semua query**: setiap `findFirst/findMany` menyertakan `userId` dari sesi, dan kepemilikan dompet/kategori diperiksa sebelum dipakai (`index.js:372-375`). Tidak ditemukan IDOR pada route yang diaudit.
- Cookie `httpOnly`, `secure` di production, `sameSite: lax`.
- Password di-hash dengan bcrypt; pesan login tidak membedakan email salah dan password salah.
- Tidak ada raw SQL, sehingga tidak ada celah SQL injection.

## 6. Financial data integrity

Ini bagian paling serius bagi aplikasi keuangan.

**C2 — Transfer internal terhitung sebagai pemasukan dan pengeluaran.**
`Transfer Masuk` bertipe `income` dan `Transfer Keluar` bertipe `expense` (`server/lib/default-user-data.js:47-48`). Semua agregasi hanya melihat `category.type` (`report-stats.js:49-54`, `summary.js:59-69`, `monthly-income.js:43-49`). Memindahkan Rp 1.000.000 dari BRI ke BCA menaikkan total income **dan** total expense sebesar Rp 1.000.000, serta membutuhkan dua input manual yang tidak saling terhubung dan tidak atomic.

**C3 — Race condition pada saldo (lost update).**
Pola di semua handler: baca `wallet.balance` → hitung `nextBalance` di JavaScript → `update({ balance: nextBalance })` (`index.js:403-414`, `594-604`, `716-733`, `786-794`). Pembacaan terjadi **di luar** `prisma.$transaction`. Dua request bersamaan pada dompet yang sama membaca saldo yang sama, dan salah satu perubahan hilang. Hal yang sama berlaku untuk cicilan: `remainingAmount` dibaca di luar transaksi (`index.js:567`), sehingga dua pembayaran bersamaan bisa melebihi sisa hutang.

**C4 — Hutang/piutang bisa menjadi tidak konsisten.**
- Menghapus transaksi cicilan mengembalikan saldo dompet, tetapi **tidak** mengembalikan `remainingAmount` / `paidOff` induknya (`index.js:773-803`).
- Mengedit nominal cicilan tidak mengubah sisa hutang induk; mengedit nominal hutang induk tidak menghitung ulang `remainingAmount` (`index.js:736-751`).
- Menghapus hutang induk meninggalkan cicilan yatim yang tetap mengurangi saldo.
- Kategori `Cicilan Pinjaman`/`Pelunasan` bisa dipakai lewat form transaksi biasa tanpa hutang induk — uang keluar, tidak ada hutang yang berkurang.
- Tidak ada jatuh tempo, tidak ada riwayat pembayaran per hutang, `GET /api/liabilities` hanya menampilkan yang belum lunas.

**C5 — Menghapus dompet menghapus seluruh riwayatnya** tanpa validasi (`index.js:863-876` + cascade). Termasuk hutang induk yang cicilannya ada di dompet lain.

**C6 — Edit dompet menimpa saldo.** `PATCH /api/wallets/:id` menerima `balance` (`index.js:852-855`), dan form edit selalu mengirimkannya (`public/js/wallets.js:224`). Tidak ada catatan penyesuaian, sehingga saldo tidak bisa direkonsiliasi dengan transaksi. Saldo awal juga tidak dibedakan dari pemasukan — ia hanya angka awal di kolom `balance`.

**Temuan integritas lain (Medium):**

- **M1 — Batas `Int` 32-bit** (lihat D5); agregasi saldo total bisa overflow.
- **M2 — Mata uang transaksi diambil dari preferensi tampilan pengguna**, bukan dari dompet (`index.js:361-362`). Setelah pengguna mengganti tampilan ke USD, semua dompet IDR menolak transaksi (“Mata uang tidak cocok”, `index.js:383`). Halaman dompet juga menjumlahkan semua saldo tanpa melihat mata uang (`wallets.js:160`).
- **M3 — `/api/summary?currency=` mengabaikan parameternya** (`index.js:1028` memanggil `getFinancialSummary(userId)` saja).
- **M4 — KPI menyesatkan**: `balanceDeltaPct` sebenarnya diisi delta tabungan (`summary.js:89-90`); `expensesDeltaPct` bernilai 0 bila bulan lalu kosong (`summary.js:86-87`).
- **M5 — Zona waktu tidak konsisten.** Filter periode memakai waktu lokal server (`index.js:124-154`), laporan memakai batas UTC (`report-stats.js:17-18`), dan klien membuat tanggal dengan `toISOString()` (`dashboard.js:263-264`, `transaction-new.js:19`). Untuk pengguna WIB (UTC+7): sebelum pukul 07.00 tanggal default transaksi adalah **kemarin**, dan “awal bulan” di dashboard jatuh ke hari terakhir bulan sebelumnya.
- **M6 — Kategori investasi/tabungan diperlakukan sebagai pengeluaran** (`Saham / Reksa Dana`, `Tabungan Darurat`, `default-user-data.js:9,19`), sehingga memindahkan uang ke tabungan tampak sebagai konsumsi.

## 7. Performance bottlenecks

Akar masalah “pindah halaman sangat lambat” teridentifikasi dari kode. Bukan satu penyebab, melainkan enam yang saling mengalikan.

**P1 — Setiap navigasi adalah full page load dengan waterfall serial.** Urutan untuk Dashboard:

| Urutan | Request | Blocking? | Bukti |
|---|---|---|---|
| 1 | Dokumen HTML | ya | |
| 2 | `styles.css`, `theme-init.js` (render-blocking di `<head>`) | ya | `dashboard.html:9-10` |
| 3 | `api.js`, `format.js`, `auth.js`, `layout.js`, `dashboard.js` | ya | `dashboard.html:126-130` |
| 4 | `GET /api/auth/me` | **ditunggu** sebelum apa pun | `dashboard.js:3` |
| 5 | `GET /api/auth/me` (lagi) + `GET /api/admin/me` | paralel | `layout.js:74,112` |
| 6 | `GET /api/summary` | ditunggu | `dashboard.js:119` |
| 7 | `GET /api/monthly-income` | ditunggu | `dashboard.js:135` |
| 8 | `GET /api/wallets` | ditunggu | `dashboard.js:211` |
| 9 | `GET /api/reports` | ditunggu | `dashboard.js:265` |
| 10 | `GET /api/transactions` | ditunggu | `dashboard.js:294` |

Enam round-trip API berjalan **berurutan**, padahal lima di antaranya saling independen. Konten terakhir baru muncul setelah jumlah seluruh latency, bukan latency terbesar. Halaman lain memakai pola yang sama (`transaction-new.js:14-15`, `transaction-edit.js:19-24`, `budgets.js:26-27`, `settings-categories.js:42-43`).

**P2 — Jumlah query database per halaman sangat tinggi.**
- Tiap request ber-sesi membaca sesi dari Postgres dan menulis `touch`: ±2 query overhead per request.
- `GET /api/monthly-income` menjalankan **12 query berurutan**, satu per bulan, masing-masing menarik seluruh baris transaksi + join kategori lalu menjumlah di JavaScript (`monthly-income.js:20-56`).
- `GET /api/summary` menarik semua baris transaksi dua bulan lalu menjumlah di JavaScript (`summary.js:33-52`), padahal bisa satu `groupBy`.
- Total Dashboard: 8 request API ≈ 16 query sesi + ±21 query data ≈ **±37 query**, 12 di antaranya serial dalam satu request.
- `GET /api/budgets`: untuk tiap budget dijalankan 3–4 query berurutan (spent, label, ikon — `budget-queries.js:164-167`), lalu `getBudgetMonthSummary` **mengulang seluruh perhitungan** (`budget-queries.js:192`, dipanggil di `index.js:1049-1050`). Sepuluh budget ≈ 70 query serial.
- Registrasi menjalankan ±90 query berurutan (`default-user-data.js:51-70`, `system-parents.js:38-49`); timeout-nya sampai dinaikkan menjadi 30 detik (commit `19d80c2` “Perbaikan timeout registrasi”).

**P3 — Tidak ada index** (D1), sehingga setiap query di atas adalah sequential scan yang melambat seiring bertambahnya data seluruh pengguna.

**P4 — Tidak ada caching sama sekali.** Semua fetch memakai `cache: "no-store"` (`api.js:5`), tidak ada cache di memori klien, dan `express.static` memakai default `max-age=0` (`index.js:60`) sehingga CSS/JS/logo direvalidasi pada setiap navigasi.

**P5 — Asset statis dilayani oleh serverless function (perlu verifikasi di dashboard Vercel).** `vercel.json` hanya mendefinisikan satu build (`@vercel/node`) dan mengarahkan semua path ke `server/index.js`; folder `public/` tidak di-build sebagai output statis. Artinya setiap file CSS, JS, dan gambar memicu invokasi function (termasuk cold start), bukan dilayani CDN. Satu halaman = ±9 invokasi hanya untuk asset.

**P6 — Tanpa pagination.** `GET /api/transactions` mengembalikan semua baris yang cocok (`index.js:328-332`), `period=all` tanpa batas, dan seluruhnya dirender sebagai satu string HTML.

**Lain-lain:** logo 77 KB PNG ditampilkan pada 36 px dan dideklarasikan `type="image/jpeg"` (`dashboard.html:8`); listener `wheel` ditambahkan ulang setiap kali chip bulan diklik (`transactions.js:134`); tidak ada koneksi pooling yang dikonfigurasi untuk lingkungan serverless (`server/lib/prisma.js`).

### 7.1 Baseline terukur (versi lama, sebelum perubahan)

Kondisi: server versi lama (commit `81805e5`) + PostgreSQL 18 lokal di mesin yang sama (tanpa latency jaringan), Node 26, Windows 10. Dataset: 41 pengguna, 105.000 transaksi; pengguna yang diukur punya 5.000 transaksi, 4 dompet, 12 budget. Tiap halaman: urutan request API yang dijalankan frontend lama, median dari 5 kali. "Round-trip DB" dihitung dari statistik transaksi Postgres (`pg_stat_database`).

| Halaman | Request API | Median | Round-trip DB | Ukuran respons |
|---|---|---|---|---|
| Dashboard | 8 | 485 ms | 64 | 45,6 KB |
| Transaksi (bulan ini) | 5 | 102 ms | 24 | 42,0 KB |
| Transaksi (semua) | 5 | 797 ms | 23 | 2.453 KB |
| Budget (12 budget) | 6 | 1.007 ms | 235 | 12,3 KB |
| Laporan | 5 | 740 ms | 46 | 3,6 KB |

Registrasi pengguna baru: 919 ms. Asset statis: `Cache-Control: public, max-age=0`; `styles.css` 49,8 KB.

Cara membaca angka ini: tanpa jaringan pun Dashboard butuh ±0,5 detik dan Budget ±1 detik murni untuk bolak-balik ke database. Di produksi, setiap round-trip menambah latency jaringan server→database dan setiap request API menambah latency browser→server, **secara berurutan** — 64 round-trip pada 20 ms saja sudah 1,3 detik sebelum HTML, CSS, dan JS dihitung. Ini mengonfirmasi P1 dan P2 sebagai akar masalah.

Perbandingan dengan hasil setelah perbaikan ada di [`FINAL_QUALITY_AUDIT.md`](./FINAL_QUALITY_AUDIT.md).

## 8. UI/UX problems

| # | Masalah | Bukti |
|---|---|---|
| U1 | Tidak ada loading state. Halaman tampil dengan tanda “—” lalu terisi bertahap; tidak bisa dibedakan dari data kosong. | `dashboard.html:54-68` |
| U2 | Error ditelan. Kegagalan memuat dashboard hanya `console.error`, pengguna melihat halaman kosong. | `dashboard.js:328-330` |
| U3 | Tidak ada design system. 286 atribut `style=` inline dan 52 warna hex hardcoded di HTML/JS. | hitungan `grep` |
| U4 | Mode gelap dibuat sebagai ±40 selector override, bukan token; warna terang bocor (mis. latar ikon `#ecfdf5` di daftar transaksi dashboard). Tidak ada opsi “ikuti sistem”. | `styles.css:1651+`, `dashboard.js:311`, `theme-init.js` |
| U5 | Identitas visual tidak konsisten: komentar CSS menyebut “emerald”, token brand biru `#5478FF`, avatar kuning `#FFDE42`. | `styles.css:1,8`, `layout.js:85` |
| U6 | Hanya dua breakpoint (640 px dan 1023 px). Riwayat transaksi adalah tabel 7 kolom di semua ukuran layar. | `styles.css`, `transactions.js:231` |
| U7 | Dialog native: `confirm()` ganda untuk logout, `alert()` untuk error. | `layout.js:64-65`, `settings-currency.js:29`, `liabilities.js:138` |
| U8 | Memilih kategori berarti pindah halaman penuh dan menyimpan state form di `sessionStorage`. | `transaction-new.js:57-88` |
| U9 | Font sistem, tanpa skala tipografi; angka finansial tidak memakai tabular figures. | `styles.css:28` |
| U10 | Aksesibilitas: tombol ikon berupa karakter emoji (`✎`, `🗑`), label form tidak terhubung ke input (`for`/`id`), fokus tidak terkelola pada modal. | `wallets.js:167-168`, `login.html:24-27` |
| U11 | Tidak ada animasi bermakna maupun `prefers-reduced-motion`. | `styles.css` |

## 9. Scalability risks

1. **Biaya query tumbuh linear terhadap total data semua pengguna** (tanpa index + agregasi di JavaScript).
2. **Koneksi database di serverless**: tiap instance function membuat `PrismaClient` sendiri tanpa pooler → risiko kehabisan koneksi Postgres saat trafik naik.
3. **Sesi di database tanpa index kedaluwarsa**, dengan pembersihan periodik (`checkPeriod`) yang tidak berjalan andal di serverless.
4. **Respons tanpa batas ukuran** (transaksi, daftar pengguna admin).
5. **Monolit satu file** tanpa test: setiap perubahan berisiko regresi yang tidak terdeteksi.
6. **Tidak ada logging terstruktur, error tracking, maupun strategi backup** yang terdokumentasi.

## 10. Technical debt lain

- Tidak ada README, tidak ada dokumentasi API.
- `.env.example` tidak mencantumkan `SUPABASE_URL` / `SUPABASE_ANON_KEY` dan masih berisi URL SQLite.
- Folder `assets/logo/` terduplikasi sebagian di `public/assets/logo/`; hanya dua dari sembilan logo yang benar-benar ter-serve.
- Kode mati: `renderBalances()`, `fetchMonthsAndPaint()` (`transactions.js:154-161`), handler ganda di `reports.js:78-81` dan `171-178`.
- Format angka dan parsing nominal disalin di lima file (`wallets.js`, `transaction-new.js`, `transaction-edit.js`, `transactions.js`, `liabilities.js`).
- Skrip migrasi data one-off (`server/scripts/*`, `scripts/*`, `wipe-wallets.js`) tanpa dokumentasi kapan dijalankan.

## 11. Recommended improvements & prioritas

### Critical — harus diperbaiki segera

| ID | Perbaikan |
|---|---|
| C1 | Hapus endpoint `/api/tmp-fix-category-data`. |
| C2 | Transfer internal sebagai entitas tersendiri (satu input, dua sisi, atomic) dan dikeluarkan dari income/expense. Migrasikan pasangan Transfer Masuk/Keluar lama. |
| C3 | Semua perubahan saldo memakai `increment` atomic di dalam transaksi database, dengan pembacaan ulang di dalam transaksi. |
| C4 | Model hutang/piutang tersendiri dengan riwayat pembayaran; hapus/edit pembayaran menghitung ulang sisa. |
| C5 | Hapus dompet ditolak bila masih punya transaksi (tawarkan arsip). Pindahkan `wipe-wallets.js` keluar dari repo aktif. |
| C6 | Saldo awal sebagai field terpisah; perubahan saldo manual dicatat sebagai penyesuaian. |

### High — sebelum production

| ID | Perbaikan |
|---|---|
| H1 | Helper escaping terpusat; semua render memakainya; CSP sebagai lapis kedua. |
| H2 | Allowlist tipe file dengan pemeriksaan magic bytes, nama file acak, bucket privat + signed URL per pengguna, endpoint hapus. |
| H3 | Wajibkan `AUTH_SECRET`, regenerate sesi saat login, rate limit, reset & ganti password. |
| H4, H5 | Error handler terpusat dengan pesan aman; `helmet`. |
| D1, D8 | Tambah index; pindah ke `prisma migrate` dengan baseline dari skema saat ini. |
| P1–P6 | Lihat `DEVELOPMENT_ROADMAP.md` fase performa. |
| — | Test otomatis untuk seluruh logika finansial. |

### Medium

M1–M6, M-S1–M-S3, U1–U11, pemisahan `server/index.js` menjadi routes/services/middleware, pagination, konsistensi zona waktu.

### Low

Kode mati, duplikasi asset, optimasi logo, dokumentasi skrip one-off.

---

Rencana pengerjaan beserta urutan dependensinya ada di [`DEVELOPMENT_ROADMAP.md`](./DEVELOPMENT_ROADMAP.md).
