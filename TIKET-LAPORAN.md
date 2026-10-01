# Tiket fitur — Laporan & rekening koran PDF

Empat tiket fitur untuk halaman **Laporan** (`app/laporan/`). Semua angka di bawah sudah diverifikasi dengan `bun --filter web check` dan query read-only ke Neon — bukan asumsi.

---

## Latar belakang

Halaman Laporan sekarang sudah punya: 4 kartu angka (saldo awal, masuk, keluar, saldo akhir), tren per bulan, pengeluaran per kategori, dan pergerakan saldo per dompet. Yang belum ada: **rincian pemasukan per kategori**, **transaksi terbesar**, **perbandingan antar periode**, dan **dokumen PDF** yang bisa dicetak/disimpan.

Data sekarang (Neon, 2026-09-26 s.d. 2026-09-30):

| Tabel | Isi |
|---|---|
| `transaksi` | 101 baris (96 `keluar`, 5 `masuk`) |
| `transfer` | 6 baris, Rp 4.040.000 |
| `kategori` | 4 bertipe `masuk` (Gaji, Bonus, Lainnya, Terima Piutang); **"Lainnya" punya 2 baris** |
| `dompet` | 6: Kas Keluarga (62 trx), Istri (11), Dapur (11), Khalif (8), Suami (6), Gym (3) |
| `tagihan` | 2 baris, Rp 870.000; `tagihan_bayar` 2 baris (hanya 2026-09) |
| `utang` | 4 baris (semua `utang`), sisa Rp 3.236.300, 2 lunas; **0 piutang** |

Cara baca: `R<n>` = tiket, `R<n>.<m>` = sub-tiket. Tag di kolom Temuan: `api:` (backend), `ui:` (frontend), `⚠️` (jebakan yang sudah diverifikasi terhadap DB).

