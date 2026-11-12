# Panduan Keamanan

Menjelaskan kontrol yang sudah ada, di mana kodenya, test yang membuktikannya, dan batasan yang masih ada.

## Autentikasi & sesi

| Kontrol | Lokasi | Bukti |
|---|---|---|
| Password di-hash bcrypt (cost 12) | `services/users.js` | — |
| Waktu respons login disamakan untuk email terdaftar/tidak | `verifyLogin` (hash tiruan) | `auth.test.js` (pesan identik) |
| ID sesi diganti saat login/registrasi (anti session fixation) | `routes/auth.js › startSession` | `auth.test.js` |
| Cookie `HttpOnly`, `SameSite=Lax`, `Secure` di production, 30 hari | `app.js` | `auth.test.js` |
| `AUTH_SECRET` wajib ≥ 32 karakter di production; tanpa fallback hardcoded | `config.js` | server menolak menyala |
| Rate limit: login 10/15 menit per IP+email, registrasi 10/jam, reset 5/jam | `middleware/security.js` | `auth.test.js` |
| Reset password: token acak 256-bit, hanya hash yang disimpan, sekali pakai, 60 menit, mengakhiri semua sesi | `services/users.js` | `auth.test.js` |
| Ganti password butuh password lama; sesi lain diakhiri | sama | `auth.test.js` |
| Halaman aplikasi tidak dikirim tanpa sesi | `app.js` | `auth.test.js` |

## Otorisasi & isolasi data

- Setiap query menyertakan `userId` dari sesi. ID dari klien (dompet, kategori, hutang, tujuan, budget, lampiran) selalu divalidasi kepemilikannya sebelum dipakai.
- Data milik pengguna lain dibalas `404`.
- Lampiran: kunci objek berawalan `userId`; `assertOwnKey` menolak kunci di luar folder sendiri dan pola path traversal.
- Bukti: `isolation.test.js` — 19 endpoint tulis, 11 kasus ID asing di body, daftar/filter/pencarian, lalu pemeriksaan bahwa data korban tidak berubah.

**Row-Level Security** tidak dipakai: aplikasi terhubung ke Postgres dengan satu role lewat Prisma, sehingga RLS butuh `SET LOCAL` per transaksi untuk setiap query. Isolasi ditegakkan di lapisan service dan dibuktikan oleh test. Bila nanti klien mengakses Supabase langsung, RLS menjadi wajib.

## Validasi input & injeksi

| Ancaman | Penanganan |
|---|---|
| SQL injection | Hanya Prisma; satu-satunya SQL mentah (`reports.js`) memakai parameter terikat. Diuji dengan input `' OR 1=1 --`. |
| XSS | Frontend merender lewat tagged template `html` yang meng-escape setiap nilai secara default (`ui.js`); data pengguna tidak pernah masuk `raw()`. Lapis kedua: CSP `script-src 'self'` tanpa `unsafe-inline`. |
| Input tidak valid | `lib/validate.js` di setiap route: tipe, panjang, enum, nominal integer positif ≤ 10¹⁵, tanggal kalender nyata, warna hex. |
| CSRF | Cookie `SameSite=Lax` + pemeriksaan header `Origin` untuk semua request non-GET; tidak ada endpoint GET yang mengubah data. |
| Clickjacking | CSP `frame-ancestors 'none'`. |
| Kebocoran detail internal | Hanya `AppError` yang pesannya diteruskan; error lain dicatat di server dengan nomor referensi dan dibalas pesan umum. |

`style-src` mengizinkan `'unsafe-inline'` karena atribut `style` dipakai untuk nilai dinamis (lebar progress, warna kategori). Nilai warna divalidasi server sebagai hex 6 digit.

## Unggahan file

- Tipe ditentukan dari **magic bytes**, bukan nama file atau `Content-Type`: hanya JPEG, PNG, WebP, PDF. HTML dan SVG ditolak.
- Maksimum 5 MB; nama file asli dibuang, diganti nama acak 128-bit.
- File disimpan di luar `public/` dan hanya dialirkan lewat API setelah kepemilikan diperiksa, dengan `X-Content-Type-Options: nosniff`.
- Dengan Supabase: gunakan bucket **privat** dan `SUPABASE_SERVICE_ROLE_KEY` (hanya di server).

