# Checklist setup deployment (untuk pemilik proyek)

Urutan langkah supaya preview Vercel branch `revamp/v1-foundation` bisa hidup dan diverifikasi. Kerjakan dari atas ke bawah; tiap tahap menyebut cara mengecek hasilnya.

Jangan pernah menempel password, secret, atau API key ke chat. Nilai rahasia hanya diisi di dashboard layanannya.

## Tahap 1 — Sambungkan connector (±5 menit)

Tujuan: Claude bisa membaca log deployment dan mengelola database preview tanpa memegang kredensial Anda.

1. Buka claude.ai → pengaturan → **Connectors**.
2. Cari **Vercel** → **Connect** → login dengan akun pemilik project `monify` → setujui akses.
3. Cari **Supabase** → **Connect** → login → setujui akses.
4. Mulai sesi Claude Code baru pada repo `delvin4ys/Monify`, environment **monify**, lalu tulis: "connector sudah tersambung, lanjutkan".

Cek: di halaman Connectors, Vercel dan Supabase berstatus terhubung.

## Tahap 2 — `AUTH_SECRET` di Vercel (±3 menit)

Tanpa ini setiap halaman menjawab 500.

1. Buat nilai acak minimal 32 karakter. Salah satu cara:
   - Terminal: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
   - Atau: `openssl rand -hex 48`
   - Atau pembuat password di password manager Anda (panjang 64, huruf dan angka).
2. Vercel → project **monify** → **Settings** → **Environment Variables** → **Add**.
3. Key `AUTH_SECRET`, Value hasil langkah 1, centang **Production** dan **Preview** → **Save**.

Cek: `AUTH_SECRET` muncul di daftar dengan label Production, Preview.

## Tahap 3 — Database khusus preview (±15 menit)

Tujuan: menguji versi baru tanpa menyentuh data produksi. Bila connector Supabase sudah tersambung (Tahap 1), langkah 1–2 dan 5 bisa dikerjakan Claude; cukup minta.

1. Supabase → **New project**, nama `monify-preview`, region sama dengan produksi. Simpan password database-nya.
2. (Opsional) Salin data produksi supaya migrasi teruji pada data nyata:
   - `pg_dump "<URL session pooler PRODUKSI>" --no-owner --no-privileges -f monify-backup.sql`
   - `psql "<URL session pooler PREVIEW>" -f monify-backup.sql`
   - Simpan `monify-backup.sql`; file ini juga berfungsi sebagai backup produksi.
3. Di project `monify-preview`: tombol **Connect** → salin URL **Transaction pooler** (port 6543) → ganti `[YOUR-PASSWORD]` → tambahkan `?pgbouncer=true&connection_limit=1` di ujung.
4. Vercel → **Environment Variables** → `DATABASE_URL`:
   - Bila sudah ada untuk semua environment: edit sehingga yang lama hanya **Production**, lalu tambah entri baru `DATABASE_URL` berisi URL langkah 3 dengan centang **Preview** saja.
5. Terapkan skema ke database preview dari komputer Anda. Di folder repo (branch `revamp/v1-foundation`), buat file `.env` berisi `DATABASE_URL="<URL Session pooler PREVIEW, port 5432>"`, lalu:
   - Bila langkah 2 dikerjakan (database berisi data lama): `npm install`, `npm run db:baseline`, `npm run db:deploy`
   - Bila database kosong: `npm install`, `npm run db:deploy`

Cek: `npm run db:status` menampilkan "Database schema is up to date".

## Tahap 4 — Redeploy dan verifikasi (±5 menit)

1. Vercel → **Deployments** → deployment teratas branch `revamp/v1-foundation` → menu **⋯** → **Redeploy**.
2. Setelah Ready, buka `https://monify-git-revamp-v1-foundation-delvin4ys-projects.vercel.app/api/health` (sambil login Vercel).
3. Buka `/register`, buat akun, tambah satu dompet dan satu transaksi.

Cek: `/api/health` menampilkan `{"ok":true,...}`; registrasi berhasil dan dashboard tampil. Bila ada yang gagal, beri tahu Claude — dengan connector Vercel ia bisa membaca log error-nya.

## Tahap 5 — Opsional per fitur

Kerjakan hanya fitur yang ingin diaktifkan. Semua variabel diisi di Vercel seperti Tahap 2, lalu Redeploy.

| Fitur | Variabel | Cara mendapatkan |
|---|---|---|
| Tautan reset password benar | `APP_URL` | URL publik aplikasi tanpa `/` di akhir (Vercel → **Domains**) |
| Halaman admin | `ADMIN_EMAILS` | Email Anda. Isi **setelah** akun dengan email itu terdaftar di aplikasi |
| Lampiran & struk tersimpan permanen | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET` | Supabase → **Project Settings → API**: Project URL dan key `service_role`. **Storage → New bucket** bernama `attachments`, Public **mati** |
| Email reset password | `RESEND_API_KEY`, `MAIL_FROM` | resend.com → verifikasi domain di **Domains** → **API Keys → Create**. `MAIL_FROM` contoh: `Monify <no-reply@domainanda.com>` |
| Pindai struk AI | `ANTHROPIC_API_KEY` | console.anthropic.com → aktifkan billing → **API Keys → Create Key** |

## Jangan dilakukan dulu

- Jangan jalankan `db:baseline` / `db:deploy` terhadap database **produksi**. Situs produksi masih menjalankan kode lama; migrasi produksi dilakukan bersamaan dengan rilis, setelah preview terbukti benar.
- Jangan merge ke `main`.
