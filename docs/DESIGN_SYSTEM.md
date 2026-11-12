# Design System

Sumber: `public/css/app.css` (token + komponen), `public/js/app/ui.js` (komponen perilaku), `charts.js`, `art.js`.

## Arah visual

Gelap, tenang, dan padat informasi, dengan satu aksen hangat. Hitam pekat dan arang untuk permukaan, off-white untuk teks, **lava red** hanya untuk identitas dan aksi utama. Gradien lava dan motif busur bercahaya (diambil dari referensi desain) dipakai di tiga tempat saja: kartu hero saldo, panel halaman masuk, dan tombol tambah di mobile — supaya tetap terasa istimewa.

Merah **tidak** dipakai untuk semua hal: hijau = positif, merah lembut = negatif, oranye = peringatan/tertunda, abu = informasi sekunder.

## Token warna

Semua komponen memakai token; tidak ada nilai warna mentah di komponen atau JavaScript. Tema diganti dengan `data-theme` pada `<html>`.

| Token | Gelap | Terang | Dipakai untuk |
|---|---|---|---|
| `--bg` | `#09090a` | `#f6f5f2` | latar halaman |
| `--surface-1` | `#121213` | `#ffffff` | kartu, sidebar, dialog |
| `--surface-2` | `#19191b` | `#f3f2ef` | input, hover, kepala grup |
| `--surface-3` | `#222225` | `#e9e7e3` | trek progress, toast |
| `--border` / `--border-strong` | putih 8% / 16% | hitam 9% / 20% | garis |
| `--text` / `--text-2` / `--text-3` | `#f5f4f2` / `#a8a6a1` / `#75736f` | `#17161a` / `#5d5b57` / `#8a8884` | teks utama / sekunder / samar |
| `--accent` | `#ff4d2e` | `#e23a1c` | tombol utama, penanda aktif |
| `--accent-soft`, `--accent-text` | — | — | latar tipis dan teks beraksen |
| `--lava` | gradien `#ff7a3d → #f43a1f → #b0122d` | sama | hero, avatar, FAB |
| `--pos` / `--neg` / `--warn` | `#34d399` / `#f87171` / `#fb923c` | `#0b8a5f` / `#d23b3b` / `#c2600c` | indikator finansial dan status |

### Warna grafik
Dipilih dari palet yang divalidasi secara terukur (pemisahan untuk buta warna, kontras terhadap permukaan) untuk masing-masing tema:

| Token | Gelap | Terang |
|---|---|---|
| `--chart-income` / `--chart-expense` | `#199e70` / `#e66767` | `#0f8f63` / `#e34948` |
| `--series-1…6` | `#3987e5 #d95926 #199e70 #c98500 #d55181 #9085e9` | `#2a78d6 #eb6834 #1baf7a #eda100 #e87ba4 #6250d6` |

Urutan seri tetap dan tidak pernah digilir; lebih dari enam irisan dilipat menjadi "Lainnya". Pada tema gelap pasangan pemasukan/pengeluaran berada di batas bawah pemisahan buta warna, sehingga selalu disertai legenda berlabel, tooltip, dan tampilan tabel — identitas tidak pernah hanya lewat warna.

## Tipografi

Font: **Geist** (variable, di-host sendiri di `public/assets/fonts/`, lisensi OFL disertakan), cadangan Inter lalu font sistem.

| Token | Ukuran | Dipakai untuk |
|---|---|---|
| `--fs-xs` | 12px | eyebrow, badge |
| `--fs-sm` | 13px | meta, label form |
| `--fs-md` | 15px | teks isi |
| `--fs-lg` | 18px | judul kartu |
| `--fs-xl` | 24px | nilai KPI |
| `--fs-2xl` | 32px | nominal input |
| `--fs-3xl` | 36–52px (fluid) | saldo hero |

Angka finansial memakai kelas `.num`: `tabular-nums` agar digit sejajar di kolom, tanpa pemenggalan baris.

## Jarak, radius, bayangan

- Jarak: `--s-1…8` = 4, 8, 12, 16, 24, 32, 48, 64 px.
- Radius: `--r-sm` 8 · `--r-md` 12 · `--r-lg` 16 · `--r-xl` 24 · `--r-full`.
- Bayangan: `--shadow-1` (kartu), `--shadow-2` (hover, toast), `--shadow-pop` (dialog).

## Komponen