Lampiran yang diunggah versi lama memakai URL publik Supabase dan tetap bisa dibuka siapa pun yang tahu URL-nya. Untuk menutupnya, pindahkan objek lama ke bucket privat dan isi `attachmentKey`; ini belum dikerjakan.

## Integritas data finansial

- Saldo hanya berubah lewat `services/ledger.js`, di dalam transaksi database, dengan `increment`/`decrement` dan syarat saldo cukup pada pernyataan yang sama.
- Operasi multi-langkah (transfer, pembayaran hutang, setoran tabungan dengan pemindahan) berada dalam satu transaksi database.
- `Idempotency-Key` mencegah transaksi ganda saat request terkirim ulang.
- Constraint database sebagai lapis kedua (lihat `DATABASE_SCHEMA.md`).
- `AuditLog` mencatat aktivitas finansial dan keamanan penting, di dalam transaksi yang sama dengan perubahannya.

## AI (pindai struk)

- `ANTHROPIC_API_KEY` hanya di server.
- Butuh persetujuan eksplisit pengguna (`aiConsentAt`), bisa dicabut di Pengaturan.
- Yang dikirim: gambar struk, nama kategori pengeluaran, nama dompet. Tidak ada saldo, email, atau ID pengguna (dibuktikan `receipts.test.js`).
- Keluaran model diperlakukan sebagai data tidak tepercaya: tipe dipaksa, tanggal masa depan dan nominal tidak wajar dibuang, kategori/dompet dicocokkan hanya ke milik pengguna.
- AI tidak pernah menyimpan transaksi atau mengubah saldo. Gambar yang tidak jadi dipakai dihapus.
- Teks di dalam gambar dinyatakan sebagai data, bukan instruksi, pada prompt sistem.

## Secrets

- Semua secret lewat environment variable; `.env` di-ignore git; `.env.example` hanya berisi placeholder.
- Tidak ada kredensial di source code.

## Batasan yang diketahui

| Batasan | Dampak | Saran |
|---|---|---|
| Rate limiter di memori per instance | Di serverless, batas efektif lebih longgar karena tiap instance menghitung sendiri | Pindahkan hitungan ke penyimpanan bersama (tabel Postgres atau Redis) bila ada tanda brute force |
| Verifikasi email belum ada | Akun bisa dibuat dengan email milik orang lain | Butuh penyedia email; token flow reset password bisa dipakai ulang |
| Tidak ada 2FA | — | Tambahkan TOTP untuk akun yang menginginkannya |
| Sesi "keluar dari perangkat lain" mencari `userId` di kolom JSON | Benar, tetapi sequential scan pada tabel sesi | Tambah kolom `userId` ber-index bila jumlah sesi besar |
| Lampiran lama ber-URL publik | Lihat bagian unggahan | Migrasikan ke bucket privat |
| Belum ada pemindaian malware pada unggahan | File hanya dilayani ulang ke pemiliknya | Tambahkan bila lampiran kelak bisa dibagikan |
| Belum ada backup otomatis yang dikonfigurasi dari repo ini | — | Aktifkan backup harian + point-in-time recovery di penyedia database |
| Belum ada error tracking / monitoring eksternal | Error hanya di log server (dengan nomor referensi) | Sambungkan log ke layanan pemantauan |

## Checklist sebelum production

1. `AUTH_SECRET` acak ≥ 32 karakter; `NODE_ENV=production`.
2. `DATABASE_URL` lewat pooler; backup harian aktif dan pernah diuji pulih.
3. Bucket lampiran privat + service-role key.
4. `ADMIN_EMAILS` hanya berisi email yang memang admin.
5. Backup, lalu `npm run db:baseline` dan `npm run db:deploy`.
6. Setelah deploy: `npm test` lolos di commit yang sama; buka `/api/reconcile` pada beberapa akun dan pastikan `consistent: true`.
