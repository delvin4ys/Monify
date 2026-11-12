# Dokumentasi API

Basis: `/api`. Semua endpoint selain yang bertanda **publik** membutuhkan sesi (cookie `monify.sid`).

## Konvensi

**Sukses**
```json
{ "ok": true, "data": { } }
```

**Gagal**
```json
{ "ok": false, "error": { "code": "VALIDATION_ERROR", "message": "Jumlah harus lebih besar dari nol.", "fields": { "amount": "Jumlah harus lebih besar dari nol." } } }
```

| Status | Arti | Contoh `code` |
|---|---|---|
| 400 | Input tidak valid | `VALIDATION_ERROR`, `OVERPAYMENT`, `UNSUPPORTED_FILE`, `BAD_JSON`, `INVALID_TOKEN` |
| 401 | Belum masuk / kredensial salah | `UNAUTHORIZED`, `INVALID_CREDENTIALS` |
| 403 | Dilarang | `FORBIDDEN`, `BAD_ORIGIN`, `AI_CONSENT_REQUIRED` |
| 404 | Tidak ada, atau bukan milik pengguna ini | `NOT_FOUND` |
| 409 | Bentrok dengan keadaan data | `INSUFFICIENT_BALANCE`, `WALLET_IN_USE`, `CATEGORY_IN_USE`, `BUDGET_EXISTS`, `EMAIL_TAKEN`, `MANAGED_BY_TRANSFER`, `MANAGED_BY_DEBT` |
| 413 | Terlalu besar | `FILE_TOO_LARGE`, `PAYLOAD_TOO_LARGE` |
| 422 | AI tidak menghasilkan data | `AI_NO_RESULT`, `NOT_A_RECEIPT` |
| 429 | Terlalu sering | `RATE_LIMITED` |
| 502 / 503 | Layanan luar gagal / belum dikonfigurasi | `AI_FAILED`, `AI_UNAVAILABLE`, `STORAGE_ERROR` |
| 500 | Kesalahan server (tanpa detail internal; ada `ref` untuk dicocokkan dengan log) | `INTERNAL` |

- **Uang**: integer satuan terkecil (Rp 15.000 → `15000`).
- **Tanggal**: `YYYY-MM-DD`.
- **Idempotency**: header `Idempotency-Key` (8–80 karakter `[A-Za-z0-9_-]`) pada endpoint bertanda ⟳. Request ulang dengan kunci sama mengembalikan hasil pertama (`200`, `replayed: true`).
- **`?today=YYYY-MM-DD`**: tanggal lokal pengguna, untuk endpoint yang butuh "hari ini".
- Data milik pengguna lain selalu dibalas `404`, bukan `403`, agar keberadaannya tidak terungkap.

## Auth & akun

| Method | Path | Body | Catatan |
|---|---|---|---|
| POST | `/auth/register` **publik** | `email`, `password` (≥ 8), `name?` | Membuat akun + kategori bawaan, langsung masuk. Dibatasi 10/jam per IP. |
| POST | `/auth/login` **publik** | `email`, `password` | ID sesi diganti. Dibatasi 10 per 15 menit per IP+email. |
| POST | `/auth/logout` | — | |
| GET | `/auth/me` | — | Profil + `isAdmin`. |
| POST | `/auth/forgot` **publik** | `email` | Respons sama untuk email terdaftar maupun tidak. |
| POST | `/auth/reset` **publik** | `token`, `password` | Token sekali pakai, 60 menit. Mengakhiri semua sesi. |
| POST | `/auth/password` | `currentPassword`, `newPassword` | Mengakhiri sesi lain. |
| GET | `/auth/sessions` | — | `{ active }` |
| DELETE | `/auth/sessions` | — | Keluar dari perangkat lain. |
| PATCH | `/user` | `name?`, `theme?`, `dateFormat?`, `numberFormat?`, `displayCurrency?`, `defaultWalletId?`, `aiConsent?` | |
| DELETE | `/account` | `password` | Menghapus akun dan seluruh datanya. |
| GET | `/admin/users` | — | Hanya email di `ADMIN_EMAILS`. Hanya jumlah data per akun. |

## Data referensi & ringkasan

| Method | Path | Hasil |
|---|---|---|
| GET | `/bootstrap` | `user`, `wallets`, `categories`, `categoryParents`, `features { receiptScan, storage }` |
| GET | `/dashboard?today=` | Saldo, total bulan ini & bulan lalu + perubahan, hutang/piutang, tabungan, budget, dompet, 8 transaksi terbaru, tren 6 bulan, 5 pengeluaran terbesar |
| GET | `/reports?from=&to=&granularity?=&walletId?=` | `totals` (income, expense, net, status), `previous`, `change`, `excluded` (transfer/debt/adjustment), `series`, `expenseByCategory`, `incomeByCategory`, `highestSpending`, `lowestSpending`, `walletDistribution`, `budgetUtilization`, `insights`. `granularity`: day, week, month, quarter, year (otomatis bila kosong). |
| GET | `/reconcile` | Per dompet: `balance`, `expected`, `difference`; `consistent` |
| GET | `/health` **publik** | `uptime`, `version` |

## Dompet

| Method | Path | Body |
|---|---|---|
| GET | `/wallets` | — |
| POST | `/wallets` | `name`, `type?`, `color?`, `logo?`, `initialBalance?` |
| PATCH | `/wallets/:id` | `name?`, `type?`, `color?`, `logo?`, `active?`, `initialBalance?` |
| POST | `/wallets/:id/adjust` | `targetBalance`, `date`, `note?` — selisih dicatat sebagai transaksi `adjustment` |
| DELETE | `/wallets/:id` | Ditolak `409 WALLET_IN_USE` bila punya riwayat |

## Kategori

