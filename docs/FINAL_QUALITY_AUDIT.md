# Final Quality Audit (Audit 2, Post-Implementation)

| | |
|---|---|
| Tanggal | 12 November 2026 |
| Yang diaudit | Working tree di atas commit `81805e5` (belum di-commit) |
| Pembanding | Brief proyek, [`PROJECT_AUDIT.md`](./PROJECT_AUDIT.md), referensi desain, ISO/IEC 25010:2023 |

## Arti status

- **PASS** — diimplementasikan dan diverifikasi oleh test otomatis atau pengujian yang benar-benar dijalankan (disebutkan di kolom bukti).
- **PARTIAL** — sebagian diimplementasikan, atau diimplementasikan tetapi baru sebagian terverifikasi.
- **FAIL** — belum memenuhi kebutuhan.
- **NOT TESTED** — ada implementasinya, tetapi belum bisa diverifikasi di lingkungan ini.

Tidak ada status PASS yang diberikan hanya dari tampilan.

Bukti yang dipakai:
- **T** = test otomatis (`npm test`, 67/67 lolos; nama file disebutkan).
- **B** = pengujian manual di browser (Chromium, server lokal, data demo) — klik lewat UI lalu memeriksa hasilnya lewat API.
- **P** = pengukuran `npm run perf`.

## Ringkasan

| Status | Jumlah baris |
|---|---|
| PASS | 58 |
| PARTIAL | 10 |
| FAIL | 3 |
| NOT TESTED | 7 |

Yang paling penting untuk diketahui sebelum produksi:

1. **Migrasi database belum dijalankan di produksi.** Sudah diuji pada data berbentuk lama di database lokal, tetapi belum pernah menyentuh data nyata. Butuh backup lebih dulu.
2. **Pindai struk belum pernah memanggil API AI sungguhan** (tidak ada API key). Seluruh alur di sekitarnya teruji dengan klien tiruan; bentuk request ke API bisa saja perlu penyesuaian.
3. **Konfigurasi Vercel baru, penyimpanan Supabase, dan pengiriman email belum diuji** — tidak ada kredensial atau akses deployment.
4. **Hanya Chromium yang diuji**, dan belum ada Lighthouse.

## 1. Performa

### Sebelum vs sesudah (terukur)

Kondisi sama untuk keduanya: PostgreSQL lokal tanpa latency jaringan, 105.000 transaksi (pengguna terukur: 5.000 transaksi, 12 budget), median 5 kali. Versi lama diukur dengan urutan request berurutan seperti frontend lamanya; versi baru dengan request paralel seperti frontend barunya.

| Halaman | Sebelum: request · waktu · round-trip DB · respons | Sesudah |
|---|---|---|
| Dashboard | 8 · 485 ms · 64 · 45,6 KB | muat pertama: 2 · 45 ms · 23 · 16,8 KB<br>navigasi: 1 · 31 ms · 15 · 8,3 KB |
| Transaksi (bulan ini) | 5 · 102 ms · 24 · 42,0 KB | 1 · 23 ms · 5 · 26,8 KB |
| Transaksi (semua) | 5 · 797 ms · 23 · 2.453 KB | 1 · 22 ms · 4 · 26,8 KB (50 baris per halaman) |
| Budget (12 budget) | 6 · 1.007 ms · 235 · 12,3 KB | 1 · 18 ms · 6 · 4,6 KB |
| Laporan | 5 · 740 ms · 46 · 3,6 KB | 1 · 24 ms · 22 · 12,7 KB (isi analitik lebih banyak) |
| Registrasi | 919 ms | 57 ms hangat · 535 ms permintaan pertama |

Catatan: angka registrasi "sesudah" diukur dengan biaya bcrypt mode test; di production (cost 12) tambahkan ±0,2–0,3 detik. Jumlah query-nya turun dari ±90 berurutan menjadi beberapa saja.

Cache asset: sebelum `max-age=0` (divalidasi ulang tiap navigasi) → sesudah `max-age=31536000, immutable` pada URL ber-hash. Daftar transaksi memakai `Index Scan` pada `(userId, date)`.

### Transisi halaman (browser)

Diukur di Chromium pada server lokal, dari klik navigasi sampai konten halaman tampil tanpa skeleton:

| | Rentang |
|---|---|
| Kunjungan pertama (skeleton tampil, lalu data) | 146–188 ms |
| Kunjungan berikutnya (data dari cache, tanpa skeleton, divalidasi di latar) | 134–161 ms |

