# Arsitektur

Monify adalah **modular monolith**: satu aplikasi Express yang melayani API JSON dan frontend statis, dengan PostgreSQL sebagai satu-satunya sumber kebenaran.

## Struktur

```
server/
  index.js            titik masuk (lokal & Vercel)
  app.js              perakitan middleware: header keamanan → asset statis → sesi → halaman → API → error
  config.js           seluruh konfigurasi dari environment variable
  lib/                tanpa efek samping bisnis: errors, validate, dates, serializers, prisma
  middleware/         security (helmet/CSP, CSRF origin, requireAuth, rate limit), error
  routes/             tipis: validasi input → panggil service → bentuk respons
  services/           seluruh business logic
    ledger.js         SATU-SATUNYA tempat saldo dompet berubah
    transactions.js   transfers.js   debts.js   budgets.js   savings.js
    reports.js        users.js       wallets.js categories.js
    storage.js        receipts.js    mailer.js  audit.js
public/
  app.html            shell aplikasi (satu dokumen untuk semua halaman aplikasi)
  auth.html           masuk / daftar / lupa / reset password
  css/app.css         design system
  js/app/             modul ES: main (router), api, store (cache), ui, format, charts, forms, art, pages/*
prisma/               schema.prisma + migrations/
scripts/              dev-db, dev-local, seed-demo, perf
tests/                node:test
```

Aturan lapisan: `routes` tidak menyentuh Prisma untuk logika finansial; `services` tidak tahu soal HTTP; hanya `ledger.js` yang menulis `Wallet.balance`.

## Keputusan dan alasannya

### 1. Stack dipertahankan
Express + Prisma + PostgreSQL + JavaScript tanpa framework. Audit tidak menemukan masalah yang membutuhkan framework lain. Yang diganti adalah struktur (satu file 1.267 baris → lapisan di atas) dan cara frontend bernavigasi.

### 2. Frontend: shell + router sisi klien, tanpa build step
**Masalah** (audit P1): setiap pindah halaman memuat ulang dokumen, mengulang pemeriksaan sesi, dan menjalankan 5–6 request API berurutan.

**Keputusan**: satu dokumen `app.html`; router kecil di `main.js` mengganti isi `<main>`; tiap halaman adalah modul ES yang dimuat dengan `import()` dinamis (route-level code splitting bawaan browser) dan dipanaskan saat tautannya disentuh/di-hover.

**Kenapa bukan framework SPA**: kebutuhan interaksinya dipenuhi ±3.900 baris modul biasa; tanpa bundler berarti tanpa pipeline build untuk dirawat dan asset bisa di-cache selamanya lewat URL ber-hash (`/assets/<hash>/…`).

**Pergantian konten tidak bergantung pada animasi.** View Transitions hanya dipakai sebagai hiasan; swap konten dijamin tetap berjalan lewat timer karena browser menunda callback transisi saat tab tidak dirender (ditemukan saat pengujian).

### 3. Cache data: stale-while-revalidate di memori
`store.js` menyimpan respons GET per URL. Halaman menampilkan data cache seketika (tanpa skeleton), lalu memvalidasi ulang bila umurnya > 20 detik. **Setiap mutasi** — dari tab ini atau tab lain (BroadcastChannel) — menandai seluruh cache usang dan memuat ulang halaman aktif. Cache tidak pernah ditulis ke `localStorage`/`sessionStorage`; data finansial hanya hidup di memori tab. Server mengirim `Cache-Control: no-store` untuk semua respons API.

### 4. Saldo: disimpan, tetapi hanya diubah secara atomic
`Wallet.balance` tetap disimpan (membaca saldo O(1)), dengan tiga jaminan:
- perubahan memakai `increment`/`decrement` di database, bukan baca–hitung–tulis;
- pengurangan disertai syarat `balance >= jumlah` pada pernyataan `UPDATE` yang sama, sehingga race tidak bisa membuat saldo negatif;
- beberapa dompet dalam satu operasi diproses berurutan menurut id untuk mencegah deadlock.

Invarian `balance = initialBalance + Σ mutasi berstatus success` bisa diperiksa kapan saja (`GET /api/reconcile`) dan diperiksa di hampir setiap test.

### 5. `kind` menentukan perlakuan laporan
Setiap baris `Transaction` punya `kind` dan `direction`:

| kind | Masuk laporan pemasukan/pengeluaran? | Contoh |
|---|---|---|
| `income`, `expense` | Ya | Gaji, makan siang, bunga hutang |
| `transfer` | Tidak | Antar dompet sendiri; titipan ke/dari orang lain |
| `debt` | Tidak | Pokok pinjaman, pembayaran pokok |
| `adjustment` | Tidak | Koreksi saldo |

Laporan cukup memfilter `kind IN ('income','expense')`. Tidak ada lagi logika akuntansi yang bergantung pada nama kategori.

