# Skema Database

PostgreSQL, dikelola lewat Prisma (`prisma/schema.prisma`). Semua nominal uang bertipe `BIGINT` dalam satuan terkecil mata uang.

## Relasi

```
User ─┬─< Wallet ─────────┬─< Transaction >── Category >── CategoryParent
      │                   ├─< Transfer (fromWallet, toWallet)
      │                   ├─< Debt
      │                   ├─< SavingsGoal
      │                   └─< Budget (opsional)
      ├─< Category
      ├─< Budget
      ├─< Transfer ──< Transaction (2 baris)      Transfer ──o SavingsEntry
      ├─< Debt ──┬─< DebtPayment ──o Transaction (1:1)
      │          └─< Transaction
      ├─< SavingsGoal ──< SavingsEntry
      ├─< PasswordResetToken
      └─< AuditLog
Session (berdiri sendiri; data JSON memuat userId)
```

## Tabel

### User
`id`, `email` (unik), `name`, `passwordHash`, `displayCurrency` (IDR/USD), `dateFormat`, `numberFormat`, `theme`, `defaultWalletId`, `aiConsentAt`, `createdAt`, `updatedAt`.

### Wallet
| Kolom | Catatan |
|---|---|
| `type` | cash, bank, ewallet, savings, investment, other |
| `currency` | ditetapkan saat dibuat; transaksi mengikuti mata uang dompet |
| `initialBalance` | saldo saat dompet mulai dicatat — **bukan pemasukan**, tidak masuk laporan |
| `balance` | saldo berjalan; hanya diubah oleh `services/ledger.js` |
| `active` | `false` = diarsipkan |
| `color`, `logo` | tampilan |

Invarian: `balance = initialBalance + Σ(mutasi berstatus success)`.

### Transaction — satu baris = satu mutasi pada satu dompet
| Kolom | Catatan |
|---|---|
| `amount` | selalu > 0 |
| `kind` | expense, income, transfer, debt, adjustment — menentukan perlakuan laporan |
| `direction` | in / out terhadap dompet |
| `date` | tanggal kalender pilihan pengguna, disimpan 12:00 UTC |
| `status` | success / pending (pending tidak mengubah saldo) |
| `categoryId` | wajib untuk expense/income; null untuk jenis lain |
| `transferId` | terisi bila baris ini salah satu sisi transfer |
| `debtId` | terisi bila baris ini pokok atau pembayaran hutang/piutang |
| `attachmentKey` | kunci objek privat `<userId>/<acak>.<ext>` |
| `source` | manual / receipt_ai |
| `idempotencyKey` | unik per pengguna |
| `type`, `parentTransactionId`, `remainingAmount`, `paidOff`, `imageUrl` | kolom warisan, dipertahankan sebagai jejak, tidak lagi ditulis (kecuali `type` yang diisi sama dengan `kind`) |

### Transfer
`fromWalletId`, `toWalletId`, `amount`, `date`, `note`, `idempotencyKey`. Selalu punya tepat dua `Transaction`.

### Debt
`type` (PAYABLE = hutang saya, RECEIVABLE = piutang), `personName`, `principal`, `outstanding`, `date`, `dueDate`, `description`, `status` (OPEN/PAID), `walletId`.
Invarian: `outstanding = principal − Σ DebtPayment.amount`.

### DebtPayment
`debtId`, `amount`, `date`, `note`, `transactionId` (unik — mutasi dompet untuk pembayaran ini).

### SavingsGoal / SavingsEntry
Goal: `name`, `targetAmount`, `savedAmount`, `targetDate`, `icon`, `color`, `walletId` (dompet tabungan, opsional), `status` (ACTIVE/ACHIEVED/ARCHIVED).
Entry: `amount` (positif = setor, negatif = tarik), `date`, `note`, `transferId` (terisi bila benar-benar memindahkan uang).
Invarian: `savedAmount = Σ SavingsEntry.amount ≥ 0`.

### Budget
`targetKind` (CATEGORY/PARENT) + `targetId`, `limitAmount`, `walletId` (null = semua dompet), bulanan (`year`,`month`) atau kustom (`periodStart`,`periodEnd`).

### Category / CategoryParent
Category: `name`, `type` (expense/income; `debt` hanya untuk data warisan), `icon`, `color`, `archived`, `parentId`.
CategoryParent: grup; `userId = null` untuk preset sistem.

### PasswordResetToken
`tokenHash` (SHA-256; token asli hanya ada di tautan), `expiresAt` (60 menit), `usedAt`.