Pengukuran dilakukan di panel browser yang tidak sedang dirender, sehingga tiap angka memuat ±120 ms timer cadangan pergantian konten; pada tab yang terlihat angkanya lebih kecil. Tanpa latency jaringan — di produksi tambahkan satu round-trip API untuk kunjungan pertama; kunjungan berikutnya tetap seketika karena dari cache.

Kunjungan pertama ke aplikasi mengunduh 21 file asset kecil (modul ES tanpa bundler); setelah itu semuanya dari cache (21/21 pada muat ulang).

| Target | Hasil | Bukti | Status |
|---|---|---|---|
| Transisi halaman ≤ 1 detik | 134–188 ms lokal | B (pengukuran di atas) | PASS |
| Request yang tidak perlu diminimalkan | 5–8 request per halaman → 1 | P | PASS |
| Query & index dioptimalkan | 23–235 round-trip → 4–22; index terpakai | P | PASS |
| Pagination data besar | Cursor, 50 per halaman, tanpa baris terlewat/terulang | T `ledger` | PASS |
| Caching tanpa data finansial usang | SWR; setiap mutasi meng-invalidasi; API `no-store` | B (dashboard ter-update setelah transaksi tanpa muat ulang), T `auth` | PASS |
| Debounce pencarian | 320 ms | inspeksi kode + B | PASS |
| CLS ≤ 0,1 | 0 pada sesi yang diamati | B (PerformanceObserver, satu sesi) | PARTIAL |
| LCP ≤ 2,5 dtk | — | Lighthouse belum dijalankan | NOT TESTED |
| INP ≤ 200 ms | — | belum diukur | NOT TESTED |
| Asset statis lewat CDN di Vercel | `vercel.json` ditulis ulang | belum di-deploy | NOT TESTED |

## 2. Requirement per fitur