Syarat lulus semua tiket: `bun --filter web check` → 0 error, dan PDF-nya bisa direkonsiliasi dengan angka di layar (lihat [syarat lulus](#syarat-lulus)).

---

## Batasan global — WAJIB dibaca sebelum nulis query

| # | Batasan | Kenapa |
|---|---|---|
| B1 | `transaksi.tanggal` dan `transfer.tanggal` itu **`varchar(10)`** (`YYYY-MM-DD`), bukan tipe `date` | Perbandingan rentang tetap komparasi string leksikografis — itu yang bikin `transaksi_tanggal_id_idx (tanggal, id)` terpakai. **Jangan** tulis `::date`, `EXTRACT()`, atau `to_timestamp()`. Kalau butuh potong bulan, pakai `substring(dari from 1 for 7)` — tapi hanya untuk *grouping*, bukan untuk batas periode |
| B2 | Repo **tidak punya CSRF sama sekali** (`grep -i csrf` → 0 hasil). Cookie sesi cuma `sameSite: 'lax'` | Keempat tiket read-only `GET`. **Jangan** bikin endpoint `POST` untuk ekspor PDF atau "muat ulang" — itu jadi satu-satunya mutasi tanpa proteksi di halaman yang sekarang read-only |
| B3 | `transaksi.id_kategori` **nullable** (bandingkan `tagihan.kategoriId` dan `anggaran.kategoriId` yang `.notNull()`) | Wajib `leftJoin` + `COALESCE(k.nama, 'Tanpa kategori')`. `innerJoin` membuang transaksi tanpa kategori diam-diam. Saat ini 0 baris NULL, tapi `innerJoin` di `api/laporan/+server.ts:73` adalah jebakan laten |
| B4 | `kategori.nama_kategori` **tidak punya UNIQUE** — hanya `id_kategori` PK | Group by **`kategori.id`**, bukan nama. "Lainnya" benar-benar ada 2× di DB, jadi `groupBy(kategori.nama)` bisa menggabungkan 2 kategori berbeda jadi 1 baris |
| B5 | Jangan pernah `SELECT *` dari `users` (`password_hash`) atau `sessions` (`token`) | Dua kolom sensitif itu ada di schema. Rincian koran butuh `users.username` — pakai allow-list kolom eksplisit, bukan `SELECT *` |
| B6 | Tidak ada index pada `transaksi.jumlah`, `utang.tanggal`, atau `tagihan_bayar.bulan` | `utang` dan `tagihan_bayar` cuma punya PK. Untuk data keluarga ini tidak mematikan, tapi **jangan menulis komentar "query ini sudah pakai index"** untuk ketiga kolom itu — memang tidak ada |
| B7 | `api/transaksi/+server.ts:32` — `limit` di-cap **500** | Jangan reuse endpoint itu untuk ambil data lengkap. Data terpotong diam-diam tanpa error |
| B8 | Helper yang sudah ada dan **jangan diduplikasi**: `bulanBerjalan()` (`lib/server/dashboard.ts:16`), `geserBulan()` (`:22`), `loadRingkasan()` (`:49`, sudah return `prevMasuk`/`prevKeluar` di `:93-94`), `SALDO_Sampai()` (`api/laporan/+server.ts:14`) | `SALDO_Sampai` jadi kunci rekonsiliasi R4 — lihat bagian [Rekonsiliasi](#rekonsiliasi--ini-yang-paling-mudah-salah) |

---

## R4 — Ekspor PDF rekening koran

**Paling bernilai, dan paling besar.** Ini satu-satunya tiket yang menghasilkan dokumen yang bisa disimpan dan dicetak.

### Yang diminta

Tombol **"Cetak rekening koran"** → buka dialog print browser → pilih "Save as PDF".

> **Revisi (setelah tiket pertama ditulis): PDF berisi rekening koran saja.** Grafik tren, 4 kartu angka, tabel kategori, transaksi terbesar, dan pergerakan saldo **tidak ikut dicetak** — semuanya ditandai `print:hidden` dan tetap utuh di layar. Correspondensi langsung dengan permintaan: "cukup hanya menampilkan transaksi detail perdompet, tidak perlu grafik, dan ringkasan lainnya".

> **Revisi kedua: pengguna memilih dompet sebelum mencetak.** Tidak lagi selalu semua dompet. Ada daftar centang per dompet (default semua tercentang), plus "Pilih semua". Kalau hanya satu dompet dipilih, namanya masuk ke judul cetakan. Kalau tidak ada yang dicentang, tombol cetak nonaktif.

Gaya rekening koran bank asli, plus yang tidak ada di bank: **kolom Dompet dan Kategori per baris**, supaya jelas pengeluaran itu dari dompet mana dan masuk kategori apa.

```
Rekening Koran — Kas Keluarga
Periode 25 Agt 2026 s.d. 30 Sep 2026            Dicetak 1 Okt 2026, 10:14

No  Tanggal     Dompet  Keterangan              Kategori      Masuk      Keluar        Saldo
                                    SALDO AWAL                              5.213.000
 1  26/08/2026  Kas K.  Gaji agustus            Gaji       7.713.655               5.213.000
 2  26/08/2026  Kas K.  Belanja pasar           Belanja                  125.000   5.088.000
 3  26/09/2026  Istri   Transfer ke Kas K.      Transfer                 700.000   2.710.000
 4  26/09/2026  Kas K.  Transfer dari Istri     Transfer     700.000               1.940.000
                                    SALDO AKHIR                             1.940.000
```

Kolom: **No · Tanggal · Dompet · Keterangan · Kategori · Masuk · Keluar** (7 kolom).

> **Revisi ketiga: kolom Saldo dihapus.** Kolom saldo running dihapus karena memunculkan angka negatif yang terbaca sebagai kesalahan: **22 baris di 5 dari 6 dompet** punya saldo negatif di tengah periode (mis. Khalif `-554.000` setelah "Lactogen 735g x 4", baru positif setelah pemasukan masuk). Angka itu benar — hanya urutan masuk/keluar — tapi membingungkan saat dicetak.
>
> Informasinya tidak hilang. Invarian yang menggantikannya sudah diverifikasi berlaku di semua 6 dompet dan di semua kombinasi pilihan dompet:
>
> ```
> SALDO AWAL + Σ(Masuk) − Σ(Keluar) = SALDO AKHIR
> ```
>
> Karena itu `SALDO AKHIR` diambil langsung dari `laporan.dompet[].akhir` (hasil `SALDO_Sampai` di server), bukan dari akumulasi berjalan — dan tidak ada lagi running balance di kode sama sekali. Konsekuensi yang perlu diterima: saldo di tengah periode tidak bisa dilihat. Kalau suatu saat dibutuhkan, cukup `saldo += r.delta` di loop yang sudah ada.

### Yang harus dikerjakan

| Tiket | Lokasi | Temuan |
|---|---|---|
| R4.1 | `api/laporan/+server.ts` | `api:` endpoint `GET /api/laporan?dari&sampai&rincian=koran` mengembalikan baris arus sudah terurut. **Jangan** bikin route baru — params ini gratis karena endpoint-nya sudah ada dan sudah auth |
| R4.2 | `api/laporan/+server.ts` | `⚠️:` gabung 4 sumber jadi **satu stream** `UNION ALL`: `masuk` (+jumlah), `keluar` (−jumlah), transfer keluar (`id_dompet_asal`, −jumlah), transfer masuk (`id_dompet_tujuan`, +jumlah). Transfer jadi **2 baris** — tanpa itu saldo tidak bisa direkonsiliasi |
| R4.3 | `api/laporan/+server.ts` | `⚠️:` kolom `sumber` (`1` = transaksi, `2` = transfer) + `urut` (`id`), lalu `ORDER BY tanggal, sumber, urut`. **Wajib.** 23 transaksi jatuh di `2026-09-26`; tanpa tiebreak deterministik urutan PDF berubah antar render dan saldo meloncat |
| R4.4 | `app/laporan/+page.svelte` | `ui:` **Saldo awal sudah ada di client.** `laporan.dompet[].awal` dikirim baris 77-78 yang memanggil `SALDO_Sampai(akhirSebelum)` (`api/laporan/+server.ts:14`). Jangan query ulang |
| R4.5 | `app/laporan/+page.svelte` | `ui:` ~~running balance~~ **dihapus** (lihat revisi). Yang tersisa hanya `no += 1` untuk nomor urut |
| R4.6 | `app/laporan/+page.svelte` | `ui:` **Nomor urut reset per dompet**, bukan global — supaya `No` di PDF sama dengan nomor baris di buku rekening |
| R4.7 | `app/laporan/+page.svelte` | `ui:` pecah jadi blok ~45 baris, tiap blok `<table>` sendiri dengan `<thead>` sendiri, dipisah `break-after-page`. **Alasan:** browser **tidak** mengulang `<thead>` di PDF dengan andal — header harus diulang manual, itu syarat "keterangan selalu terbaca" |
| R4.8 | `app/laporan/+page.svelte` | `ui:` elemen yang hanya untuk layar diberi `print:hidden` — judul halaman, deskripsi, picker tanggal, tombol `Tampilkan Laporan`, **seluruh section ringkasan**, dan kartu pemilih dompet. Judul tombol "Cetak rekening koran" (bukan "Ekspor PDF") karena memang bukan file .pdf yang diunduh, tapi dialog print |
| R4.9 | `app/+layout.svelte` | `ui:` `print:hidden` pada `header` sticky (`:72`), `<aside>` sidebar (`:90`), dan `<nav>` bottom (`:118-120`). Tanpa ini PDF memuat seluruh chrome navigasi |
| R4.10 | `app.css` | `ui:` `print-color-adjust: exact` (atau `-webkit-print-color-adjust`) di blok `@media print` — tanpa ini batang tren dan badge warna jadi putih kosong. Tambahkan `break-inside: avoid` untuk baris tabel agar tidak terbelah antar halaman |
| R4.11 | `app/laporan/+page.svelte` | `ui:` header PDF `print-only`: judul, periode, dan "Dicetak {tanggal}". Kalau cuma satu dompet dipilih, judulnya jadi `Rekening Koran — {nama}`; kalau lebih dari satu, tambahkan "N dompet" |
| R4.12 | `app/laporan/+page.svelte` | **Revisi — pemilih dompet.** `dompetPilih: number[]`, di-reset ke semua id setiap `muat()`. Checkbox sungguhan (`sr-only` + `<label>`) di dalam kartu bertanda `print:hidden`, dengan jumlah baris per dompet sebagai bantuan. `blokKoran` melewati dompet yang tidak dicentang, jadi penyaringan terjadi di derivasi — bukan dengan menyembunyikan blok lewat CSS, supaya yang tidak terpilih tidak pernah ikut ter-render |
| R4.13 | `app.css` | **Revisi — hapus `break-before: page` untuk `.koran`.** Dulu dibutuhkan karena ringkasan mendahului koran. Sekarang ringkasan `print:hidden`, jadi blok koran adalah halaman pertama cetakan; `break-before` akan menyisipkan satu halaman kosong |

### Rekonsiliasi — ini yang paling mudah salah

Baris **SALDO AWAL** memakai `laporan.dompet[].awal`, dan baris **SALDO AKHIR** memakai `laporan.dompet[].akhir`. Keduanya berasal dari `SALDO_Sampai` (`api/laporan/+server.ts`), yang menghitung transaksi **dan** transfer.

Delta tiap baris harus memakai rumus yang **sama persis**:

```sql
-- transaksi
CASE WHEN tipe = 'masuk' THEN jumlah ELSE -jumlah END
-- transfer asal
-jumlah
-- transfer tujuan
+jumlah
```

Karena rumus identik, `awal + Σ(Masuk) − Σ(Keluar)` untuk setiap dompet **wajib sama dengan** `akhir`. Inilah yang menggantikan kolom Saldo. Kalau tidak cocok, itu bug — jangan ditambal dengan pembulatan atau `Math.abs`.

Sebelum kolom Saldo dihapus, ada syarat yang lebih ketat: saldo baris terakhir tiap blok harus cocok dengan `SALDO_Sampai` **bahkan setelah pemecahan halaman**. Itu tetap berlaku secara tidak langsung, karena `SALDO_AKHIR` di blok terakhir diambil dari angka server yang sama.

---

## R1 — Pemasukan per kategori

Sekarang hanya pengeluaran yang dipecah per kategori, padahal `kategori.tipe` sudah punya nilai `'masuk'` dan UI selector sudah memfilternya. Pertanyaan "dari mana uang datang?" tidak bisa dijawab sekarang.

| Tiket | Lokasi | Temuan |
|---|---|---|
| R1.1 | `api/laporan/+server.ts` | `api:` tambahkan query `GROUP BY kategori.id`, `WHERE tipe = 'masuk'`, dengan `leftJoin` kategori + `COALESCE(..., 'Tanpa kategori')` (B3). Kembalikan `kategoriId` **dan** `kategori` — id untuk key, nama untuk tampilan |
| R1.2 | `api/laporan/+server.ts` | `⚠️:` **group by `kategori.id`, bukan `kategori.nama`** (B4). `nama_kategori` tidak punya constraint UNIQUE, dan "Lainnya" memang ada 2 baris di DB (satu `masuk`, satu `keluar`) — jadi `groupBy(kategori.nama)` menggabungkan dua kategori berbeda |
| R1.3 | `app/laporan/+page.svelte` | `ui:` section "Pemasukan per kategori", disisipkan setelah "Pengeluaran per kategori" (anchor: section mulai `:272`, section berikutnya "Pergerakan saldo tiap dompet" mulai `:308`) |
| R1.4 | `app/laporan/+page.svelte` | `ui:` pakai pola yang **sudah ada** — tabel baris = kategori, kolom = `bulanTerpakai`, total di kanan. Jangan buat pola markup baru; `kategoriTerpakai` (`$derived`, `:111-122`) sudah menyelesaikan sisi keluar |

Data sekarang: Gaji Rp 7.713.655 (2 trx), Lainnya Rp 4.435.989 (3 trx).

---

## R2 — Top transaksi terbesar

Hampir selalu ada satu pengeluaran besar yang tidak disadari. Murah: satu query tanpa JOIN wajib.

| Tiket | Lokasi | Temuan |
|---|---|---|
| R2.1 | `api/laporan/+server.ts` | `api:` `ORDER BY jumlah DESC LIMIT 10` di dalam rentang periode, **tanpa JOIN**. Filter `tipe` opsional — default tampilkan `keluar`, karena itu yang dicari orang. Sisa 9 kolom label diambil lewat `leftJoin` (B3) ke `kategori`, `dompet`, `users` — allow-list eksplisit, bukan `SELECT *` (B5) |
| R2.2 | `app/laporan/+page.svelte` | `ui:` section "Transaksi terbesar", disisip setelah R1. Tampilkan tanggal, kategori, dompet, catatan, jumlah — jumlah rata-kanan |
| R2.3 | — | `⚠️:` **tidak ada index pada `transaksi.jumlah`** (B6). PostgreSQL akan scan rentang tanggal lalu top-N sort. Untuk 101 baris ini instan, tapi **jangan** tulis komentar "pakai index". Kalau nanti jadi keluhan, kandidat index-nya `(tanggal, jumlah)` — bukan `(tanggal DESC)`, itu sudah bisa di-backward-scan dari `transaksi_tanggal_id_idx` |

---

## R3 — Perbandingan antar periode

Pertanyaan yang paling sering ditanya pasangan: "kita lebih boros atau tidak bulan ini?"

| Tiket | Lokasi | Temuan |
|---|---|---|
| R3.1 | — | **Keputusan semantik — tulis eksplisit di kode.** "Periode sebelumnya" = rentang sepanjang **N hari ke belakang** dengan N = jumlah hari rentang saat ini. **Bukan** "bulan kalender sebelumnya", karena `/api/laporan` menerima rentang hingga 6 bulan (`dari`/`sampai` bebas), jadi "6 bulan lalu" tidak punya padanan bulan kalender yang masuk akal |
| R3.2 | `api/laporan/+server.ts` | `api:` hitung `masuk`/`keluar` periode sebelumnya dengan `and(gte(tanggal, dariSebelumnya), lte(tanggal, sebelum))` — **rentang, bukan `substring()`**. `lib/server/dashboard.ts:29-30` sudah mendokumentasi alasannya: `substring()` tidak bisa memakai `transaksi_tanggal_id_idx` |
| R3.3 | `api/laporan/+server.ts` | `api:` **cek ulang apakah fitur ini sudah ada.** `loadRingkasan()` (`lib/server/dashboard.ts:49`) sudah mengembalikan `prevMasuk`/`prevKeluar` (`:93-94`) dan sudah dipakai `app/+page.svelte:96-97`. Kalau R3 cukup "bulan ini vs bulan lalu" untuk rentang 1 bulan, **gunakan `loadRingkasan` dan jangan query baru**. Kalau memang butuh rentang N hari, tambahkan hanya selisihnya |
| R3.4 | `app/laporan/+page.svelte` | `ui:` tampilkan delta persen + nominal di bawah 4 kartu angka, hanya kalau periode saat ini = 1 bulan penuh. Untuk rentang 6 bulan, label "vs sebelumnya" membingungkan — sembunyikan |
| R3.5 | — | `ui:` helper `mom()` sudah ada di `app/+page.svelte:69` tapi **lokal**. Putuskan saat implementasi: ekstrak ke `$lib/format.svelte` (satu root dengan T6 di `TIKET.md`) atau duplikasi 4 baris. Kalau diekstrak, T6 ikut beres |

Percent change butuh penanganan divide-by-zero: `prev = 0` → jangan tampilkan `Infinity%`, tampilkan "baru" atau `-`.

---

## Yang ditunda (dan kenapa)

Tidak masuk tiket, supaya tidak hilang tapi tidak dikerjakan sekarang:

| Ide | Alasan ditunda |
|---|---|
| Rekap tagihan per periode | Datanya **2 tagihan, Rp 870.000, hanya 1 bulan terbayar (2026-09)**. worse, `tagihan_bayar.bulan` itu `varchar(7)` `YYYY-MM` — **granularitas bulanan**, jadi rentang `dari`/`sampai` yang parsial tidak bisa direpresentasikan. Kalau dipaksakan, angka "belum lunas" akan salah diam-diam. Selain itu tidak ada kolom `tanggal_jatuh` maupun `sudah_bayar` — jatuh tempo harus diturunkan dari `tagihan.hari` (1–31) dan status dihitung dari keberadaan baris di `tagihan_bayar` |
| Rekap utang/piutang | **0 piutang** di DB. Total/sisa utang memang bisa dijawab satu query tanpa JOIN (`sisa = jumlah - terbayar`, `lunas = terbayar >= jumlah` — `check` di schema sudah menjamin `terbayar <= jumlah`), tapi **"terbayar bulan ini" tidak bisa dijawab**: tidak ada `tanggal_bayar` dan tidak ada tabel pembayaran, hanya agregat `terbayar`. Sumber satu-satunya pembayaran adalah teks `catatan` (`'Bayar utang ke …'`) + kategori by-name — rapuh, dan tidak menutupi pembayaran yang tanggalnya beda dari tanggal pencatatan utang |
| Grafik pie/donut | Bar chart + tabel sudah cukup, dan pie chart sulit dibaca di HP. Tidak menambah insight |
| Proyeksi / forecast | Data baru 2 bulan. Tren 2 titik bukan prediksi |
| Kolom pencatat per transaksi | `PRODUCT.md` menandai ini sebagai *"open product decision: apakah pencatat per orang ditampilkan di layar"*. Saya tidak akan memutuskan itu |
| Export CSV | Diminta "PDF saja". Kalau nanti dibutuhkan: **jangan** reuse `api/transaksi` (B7), dan `catatan` wajib escaping RFC 4180 karena bisa berisi koma, `"`, dan newline |

---

## Urutan pengerjaan

**R4 → R2 → R1 → R3.**

Alasan: R4 menentukan kolom apa yang dipakai R2 dan R1 (ketiganya menampilkan `Dompet`, `Kategori`, `tanggal`, `jumlah`). Kalau R1/R2 dikerjakan dulu, besar-besaran markup-nya dibongkar pas R4 tiba. R3 paling banyak keputusan semantik (R3.1, R3.3), jadi paling mudah salah dan paling perlu diuji manual.

---

## Catatan implementasi

Keempat tiket sudah dikerjakan. Yang berikut bukan permintaan baru — ini yang **benar-benar terjadi** saat mengerjakan, supaya pembaca berikutnya tidak mengulangi kesalahan yang sama.

### Tiga bug yang hanya ketahuan karena syarat lulus dijalankan

Semuanya lolos `svelte-check` dan tetap salah. Tidak ada satu pun yang ketahuan tanpa tes rekonsiliasi.

| Bug | Gejalanya | Akar masalah |
|---|---|---|
| `delta` transaksi `keluar` **positif** | Semua saldo di PDF meleset Rp 11.859.632 | Cabang transaksi di `ARUS` menggabungkan `masuk` dan `keluar` jadi satu `SELECT` tanpa `WHERE tipe`, sehingga `jumlah` tidak pernah dibalik tandanya. `CASE WHEN tipe='masuk' THEN jumlah ELSE -jumlah END` sekarang wajib ada |
| Nama kolom Drizzle terkirim mentah | `column k.nama does not exist` saat runtime | Di dalam literal `sql\`\``, Drizzle hanya memetakan kolom yang **di-interpolasi**. Teks SQL yang ditulis tangan dikirim apa adanya, jadi harus pakai `nama_kategori` / `nama_dompet`, bukan `kategori.nama` / `dompet.nama` |
| Keterangan transfer jadi "Transfer" polos | Kolom Keterangan kehilangan "Transfer ke Dapur" | `NULLIF(f.catatan, '')` menghasilkan NULL saat catatan kosong, lalu `CASE` jatuh ke cabang transaksi dan memakai `kategori`. Keterangan hasil generate harus punya prioritas sendiri |

Bug kedua juga berarti `svelte-check` **tidak bisa** dipakai sebagai verifikasi tunggal untuk query: dia memeriksa tipe TypeScript, bukan SQL.

### R3.1 sempat salah, lalu diperbaiki

Deteksi "bulan kalender penuh" awalnya hanya memeriksa `tanggal_awal = tanggal 1` dan `tanggal_akhir = akhir bulan`. Itu salah: rentang `2026-08-01..2026-09-30` (61 hari) ikut terira bulan penuh dan dibanding dengan Juli — persis kasus yang R3.1 sendiri bilang harus dihindari. Perbaikannya menambahkan syarat kedua tanggal berada di bulan dan tahun yang sama. Delapan kasus (bulan penuh, 2 bulan, tahun penuh, Feb tahun kabis, rentang 11 hari, bulan tidak penuh) sekarang lolos.

### Penyimpangan dari tiket, dan alasannya

| Ticket bilang | Kenyataannya | Alasan |
|---|---|---|
| R3.5 — ekstrak ke `$lib/format.svelte` | Dibuat `$lib/format.ts` | Isinya `namaBulan`, `namaBulanTahun`, `mom` — tanpa markup. File `.svelte` akan menyesatkan karena SvelteKit menganggapnya komponen |
| R1.4 — "jangan buat pola markup baru" | Markup tabel kategori diekstrak ke `$lib/components/RekapKategori.svelte` | Sisi masuk dan sisi keluar butuh tabel yang identik. Menyalin 27 baris dua kali persis apa yang R1.4 minta untuk dihindari |
| — | `rupiah()` diubah memakai `Intl.NumberFormat` yang di-cache; ditambah `angka()` | Rekening koran memanggil format angka ~340× dalam satu render. `toLocaleString` membangun ulang formatter tiap panggilan |

### Perbaikan di luar tiket

- `perKategori` di server **dan** client kini `GROUP BY kategori.id` dengan `leftJoin` + `COALESCE(..., 'Tanpa kategori')`. Semula `innerJoin` dan pengelompokan lewat nama di kedua sisi — jebakan B3 dan B4 hanya setengah diperbaiki. `innerJoin` kategori sudah tidak ada lagi di `api/laporan`.
- `iso()` di server memakai `getFullYear`/`getMonth`/`getDate`, bukan `toISOString()`. `toISOString` memakai UTC dan bisa menggeser satu hari untuk zona waktu di belakang Greenwich.

### Rekonsiliasi tetap benar saat sebagian dompet dicetak

Ini yang perluDijamin oleh R4.12: memfilter dompet tidak boleh merusak saldo. `SALDO_Awal` diambil dari `laporan.dompet[].awal` (rumus `SALDO_Sampai`) dan `delta` per baris tidak bergantung pada dompet lain, jadi setiap dompet berdiri sendiri. Terverifikasi untuk lima skenario:

```
pilih semua        6 dompet  113 baris  7 blok   -> 6/6 cocok
hanya Kas Keluarga 1 dompet   67 baris  2 blok   -> cocok
hanya Gym          1 dompet    5 baris  1 blok   -> cocok
Kas + Dapur        2 dompet   79 baris  3 blok   -> 2/2 cocok
tidak ada dipilih  0 dompet    0 baris  0 blok   -> tombol nonaktif
```

---

## Syarat lulus

1. `bun --filter web check` → 0 error.
2. **Rekonsiliasi (setelah kolom Saldo dihapus):** untuk setiap dompet yang dicetak, `SALDO AWAL + Σ(Masuk) − Σ(Keluar) = SALDO AKHIR`, dan `SALDO AKHIR` yang tercetak sama persis dengan kartu "Saldo akhir" di layar. Diverifikasi untuk 4 kombinasi pilihan dompet (semua, Kas saja, Gym saja, Kas+Dapur) — 6/6, 1/1, 1/1, 2/2 lolos.
3. **Jumlah baris PDF** untuk periode penuh Agt–Sep 2026 = **125**: 101 transaksi + 12 baris transfer (6×2) + 6 baris SALDO AWAL + 6 baris SALDO AKHIR. (Angka 119 yang tertulis di versi pertama tiket ini lupa menghitung baris SALDO AKHIR — contoh format di atas memang menampilkannya.) Kalau muncul ≤ 500 angka ganjil, cek B7.
   Dengan **`rincian=koran` + semua dompet**, hasil terverifikasi: 113 baris transaksi + 12 baris SALDO AWAL/AKHIR, 7 blok halaman (Kas Keluarga pecah 2 halaman karena 67 baris).
4. **Transfer:** tiap pasangan menghasilkan 2 baris (satu keluar di dompet asal, satu masuk di dompet tujuan), dan total saldo **tidak berubah** karena transfer.
5. **Header tabel terulang** di setiap halaman PDF — bukan cuma halaman pertama.
6. **Urutan deterministik:** render PDF dua kali menghasilkan urutan baris identik (uji dengan 23 transaksi di `2026-09-26`).
7. **Setiap dompet punya SALDO AWAL sendiri** yang benar, bukan mewarisi saldo awal dompet sebelumnya.
8. Tampilan layar tidak berubah sama sekali saat print style aktif (sidebar/nav/picker/seluruh ringkasan tidak bocor ke PDF).
9. **PDF hanya berisi rekening koran** — tidak ada grafik tren, kartu angka, tabel kategori, transaksi terbesar, atau pergerakan saldo. Verifikasi: seluruh elemen layar punya `print:hidden`, dan hanya `<header>` + `<section class="koran">` yang punya `print:block`.
10. **Tidak ada halaman kosong** sebelum blok koran pertama (`break-before: page` untuk `.koran` sudah dihapus pada revisi kedua).
11. **Tidak ada angka negatif** di cetakan. Kolom Saldo dihapus justru karena 22 baris saldo running negatif; sisa angka negatif di koran harus nol.

## Batasan yang perlu diketahui sebelum menyetujui R4

- **Bukan file `.pdf` yang diunduh.** Tombol membuka dialog print; pengguna memilih "Save as PDF" sendiri. Konsekuensi: pilihan kertas (A4/F4) ada di dialog itu, dan nama file ditentukan browser — **tidak bisa** diberi nama seperti `Rekening-Kas-Keluarga-Agt2026.pdf` tanpa pustaka PDF.
- **Margin bisa beda sedikit** antar browser (Safari vs Chrome). Tidak ada cara mengunci Except `@page` yang konsisten tanpa membakar halaman A4 penuh.
- **Jumlah halaman ≈ 3–4** untuk periode 6 bulan (119 baris, ~45 baris/halaman). Tidak adaEP yang progress atau Estimasi — browser yang-atur.
- **Nol dependency baru.** Semua pakai Tailwind varian `print:` (bawaan v4) dan `window.print()`. Kalau nanti butuh file `.pdf` asli dengan nama dan margin terkunci, itu keputusan baru: tambah `jspdf` (~200–500 KB) dan tabel harus dirakit manual baris-per-baris.