### AuditLog
`action`, `entity`, `entityId`, `meta` (JSON) — ditulis di dalam transaksi database yang sama dengan perubahannya untuk: registrasi, ganti/reset password, dompet (buat, saldo awal, penyesuaian, hapus), transaksi (buat, ubah, hapus), transfer, hutang dan pembayarannya, setoran tabungan.

### Session
`sid`, `data`, `expiresAt` (ber-index).

## Aturan integritas di database

| Aturan | Bentuk |
|---|---|
| Nominal transaksi, transfer, pembayaran > 0 | `CHECK` |
| `direction` ∈ {in, out}; `kind` ∈ lima nilai | `CHECK` |
| Dompet asal ≠ dompet tujuan | `CHECK` pada Transfer |
| `0 ≤ outstanding ≤ principal`, `principal > 0` | `CHECK` pada Debt |
| `targetAmount > 0`, `savedAmount ≥ 0` | `CHECK` pada SavingsGoal |
| `limitAmount > 0` | `CHECK` pada Budget |
| Dompet / kategori yang punya transaksi tidak bisa dihapus | FK `ON DELETE RESTRICT` |
| Transaksi duplikat | `UNIQUE (userId, idempotencyKey)` pada Transaction dan Transfer |
| Satu pembayaran ↔ satu mutasi | `UNIQUE (transactionId)` pada DebtPayment |

Aturan ini adalah lapis kedua; lapis pertama ada di service.

## Index

`Transaction (userId, date)`, `(userId, kind, date)`, `(walletId, date)`, `(categoryId)`, `(transferId)`, `(debtId)` · `Wallet (userId)` · `Category (userId, type)` · `CategoryParent (userId, kind)` · `Budget (userId)` · `Transfer (userId, date)` · `Debt (userId, status)` · `DebtPayment (debtId, date)` · `SavingsGoal (userId, status)` · `SavingsEntry (goalId, date)` · `AuditLog (userId, createdAt)` · `Session (expiresAt)`.

Terverifikasi dipakai: `EXPLAIN` daftar transaksi memakai `Index Scan Backward using "Transaction_userId_date_idx"` (`npm run perf`).

## Migrasi

| Migrasi | Isi |
|---|---|
| `0_init` | Baseline: skema persis seperti versi lama (dibuat dari `prisma/legacy/schema.v0.prisma`). Pada database yang sudah ada, ditandai "sudah diterapkan" dengan `npm run db:baseline`. |
| `20261112000000_v1_foundation` | Perubahan skema + backfill data. |

### Yang dilakukan migrasi v1 pada data lama

1. Mengisi `kind` dan `direction` tiap transaksi dari kategorinya.
2. Mengisi `Wallet.initialBalance = balance − Σ mutasi` (saldo tidak berubah).
3. Memasangkan transfer lama yang cocok persis menjadi baris `Transfer`.
4. Membuat `Debt` dari transaksi hutang/pinjaman lama dan `DebtPayment` dari cicilannya; sisa dihitung ulang dari cicilan yang ada.
5. Mengarsipkan kategori transfer dan hutang (tidak dihapus).
6. Menambah index dan `CHECK` constraint; `Int` → `BigInt`; FK transaksi → `RESTRICT`.

**Tidak ada `DROP TABLE` / `DROP COLUMN` dan tidak ada baris yang dihapus.** `tests/migration.test.js` membangun database berskema lama berisi 11 transaksi berbentuk lama (termasuk pasangan transfer, hutang dengan `remainingAmount` yang salah, cicilan yatim, dan transaksi pending), menerapkan migrasi, lalu memeriksa setiap poin di atas serta bahwa jumlah baris tidak berubah.

### Sebelum menjalankan di produksi

Migrasi v1 menulis ulang tabel `Transaction`, `Wallet`, dan `Budget` (perubahan tipe kolom) dan mengunci tabel itu selama berjalan. Untuk data berukuran kecil–menengah ini berlangsung singkat, tetapi jalankan saat lalu lintas rendah dan **hanya setelah backup**. Langkahnya ada di README.

Satu hal yang perlu dicek sesudahnya: bila sebelum migrasi ada transaksi yang nominalnya 0 atau negatif, penambahan `CHECK (amount > 0)` akan gagal dan seluruh migrasi dibatalkan (tidak ada perubahan sebagian). Periksa dulu dengan:

```sql
SELECT count(*) FROM "Transaction" WHERE amount <= 0;
```