| Requirement | Expected | Actual | Bukti | Status |
|---|---|---|---|---|
| Skeleton loading | Skeleton sesuai layout; tidak muncul bila data sudah ada; beda dari kosong & error | Skeleton khusus per halaman; hanya saat belum ada cache; `emptyState` dan `errorState` terpisah | B (kunjungan pertama skeleton, berikutnya tidak) | PASS |
| Registrasi, login, logout | Berfungsi, sesi aman | Sesi di-regenerate, cookie HttpOnly/SameSite | T `auth`; B (login) | PASS |
| Lupa & reset password | Token aman | Token sekali pakai 60 menit, hanya hash disimpan | T `auth` | PASS |
| Pengiriman email reset | Email terkirim | Lewat Resend bila dikonfigurasi; tanpa itu tautan hanya muncul di mode non-produksi | tanpa API key | NOT TESTED |
| Verifikasi email | Jika didukung stack | Belum dibuat (butuh penyedia email) | — | FAIL |
| Protected routes | Tanpa login tidak bisa akses | API 401; halaman dialihkan di server | T `auth` | PASS |
| Isolasi data antar pengguna | A tidak bisa akses data B | Ditolak di semua jalur; data B utuh | T `isolation` (Test case 4) | PASS |
| Profil & pengaturan akun | Profil, password, sesi, hapus akun | Semua ada | T `auth`; B (tema, pengaturan) | PASS |
| Manajemen sesi | Kelola sesi | Jumlah sesi aktif + keluar dari perangkat lain; tanpa daftar per perangkat | T `auth` | PARTIAL |
| Dompet: buat, ubah, tipe, ikon, warna | Lengkap | Lengkap | T `ledger`; B (buat dompet) | PASS |
| Hapus dompet dengan validasi | Tidak menghapus riwayat diam-diam | Ditolak bila punya riwayat; arsip sebagai gantinya | T `ledger`, `migration` (FK RESTRICT) | PASS |
| Saldo awal ≠ pemasukan | Tidak masuk laporan | Kolom terpisah, tanpa transaksi | T `ledger` | PASS |
| Riwayat per dompet | Ada | Filter dompet di halaman Transaksi | T `ledger`; B | PASS |
| Transaksi: tambah, ubah, hapus | Saldo konsisten | Atomic lewat ledger | T `ledger`; B (tambah & ubah) | PASS |
| Validasi nominal > 0 di backend | Ditolak di server | Integer positif; juga `CHECK` di database | T `ledger`, `unit`, `migration` | PASS |
| Lampiran transaksi | Opsional, aman | Privat per pengguna, tipe dari isi file | T `receipts`; unggah lewat UI belum diklik | PARTIAL |
| Kategori kustom (buat, ubah, hapus, ikon, warna) | Lengkap | Lengkap + arsip + grup | T `ledger`; B (buat) | PASS |
| Riwayat: cari, filter, sort, pagination, total | Lengkap | Lengkap; total dihitung database | T `ledger`; B | PASS |
| Tanggal transaksi = tanggal pilihan pengguna | Bukan tanggal dibuat | Tanggal kalender, bebas zona waktu | T `ledger`, `unit` | PASS |
| Budget per kategori & per dompet | Tidak tercampur antar dompet | Terpisah; transfer tidak mengurangi budget | T `budgets-savings`; B | PASS |
| Budget: progres, sisa, kustom | Ada | Ada + saran harian | T `budgets-savings` | PASS |
| Notifikasi over-budget | Peringatan sesuai tingkat | Status 80%/100% + maskot di Budget dan Dashboard; tanpa email/push | B (status berubah ke "lewat batas") | PARTIAL |
| Savings goals | Target, setor, tarik, progres, estimasi | Lengkap | T `budgets-savings`; B | PASS |
| Tabungan tidak menggandakan saldo | Total saldo tetap | Alokasi atau transfer nyata; total tetap | T `budgets-savings`; B (total tidak berubah) | PASS |
| Animasi celengan | Koin masuk, progres naik | Ada; mati untuk reduced-motion | B (kelas animasi aktif saat menabung) | PASS |
| Dashboard finansial | 9 komponen di brief | Semua ada, satu request | T `reports`; B | PASS |
| Grafik harian–tahunan + rentang kustom | Menyesuaikan rentang | Lima granularitas + otomatis | T `reports` | PASS |
| Tujuh visualisasi | Sesuai daftar | Batang income/expense, garis arus kas, donat pengeluaran, batang pemasukan, tren (granularitas bulanan), pemakaian budget, donat dompet | B | PASS |
| Surplus / defisit / seimbang | Benar | Benar | T `reports` (Test case 3) | PASS |
| Perbandingan periode, kategori tertinggi/terendah, insight | Ada | Ada; tanpa pembanding tidak ada persentase palsu | T `reports` | PASS |
| Transfer internal tidak masuk income/expense | Dikecualikan | `kind = transfer` | T `transfers`, `reports` | PASS |
| Multi-mata uang | Tidak dicampur tanpa konversi | Per mata uang; lintas mata uang ditolak | inspeksi kode; USD tidak diuji khusus | PARTIAL |
| Hutang vs piutang terpisah | Dua konsep | `PAYABLE` / `RECEIVABLE` | T `debts` | PASS |
| Debt tracking | Bayar sebagian/penuh, riwayat, edit | Lengkap | T `debts` (Test case 2); B | PASS |
| Pembayaran otomatis memperbarui hutang, saldo, dashboard | Satu input | Satu input dari form transaksi atau halaman hutang | T `debts`; B (sisa 1,25jt → 1jt, riwayat +1, dompet −250rb) | PASS |
| Pokok hutang tidak dihitung ganda | Bukan expense kedua | `kind = debt`; bunga terpisah sebagai expense | T `debts` | PASS |
| Transfer satu langkah | Satu input, atomic | Ya | T `transfers` (Test case 1); B | PASS |
| Idempotency transfer | Tanpa duplikat | Kunci unik; duplikat bersamaan dieksekusi sekali | T `transfers` | PASS |
| Transfer eksternal dengan klasifikasi | Expense atau non-expense | Keduanya | T `transfers` | PASS |
| AI receipt: konfirmasi sebelum simpan | Tidak menyimpan otomatis | Hanya draf; simpan lewat form | T `receipts` | PASS |
| AI receipt: keamanan (key di backend, validasi file, privat, persetujuan, hapus gambar) | Semua | Semua | T `receipts` | PASS |
| AI receipt: fallback manual | Ada | Tombol hilang bila tidak dikonfigurasi; error → form manual | T `receipts`; B (tombol tidak tampil) | PASS |
| AI receipt: ekstraksi dari struk nyata | Membaca merchant, total, dst. | Request ke API belum pernah dijalankan | tanpa API key | NOT TESTED |
| Confidence indicator | Ditampilkan | Per kolom; kolom ragu ditandai | T `receipts` (data); tampilan belum dilihat dengan data nyata | PARTIAL |
| Tema gelap / terang / sistem, persisten | Berlaku di semua halaman | Token; tersimpan di akun dan lokal | B (ganti tema, cek warna terhitung) | PASS |
| Preferensi: tanggal, angka, mata uang, dompet default | Ada | Ada | T `auth`; B | PASS |
| Preferensi bahasa & notifikasi | Jika memungkinkan | Belum dibuat | — | FAIL |
| Custom cursor, parallax, scroll reveal | Bila menambah nilai | Sengaja tidak dibuat (alasan di ARCHITECTURE) | — | FAIL |
| Responsif mobile / tablet / desktop | Layak di semua ukuran | 375, 768, 1280 px: tanpa scroll horizontal, navigasi menyesuaikan | B (ketiga ukuran) | PASS |
| Lintas browser | Kompatibel | Hanya Chromium | — | NOT TESTED |
| Design system terdokumentasi | Token + komponen | `DESIGN_SYSTEM.md`, `app.css` | inspeksi | PASS |
| `prefers-reduced-motion` | Dihormati | Semua animasi mati; alur sukses tanpa jeda | inspeksi kode; belum diuji dengan emulasi | PARTIAL |
| Aksesibilitas | Intuitif & accessible | Fokus, aria, label; belum diaudit alat/pembaca layar | — | PARTIAL |