### 6. Transfer, hutang, dan tabungan adalah entitas tersendiri
- **Transfer**: satu baris `Transfer` + tepat dua baris `Transaction` (keluar di sumber, masuk di tujuan), dibuat/diubah/dihapus dalam satu transaksi database.
- **Hutang/piutang**: `Debt` + `DebtPayment`. Satu pembayaran = satu `DebtPayment` + satu `Transaction` berjenis `debt`. `outstanding` selalu dihitung ulang dari pembayaran. Bunga/biaya dicatat terpisah sebagai `expense`.
- **Tabungan**: `SavingsGoal` + `SavingsEntry`. Setoran default adalah *alokasi* (saldo dompet tidak berubah). Bila tujuan punya dompet tabungan dan setoran menyebut dompet sumber, dibuat `Transfer` nyata. Di kedua cara total saldo pengguna tidak bertambah.

### 7. Idempotency
`POST /api/transactions`, `/api/transfers`, dan `/api/debts/:id/payments` menerima header `Idempotency-Key`. Kunci unik per pengguna di database; request duplikat — termasuk yang tiba bersamaan — mengembalikan hasil yang sama tanpa membuat data kedua. Frontend membuat satu kunci per dialog dibuka.

### 8. Tanggal adalah tanggal kalender
Tanggal transaksi adalah `YYYY-MM-DD` pilihan pengguna, disimpan pada 12:00 UTC. Batas periode dihitung dari string tanggal, dan "hari ini" dikirim klien (`?today=`) dari jam lokal pengguna; server hanya memakai `APP_TIMEZONE` sebagai cadangan. Hasilnya tidak bergantung pada zona waktu server.

### 9. Uang
Integer dalam satuan terkecil (IDR: rupiah, USD: sen), kolom `BigInt`. Tidak ada floating-point. Nominal dibatasi 10¹⁵ sehingga aman dikirim sebagai angka JSON.

### 10. Sesi
Sesi di tabel `Session`. `touch()` bawaan (satu `UPDATE` per request) dimatikan; masa berlaku diperpanjang paling sering sekali sehari. ID sesi diganti saat login.

## Asumsi yang diambil

| Hal yang ambigu | Keputusan | Alasan |
|---|---|---|
| Transaksi lama berkategori "Transfer Masuk/Keluar" | Diklasifikasi ulang menjadi `transfer` (di luar laporan); pasangan yang cocok persis (pengguna, tanggal, nominal, dompet berbeda) digabung menjadi satu `Transfer` | Nama kategorinya menyatakan pemindahan dana. Bila ada yang sebenarnya pengeluaran, pengguna bisa mengubah jenisnya lewat edit transaksi. |
| `remainingAmount` hutang lama | Sisa dihitung ulang dari pembayaran yang benar-benar ada | Nilai lama bisa salah karena bug C4 (menghapus cicilan tidak mengembalikan sisa). |
| Saldo awal dompet lama | `initialBalance = balance − Σ mutasi` | Satu-satunya nilai yang membuat saldo saat ini tetap sama dan lolos rekonsiliasi. |
| Multi-mata uang | IDR default; ringkasan hanya menjumlahkan dompet bermata uang utama; transfer lintas mata uang ditolak; tanpa konversi kurs | Menjumlah lintas mata uang tanpa kurs menghasilkan angka salah. |
| Saldo dompet negatif | Ditolak (perilaku lama dipertahankan) | Konsisten untuk dompet tunai/debit. Dompet kartu kredit belum didukung. |
| Kategori bawaan | Tetap berbahasa Indonesia; tanpa kategori transfer/hutang | Aplikasi dan pengguna yang ada berbahasa Indonesia; transfer dan hutang kini fitur tersendiri. |
| Kursor kustom, parallax | Tidak dibuat | Aplikasi ini alat kerja, bukan landing page; keduanya tidak menambah nilai dan mengganggu aksesibilitas. |
| Model AI default | `claude-opus-5-5`, bisa diganti lewat `RECEIPT_MODEL` | Akurasi baca struk diutamakan; model yang lebih murah bisa dipilih pemilik proyek. |

## Skalabilitas

- Semua agregasi dilakukan database (`groupBy`, `date_trunc`) di atas index `(userId, date)` dan `(userId, kind, date)`; jumlah query per halaman tetap, tidak bergantung jumlah data.
- Daftar transaksi memakai pagination cursor.
- Di serverless, pakai pooler koneksi. Dashboard menjalankan ±15 query paralel; dengan `connection_limit=1` query itu antre berurutan, jadi gunakan `connection_limit` 5 atau lebih bila pooler mengizinkan.
- Rate limiter saat ini di memori per instance (lihat `SECURITY_GUIDELINES.md`).
- Belum ada background job; pindai struk berjalan sinkron dengan batas waktu 45 detik.
