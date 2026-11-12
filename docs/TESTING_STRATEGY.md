# Strategi Testing

## Cara menjalankan

```bash
npm test
```

`tests/run.mjs` menyalakan PostgreSQL sungguhan (tertanam, folder sementara, port acak), menerapkan seluruh migrasi dengan `prisma migrate deploy`, menjalankan test, lalu mematikan dan menghapus database itu. Tidak ada mock database: race condition, constraint, dan transaksi diuji pada mesin yang sama dengan produksi.

Test integrasi memanggil server Express sungguhan lewat HTTP dengan cookie sesi, jadi yang diuji adalah seluruh rantai: validasi → otorisasi → service → database → serialisasi.

Hasil terakhir: **70 test, 70 lolos** (±25–50 detik).

## Cakupan

| File | Jumlah | Yang dibuktikan |
|---|---|---|
| `unit.test.js` | 6 | Tanggal kalender tidak bergeser zona waktu; validasi nominal; bucket grafik selaras `date_trunc`; deteksi tipe file dari isi; kunci lampiran hanya di folder sendiri |
| `ledger.test.js` | 11 | Saldo awal bukan pemasukan; edit/hapus memulihkan saldo dengan tepat; perubahan gagal tidak meninggalkan efek sebagian; saldo tidak bisa negatif; **25 transaksi bersamaan tanpa update yang hilang**; **pengeluaran bersamaan melebihi saldo → tepat 3 dari 12 berhasil**; idempotency (berurutan dan bersamaan); penyesuaian saldo; dompet/kategori terpakai tidak bisa dihapus; pagination tanpa baris terlewat/terulang; filter, pencarian, urutan |
| `transfers.test.js` | 7 | **Test case 1**; atomic saat saldo kurang; validasi; duplikat bersamaan dieksekusi sekali; **transfer berlawanan arah bersamaan tanpa deadlock**; ubah/hapus menjaga kedua dompet; transfer eksternal pengeluaran vs non-pengeluaran |
| `debts.test.js` | 8 | **Test case 2**; sebagian → lunas; kelebihan bayar ditolak; **10 pembayaran bersamaan tidak melebihi sisa**; duplikat sekali; ubah/hapus pembayaran menghitung ulang sisa (termasuk hapus lewat daftar transaksi); pokok bukan pemasukan/pengeluaran; piutang; bunga sebagai pengeluaran terpisah |
| `reports.test.js` | 8 | **Test case 3**; defisit & seimbang; batas rentang tanggal inklusif; granularitas harian–tahunan; perbandingan periode sebelumnya; transaksi tertunda dikecualikan; filter per dompet; dashboard |
| `budgets-savings.test.js` | 4 | Budget per dompet tidak tercampur; transfer tidak mengurangi budget; budget grup & rentang kustom; tabungan alokasi tidak mengubah saldo; tabungan pemindahan nyata tidak menggandakan saldo |
| `isolation.test.js` | 2 | **Test case 4**: baca langsung, daftar/filter/pencarian, ubah/hapus (19 endpoint), ID milik orang lain di body (11 kasus), lampiran — lalu memastikan data korban tidak berubah sedikit pun; halaman admin |
| `auth.test.js` | 12 | 401 tanpa sesi; halaman aplikasi dialihkan; endpoint berbahaya lama hilang; register/login/logout; ID sesi diganti; ganti password; reset password (sekali pakai, kedaluwarsa, tidak membocorkan email); rate limit; CSRF origin; header keamanan; error tanpa detail internal; hapus akun |
| `receipts.test.js` | 7 | Tanpa persetujuan → gambar tidak dikirim; AI tidak dikonfigurasi → 503; **hasil scan tidak membuat transaksi maupun mengubah saldo**; data yang dikirim ke model tidak memuat saldo/email/ID; lampiran privat per pengguna; keluaran AI yang tidak masuk akal dinetralkan; kegagalan AI → fallback; tipe file dari isi |
| `migration.test.js` | 2 | Migrasi v1 pada data berbentuk lama: tanpa kehilangan baris, klasifikasi, saldo awal, pasangan transfer, hutang + pembayaran, constraint, index; migrasi pada database kosong |

### Empat test case finansial dari brief

| Kasus | Lokasi | Hasil |
|---|---|---|
| 1. Transfer internal BRI 5jt → BCA 2jt, pindah 1jt | `transfers.test.js` | BRI 4jt, BCA 3jt, total 7jt, income & expense 0 — lolos |
| 2. Hutang 5jt, bayar 1jt | `debts.test.js` | Dibayar 1jt, sisa 4jt, dompet −1jt, satu riwayat, bukan pengeluaran — lolos |
| 3. Income 10jt, expense 7jt, transfer 2jt | `reports.test.js` | Arus bersih 3jt, surplus, transfer di luar keduanya — lolos |
| 4. User A mengakses data User B | `isolation.test.js` | Ditolak di semua jalur, data B utuh — lolos |

## Invarian yang diperiksa berulang

`assertReconciled()` dipanggil di akhir sebagian besar test finansial: untuk setiap dompet, `balance = initialBalance + Σ mutasi`. Bug apa pun yang mengubah saldo tanpa mutasi (atau sebaliknya) menggagalkan test.

## Verifikasi manual di browser

Dilakukan pada server lokal dengan data demo (Chromium):

- Masuk, lalu membuka kedelapan halaman lewat router; tidak ada state error.
- Lewat UI: buat dompet, buat kategori, buat budget per dompet, catat pengeluaran, **ubah transaksi** (budget berubah dari "hampir habis" ke "lewat batas"), transfer antar dompet, bayar hutang, menabung dengan pemindahan nyata, catat piutang. Setelah tiap langkah, saldo dan `/api/reconcile` diperiksa.
- Dashboard ter-update sendiri setelah mutasi tanpa muat ulang.
- Ganti tema berlaku seketika dan tersimpan di akun.
- Mobile 375 px: tanpa scroll horizontal, tab bar + tombol tambah, dialog sebagai bottom sheet selebar layar.

Verifikasi ini menemukan dan memperbaiki enam bug yang tidak tertangkap test API: restart palsu server dev, atribut `aria-pressed` kosong, judul grup sticky bergeser, overflow horizontal di dialog, bottom sheet lebih lebar dari layar, dan navigasi yang bergantung pada callback View Transition.

## Yang belum diuji

| Area | Keadaan |
|---|---|
| Test end-to-end otomatis di browser | Belum ada. Alur UI diverifikasi manual seperti di atas. |
| Firefox, Safari, perangkat fisik | Belum diuji. Hanya Chromium. |
| Lighthouse (LCP, INP) | Belum dijalankan. |
| Panggilan nyata ke API Anthropic | Belum diuji (tanpa API key). Alurnya diuji dengan klien tiruan. |
| Supabase Storage | Belum diuji (tanpa kredensial). Yang teruji driver disk lokal. |
| Pengiriman email Resend | Belum diuji (tanpa API key). |
| Deployment Vercel dengan `vercel.json` baru | Belum diuji. |
| Aksesibilitas dengan pembaca layar / alat otomatis | Belum diuji. |
| Beban (banyak pengguna bersamaan) | Belum diuji; yang ada pengukuran `npm run perf` pada 105.000 transaksi. |

## Menambah test

- Test integrasi baru: buat pengguna dengan `H.newUser()` (email unik) — test tidak saling mengganggu dan tidak perlu mengosongkan database.
- Setiap perubahan pada service finansial sebaiknya diakhiri `await H.assertReconciled(c)`.
- Perubahan skema: tambahkan kasusnya ke `migration.test.js`.