## 3. Keamanan & integritas

| Requirement | Actual | Bukti | Status |
|---|---|---|---|
| Server-side authorization | Setiap query ber-`userId`; ID klien divalidasi | T `isolation` | PASS |
| Password hashing | bcrypt cost 12 | T `auth` (login) | PASS |
| SQL injection | Prisma + parameter terikat | T `auth` | PASS |
| XSS | Escape default + CSP tanpa inline script | T `auth` (CSP, payload tersimpan sebagai data); B | PASS |
| CSRF | SameSite + pemeriksaan Origin | T `auth` | PASS |
| Rate limiting | Login, registrasi, reset, unggah, scan | T `auth` | PARTIAL (di memori per instance) |
| Secure cookies & session | HttpOnly, SameSite, Secure (prod), regenerate | T `auth` | PASS |
| Safe file upload | Magic bytes, 5 MB, nama acak, privat | T `receipts`, `unit` | PASS |
| Error tanpa kebocoran | Pesan umum + nomor referensi | T `auth` | PASS |
| Uang tanpa floating-point | Integer `BigInt` | T `unit`, `migration` | PASS |
| Perubahan saldo atomic, tanpa race | Ledger | T `ledger`, `transfers`, `debts` (uji bersamaan) | PASS |
| Cegah transaksi duplikat | Idempotency-Key | T `ledger`, `transfers`, `debts` | PASS |
| Audit metadata | `AuditLog` dalam transaksi yang sama | inspeksi kode; isi log tidak diperiksa test | PARTIAL |
| Migrasi non-destruktif | Aditif; diuji pada data lama | T `migration` | PASS |
| Migrasi diterapkan di produksi | — | menunggu backup & pemilik proyek | NOT TESTED |

## 4. Temuan Audit 1 → keadaan sekarang

| ID | Temuan | Keadaan |
|---|---|---|
| C1 | Endpoint destruktif tanpa auth | Dihapus; test memastikan 401/404 dan data tidak berubah |
| C2 | Transfer dihitung income/expense | Entitas `Transfer`; data lama diklasifikasi ulang oleh migrasi |
| C3 | Race condition saldo | Ledger atomic; uji bersamaan lolos |
| C4 | Hutang tidak konsisten | `Debt` + `DebtPayment`; sisa selalu dihitung ulang |
| C5 | Hapus dompet menghapus riwayat | Ditolak; FK `RESTRICT`; `wipe-wallets.js` dihapus |
| C6 | Edit dompet menimpa saldo | Saldo awal terpisah; penyesuaian tercatat |
| H1 | Stored XSS | Templating meng-escape default; CSP |
| H2 | Unggahan tanpa validasi, publik | Magic bytes; privat. **Lampiran lama tetap ber-URL publik** |
| H3 | Kelemahan auth & sesi | Diperbaiki; verifikasi email belum ada |
| H4, H5 | Error bocor; tanpa header keamanan | Error handler terpusat; helmet |
| D1, D8 | Tanpa index; tanpa migrasi | Index + `prisma migrate` |
| P1–P6 | Performa | Lihat bagian 1 |
| M1 | Batas `Int` 32-bit | `BigInt` |
| M2 | Mata uang dari preferensi tampilan | Mengikuti dompet |
| M3, M4 | KPI salah / parameter diabaikan | Endpoint dashboard baru; persentase null bila tanpa pembanding |
| M5 | Zona waktu | Tanggal kalender + `?today=` dari klien |
| M6 | Tabungan/investasi sebagai pengeluaran | Tabungan kini fitur tersendiri; kategori "Investasi" lama tetap ada bagi yang memakainya |
| U1–U11 | UI/UX | Frontend ditulis ulang di atas design system |