| Method | Path | Body |
|---|---|---|
| GET | `/categories` | → `categories`, `parents` |
| POST | `/categories` | `name`, `type` (expense/income), `icon?`, `color?`, `parentId?` |
| PATCH | `/categories/:id` | `name?`, `icon?`, `color?`, `parentId?`, `archived?` |
| DELETE | `/categories/:id` | Ditolak `409 CATEGORY_IN_USE` bila dipakai |
| POST | `/category-parents` | `name`, `kind` |
| DELETE | `/category-parents/:id` | Hanya grup buatan pengguna yang kosong |

## Transaksi

| Method | Path | Catatan |
|---|---|---|
| GET | `/transactions` | Query: `from`,`to`, `walletId`, `categoryId`, `kind`, `status`, `debtId`, `q`, `sort` (date_desc, date_asc, amount_desc, amount_asc), `limit` (≤ 100), `cursor`. Hasil: `items`, `nextCursor`, dan pada halaman pertama `totals { income, expense, net, count }` untuk seluruh filter. |
| POST ⟳ | `/transactions` | `kind` (expense/income/transfer), `amount`, `walletId`, `categoryId` (expense/income), `title`, `date`, `status?`, `relatedParty?`, `attachmentKey?`, `source?`. Untuk `kind: "transfer"` (ke/dari orang lain, non-pengeluaran): `direction`, `counterparty` wajib, tanpa kategori. |
| GET | `/transactions/:id` | |
| PATCH | `/transactions/:id` | Kolom yang sama, semua opsional. Baris milik transfer/hutang ditolak `409`. |
| DELETE | `/transactions/:id` | Baris transfer menghapus seluruh transfer; baris pembayaran menghapus pembayarannya dan memulihkan sisa hutang. |
| GET | `/transactions/:id/attachment` | Mengalirkan file setelah kepemilikan diperiksa. |

## Transfer antar dompet

| Method | Path | Body |
|---|---|---|
| POST ⟳ | `/transfers` | `fromWalletId`, `toWalletId`, `amount`, `date`, `note?` |
| GET | `/transfers/:id` | |
| PATCH | `/transfers/:id` | Kolom yang sama, opsional |
| DELETE | `/transfers/:id` | Membatalkan kedua sisi |

## Hutang & piutang

| Method | Path | Body |
|---|---|---|
| GET | `/debts?status=&type=` | → `debts`, `totals { payable, receivable, … }` |
| POST | `/debts` | `type` (PAYABLE/RECEIVABLE), `personName`, `amount`, `date`, `dueDate?`, `description?`, `walletId?` (bila uang melewati dompet) |
| GET | `/debts/:id` | Termasuk `payments` |
| PATCH | `/debts/:id` | `personName?`, `amount?` (≥ total dibayar), `date?`, `dueDate?`, `description?` |
| DELETE | `/debts/:id` | Membalik semua mutasi terkait |
| POST ⟳ | `/debts/:id/payments` | `amount` (≤ sisa), `date`, `walletId`, `note?`, `feeAmount?`, `feeCategoryId?` (bunga/biaya → pengeluaran terpisah, hanya PAYABLE) |
| PATCH | `/debts/:id/payments/:paymentId` | `amount?`, `date?`, `walletId?`, `note?` |
| DELETE | `/debts/:id/payments/:paymentId` | |

## Budget

| Method | Path | Body |
|---|---|---|
| GET | `/budgets?year=&month=&today=` | → `budgets` (dengan `spent`, `remaining`, `percent`, `status` ok/warning/over, `daysLeft`, `suggestedDaily`), `summary` |
| POST | `/budgets` | `targetKind`, `targetId`, `limitAmount`, `walletId?`, dan (`year`,`month`) atau (`periodStart`,`periodEnd`) |
| PATCH | `/budgets/:id` | `limitAmount?`, `walletId?` |
| DELETE | `/budgets/:id` | |

## Tujuan tabungan

| Method | Path | Body |
|---|---|---|
| GET | `/savings` | → `goals`, `totals` |
| POST | `/savings` | `name`, `targetAmount`, `targetDate?`, `icon?`, `color?`, `walletId?` |
| GET | `/savings/:id` | Termasuk `entries`, `estimatedCompletion`, `monthlyNeeded` |
| PATCH | `/savings/:id` | Kolom yang sama + `archived?` |
| DELETE | `/savings/:id` | |
| POST | `/savings/:id/entries` | `type` (deposit/withdraw), `amount`, `date`, `note?`, `walletId?` — bila diisi dan tujuan punya dompet tabungan, uang benar-benar dipindahkan |
| DELETE | `/savings/:id/entries/:entryId` | Transfer terkait ikut dibatalkan |

## Lampiran & pindai struk

| Method | Path | Catatan |
|---|---|---|
| POST | `/attachments` | `multipart/form-data`, field `file`. JPG/PNG/WebP/PDF, ≤ 5 MB, tipe ditentukan dari isi file. → `attachmentKey` |
| GET | `/attachments?key=` | Pratinjau lampiran yang belum terikat transaksi |
| DELETE | `/attachments?key=` | Ditolak bila masih dipakai transaksi |
| POST | `/receipts/scan?today=` | `multipart/form-data`, field `file` (gambar). Butuh persetujuan AI. → `{ draft, attachmentKey }`. **Tidak menyimpan transaksi.** |

`draft`: `merchant`, `date`, `time`, `total`, `subtotal`, `tax`, `serviceCharge`, `paymentMethod`, `items[]`, `suggestedCategoryId`, `suggestedWalletId`, `confidence { merchant, date, total, category }` (high/medium/low), `needsReview[]`, `notes`.

Menyimpan hasilnya: `POST /transactions` dengan nilai yang sudah diperiksa pengguna, `attachmentKey`, dan `source: "receipt_ai"`.