| Komponen | Kelas / fungsi | Varian |
|---|---|---|
| Tombol | `.btn` | `--primary`, `--ghost`, `--danger`, `--sm`, `--lg`, `--icon`, `--block`; status sibuk lewat `busy()` |
| Input | `.input`, `.select`, `.textarea`, `.amount-input` | `.field.is-invalid`, `.field.needs-review` (hasil AI yang perlu diperiksa) |
| Kontrol tersegmentasi | `.segmented` | `--block` |
| Chip filter | `.chip` | `aria-pressed` |
| Badge | `.badge` | `--pos`, `--neg`, `--warn`, `--accent` |
| Kartu | `.card` | `--flush`, `--hover`; `.hero` |
| Grid | `.bento` + `.col-3…8`, `.grid-cards` | |
| Baris daftar | `.row`, `.group-head` | |
| Ubin ikon | `.tile` / `tile()` | `--sm`, `--lg`; warna lewat `--c` |
| Progress | `.progress` | `--pos`, `--warn`, `--neg`, `--lava`, `--lg` |
| Dialog | `dialog()` | tengah di desktop, bottom sheet di mobile; fokus terkunci, Esc menutup |
| Konfirmasi | `confirmDialog()` | `danger` |
| Toast | `toast()` | success, error, info |
| Skeleton | `.sk`, `skRows()`, skeleton per halaman | |
| State kosong | `emptyState()` | dengan ilustrasi + aksi |
| State error | `errorState()` | dengan tombol coba lagi |
| Pemilih | `colorPicker()`, `emojiPicker()`, `logoPicker()` | |

### Tiga state data yang selalu dibedakan
1. **Loading** — skeleton yang meniru layout akhir; hanya bila belum ada data sama sekali.
2. **Kosong** — ilustrasi, penjelasan, dan satu aksi berikutnya.
3. **Error** — pesan dan tombol coba lagi; hanya bila tidak ada data untuk ditampilkan.

## Ikonografi
Ikon garis 24×24, stroke 1,75, mengikuti `currentColor` (`icon()` di `ui.js`). Kategori memakai emoji pilihan pengguna di dalam ubin berwarna.

## Ilustrasi (`art.js`)
- **Celengan** — saat menabung: tangan memasukkan koin, koin jatuh, celengan memantul, percikan; lalu progres di halaman bertambah.
- **Tetes lava** (maskot) — tiga suasana untuk budget: aman, hampir habis, lewat batas.
- **Centang sukses** — setelah mencatat transaksi dan membayar hutang (disertai progres pelunasan).
- Ilustrasi garis untuk tiap state kosong.

## Motion

| Efek | Durasi | Tempat |
|---|---|---|
| Masuk halaman (`.view-enter`) | 240 ms | setiap pindah halaman |
| Masuk bertahap (`.stagger`) | 420 ms, jeda 45 ms | kartu dalam satu halaman |
| Hitung naik angka (`countUp`) | 650 ms | KPI dashboard |
| Progress tumbuh | 420 ms | semua progress bar |
| Garis grafik tergambar | 700 ms | tren arus kas |
| Dialog / sheet / toast | 140–420 ms | |
| Shimmer skeleton | 1,4 dtk berulang | |

Prinsip: animasi memberi umpan balik atau menunjukkan perubahan, bukan menghias. Tidak ada animasi yang menahan interaksi lebih dari ±1 detik. Pergantian konten tidak pernah bergantung pada selesainya animasi.

`prefers-reduced-motion: reduce` mematikan seluruh animasi dan transisi; alur sukses langsung menutup dialog tanpa jeda.

## Responsif

| Lebar | Navigasi | Tata letak |
|---|---|---|
| ≥ 1100 px | sidebar 248 px | bento 12 kolom |
| 768–1099 px | rel ikon 76 px | kartu KPI 2 kolom |
| < 768 px | tab bar bawah + tombol tambah mengambang | satu kolom; KPI 2 kolom; dialog menjadi bottom sheet; target sentuh ≥ 48 px |

Donat berpindah ke atas legendanya ketika kartunya sempit (container query), bukan berdasarkan lebar layar.

## Aksesibilitas
- Fokus terlihat pada semua elemen interaktif; dialog mengunci fokus dan mengembalikannya saat ditutup.
- Kontrol toggle memakai `aria-pressed`; progress memakai `role="progressbar"`; grafik punya label teks dan padanan tabel.
- Status tidak pernah hanya lewat warna (selalu ada teks atau ikon).
- Belum diaudit dengan alat otomatis maupun pembaca layar — lihat `FINAL_QUALITY_AUDIT.md`.