## 5. ISO/IEC 25010:2023

| Karakteristik | Implementasi | Indikator | Acceptance criteria | Hasil |
|---|---|---|---|---|
| Functional suitability | Service per domain + aturan akuntansi tunggal (`kind`) | Test case finansial | Keempat test case brief lolos; rekonsiliasi nol selisih | Terpenuhi (T) |
| Performance efficiency | Agregasi di DB, index, cache SWR, asset immutable | Request & round-trip per halaman; waktu transisi | ≤ 2 request per halaman; transisi ≤ 1 dtk | Terpenuhi lokal (P, B); LCP/INP belum diukur |
| Compatibility | HTML/CSS/JS standar; fallback bila View Transitions/container query tidak ada | Browser yang diuji | Berfungsi di Chromium, Firefox, Safari terbaru | Baru Chromium |
| Interaction capability | Design system, tiga state data, form dengan error per kolom, bottom sheet mobile | Viewport yang lolos; audit a11y | Tanpa scroll horizontal 375–1280 px; target sentuh ≥ 48 px | Terpenuhi (B); audit a11y belum |
| Reliability | Transaksi DB atomic, constraint, idempotency, rekonsiliasi | Uji bersamaan; invarian saldo | Tidak ada update hilang; saldo tidak negatif | Terpenuhi (T) |
| Security | Lihat bagian 3 | Test isolasi & keamanan | A tidak bisa membaca/mengubah data B di jalur mana pun | Terpenuhi (T); rate limit per instance |
| Maintainability | Lapisan routes/services/lib; modul frontend; 67 test; dokumentasi | Ukuran file terbesar; cakupan logika finansial | Tidak ada file > 500 baris; setiap service finansial punya test | Sebagian: setiap service finansial punya test, tetapi `routes/finance.js` 555 baris dan `forms.js` 516 baris — keduanya kandidat untuk dipecah per domain |
| Flexibility | Migrasi terkontrol; driver penyimpanan/email/AI bisa diganti; jumlah query tidak bergantung jumlah data | Biaya menambah fitur/skala | Fitur baru = service + route + halaman tanpa mengubah yang lain | Terpenuhi secara struktur; uji beban belum |
| Safety | Konfirmasi untuk aksi merusak; dompet/kategori terpakai tidak bisa dihapus; AI tidak bisa menulis; migrasi aditif; `npm run dev` tidak bisa menyentuh DB lain | Aksi tak-terpulihkan yang tak terjaga | Tidak ada penghapusan diam-diam; tidak ada perubahan saldo tanpa jejak | Terpenuhi (T, B) |

## 6. Aturan penting di brief (bagian 19)

| # | Aturan | Keadaan |
|---|---|---|
| 1 | Tidak merusak fitur yang berfungsi | Semua fitur lama punya padanan; URL lama dialihkan. Yang berubah perilaku dengan sengaja: hapus dompet berisi transaksi kini ditolak; kategori transfer/hutang diganti fitur tersendiri |
| 2 | Tanpa migrasi destruktif | Aditif; produksi belum disentuh |
| 3 | Tanpa rewrite tanpa alasan | Stack tetap. Backend dipecah dari satu file; frontend ditulis ulang karena redesign menyeluruh + perbaikan XSS + navigasi menyentuh setiap halaman — alasannya di ARCHITECTURE |
| 4 | Tanpa dummy data sebagai data asli | Data demo hanya lewat `npm run dev:seed`, akun demo, database lokal |
| 5 | Tanpa fitur frontend tak terhubung backend | Semua halaman memakai API nyata |
| 6 | Tanpa secret hardcoded | Semua dari env |
| 7–9 | Isolasi; transfer; pokok hutang | Lihat bagian 2 |
| 10 | AI tidak menyimpan sebelum konfirmasi | T `receipts` |
| 11 | Loading ≠ empty | Terpisah |
| 12 | Performa tidak dikorbankan demi animasi | Konten tidak bergantung animasi; durasi ≤ ±1 dtk |
| 13 | Mobile layak | B (375 px) |
| 14 | Tanpa library tak perlu | Ditambah: `helmet`, `@anthropic-ai/sdk`; dev: `embedded-postgres`, `pg`, font Geist. Dihapus: `tsx`, `@types/bcryptjs` |
| 16 | Tidak mengklaim tanpa uji | Lihat status di dokumen ini |

## 7. Sisa pekerjaan

Daftar berurutan ada di [`DEVELOPMENT_ROADMAP.md`](./DEVELOPMENT_ROADMAP.md) bagian "Catatan untuk sesi berikutnya".
